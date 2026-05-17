# Vendor Inventory Sync Pipeline — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan PR-by-PR. Each phased commit is its own sub-plan with checkbox tracking generated at the start of that PR.

**Goal:** Build the first phase of an automated wheels-and-tires storefront by adding a single-vendor inventory sync pipeline (CSV-over-SFTP, diff-based, queue-driven) into the existing Medusa 2.13.6 backend.

**Architecture:** A new Medusa business module `vendor-sync` owns four staging/state tables and exposes a service that orchestrates a four-stage pipeline (fetch → stage → diff → apply). Each per-SKU apply is enqueued on a BullMQ queue and executes a Medusa 2.0 workflow that composes shipped core flows (`batchProductsWorkflow`, `batchInventoryItemLevelsWorkflow`, `updateProductsWorkflow`). A `VendorAdapter` interface fronts the parsing layer so future vendors plug in without rewriting the pipeline. Raw CSVs are archived to MinIO. A 12-hourly cron triggers runs; the first runs are gated behind a dry-run script and threshold guard.

**Tech Stack:** TypeScript 5.9, Node 22, pnpm 9.10, MedusaJS 2.13.6 (MikroORM + workflows-sdk + core-flows), Postgres, Redis (via existing `@medusajs/event-bus-redis` + `@medusajs/workflow-engine-redis`), BullMQ 5 on the same Redis, MinIO (existing module), papaparse for streaming CSV, zod for input validation, ssh2-sftp-client (later, behind interface). No new build tooling; reuses `medusa develop` / `medusa build` / `medusa exec`.

---

## 1. Locked Decisions

These come from `CLAUDE.md`, the user's architectural constraints in the brief, and the eight answered open questions (see `VENDOR_SYNC_OPEN_QUESTIONS.md`).

| # | Decision | Source |
|---|---|---|
| A1 | Diff-based sync, never full-resync. Three SQL queries against `vendor_product_current` × `vendor_feed_staging`. | Brief §"Architectural decisions" |
| A2 | Postgres staging tables hold the parsed feed; SQL drives the diff. | Brief |
| A3 | SHA256 content hash per normalized row decides "unchanged vs changed". | Brief |
| A4 | BullMQ on the existing Redis for the apply queue. Per-SKU jobs. | Brief |
| A5 | Medusa 2.0 workflows wrap every catalog mutation. No direct service calls from queue workers. | Brief |
| A6 | `VendorAdapter` interface from day one. Phase 1 implements only Teraflex. `submitPurchaseOrder` is stubbed and throws `NotImplemented`. | Brief |
| A7 | Raw feeds archived to MinIO at `vendor-feeds/{vendor}/{YYYY-MM-DD-HHmm}.csv`. Never deleted. Replayable. | Brief |
| A8 | Warehouse codes become Medusa `StockLocation`s. Matched by `metadata.vendor_warehouse_code`, never by display name. | Brief |
| A9 | Natural key is `part_number` (zero-padded string). Stored on Medusa product as `external_id` and `metadata.vendor_part_number`. | Brief |
| A10 | If `discontinued_count / current_count > VENDOR_SYNC_DISCONTINUE_THRESHOLD` (default 0.05), the run pauses with status `awaiting_approval` and requires admin approval to apply. | Brief |
| Q1 | Selling price = `MSRP_USD` for every SKU. `MAP_USD` stored in `metadata.vendor_map_usd` but not enforced as a floor. | OQ1 |
| Q2 | **Rows with empty `ImageURL` are skipped entirely** — not staged, not diffed, not applied. Products that pass the filter get the vendor CDN URL stored as `thumbnail` and `images[0].url` (pass-through, no download). Future phase switches to MinIO download. | OQ2 (revised) |
| Q3 | Brand modeled as one Medusa `product_collection` per brand. Idempotent fetch-or-create. | OQ3 |
| Q4 | Stock locations auto-created as `Warehouse <code>` on first appearance of a new warehouse code. Match by `metadata.vendor_warehouse_code`. | OQ4 |
| Q5 | Phase 1 reads CSV from a local path (`VENDOR_TERAFLEX_FEED_PATH`). SFTP adapter is stubbed behind `VendorAdapter.fetch()`. | OQ5 |
| Q6 | First run via `pnpm vendor-sync:dry-run teraflex` → review → `pnpm vendor-sync:apply <run-id>` → only then enable the cron. | OQ6 |
| Q7 | Cron `0 */12 * * *` with skip-if-running guard and `RunDate` short-circuit. | OQ7 |
| Q8 | Bootstrap step ensures a `United States` region (USD, country `us`) attached to the existing `Default Sales Channel`. | OQ8 |
| Q9 | Phase 1 implements both the wheel adapter (`teraflex-wheels`) and the tire adapter (`teraflex-tires`). Same pipeline, two CSV schemas, two independent runs. | OQ9 |
| Q10 | Products organized into two top-level Medusa product categories: `Wheels` and `Tires`. Brand remains a product collection. Category tree is reserved for future sub-categories (by size, bolt pattern, tire type). | OQ10 |
| Q11 | Wheel and tire feeds registered as two separate adapter instances (`teraflex-wheels`, `teraflex-tires`), each with its own `vendorCode`, feed path, and dry-run/apply cycle. | OQ11 |
| Q12 | Tire CSV `Division` column stored as `metadata.vendor_division`. `InvOrderType = 'SO'` (special order) treated identically to `N2` for display and ordering purposes. | OQ12 |

---

## 2. Module Layout

All paths are relative to the repo root. New files only — no existing file is replaced, only the eight listed below are modified.

```
backend/src/modules/vendor-sync/
  index.ts                                # Module() definition exporting VendorSyncService
  service.ts                              # VendorSyncService (orchestrator + CRUD)
  README.md                               # four-step recipe (env, dry-run, apply, enable cron)
  models/
    vendor-feed-run.ts                    # data model for vendor_feed_run
    vendor-feed-staging.ts                # data model for vendor_feed_staging
    vendor-stock-staging.ts               # data model for vendor_stock_staging
    vendor-product-current.ts             # data model for vendor_product_current
  adapters/
    types.ts                              # VendorAdapter, NormalizedRecord (discriminated union), ParsedRow, VendorFeedDescriptor
    registry.ts                           # resolveAdapter(vendorCode) -> VendorAdapter
    teraflex-wheels/
      index.ts                            # TeraflexWheelAdapter (vendorCode: 'teraflex-wheels')
      parse.ts                            # streaming CSV parse for wheel schema
      normalize.ts                        # ParsedRow -> WheelNormalizedRecord
      schema.ts                           # zod schemas for wheel raw row
    teraflex-tires/
      index.ts                            # TeraflexTireAdapter (vendorCode: 'teraflex-tires')
      parse.ts                            # streaming CSV parse for tire schema
      normalize.ts                        # ParsedRow -> TireNormalizedRecord (tire size parsed from PartDescription)
      schema.ts                           # zod schemas for tire raw row
  pipeline/
    fetch.ts                              # fetch -> archive in MinIO -> return descriptor
    stage.ts                              # parse + insert into vendor_feed_staging and vendor_stock_staging
    diff.ts                               # three SQL queries returning new/changed/discontinued sets
    apply.ts                              # enqueue per-SKU jobs in correct order
    bootstrap.ts                          # ensure region, sales channel, brand collections, stock locations
  workflows/
    upsert-vendor-product.ts              # composes createProductsWorkflow or updateProductsWorkflow
    upsert-vendor-stock.ts                # composes batchInventoryItemLevelsWorkflow
    discontinue-vendor-product.ts         # composes updateProductsWorkflow (status=draft, metadata)
  queue/
    setup.ts                              # BullMQ Queue + QueueEvents + Worker registration
    workers/
      apply-worker.ts                     # consumes 'upsert-product' | 'upsert-stock' | 'discontinue-product'
  utils/
    hash.ts                               # canonicalJsonHash(record) -> SHA256 hex
    archive.ts                            # uploadFeedToMinio(buffer, vendorCode, timestamp) -> archiveKey
    parse-helpers.ts                      # parseSize, parseBoltPattern, parseVendorDate, parsePrice
    metrics.ts                            # structured-log emitters
  migrations/
    Migration20260517000001.ts            # vendor_feed_run table
    Migration20260517000002.ts            # vendor_feed_staging table
    Migration20260517000003.ts            # vendor_stock_staging table
    Migration20260517000004.ts            # vendor_product_current table
  __fixtures__/
    wheels-small.csv                      # 5 rows: 2 ST, 3 N2, mix of warehouses
    wheels-small-v2.csv                   # same with 1 new, 1 changed price, 1 changed qoh, 1 removed
    tires-small.csv                       # 5 rows: 2 ST, 2 N2, 1 SO, mix of warehouses, real ImageURLs
    tires-small-v2.csv                    # same with 1 new, 1 changed, 1 removed
  __tests__/
    wheel-parse.test.ts
    wheel-normalize.test.ts
    tire-parse.test.ts
    tire-normalize.test.ts
    hash.test.ts
    diff.test.ts
    apply.integration.test.ts

backend/src/jobs/
  vendor-sync-tick.ts                     # cron entry point (0 */12 * * *)

backend/src/api/admin/vendor-sync/
  runs/route.ts                           # GET list, POST trigger
  runs/[id]/route.ts                      # GET detail
  runs/[id]/approve/route.ts              # POST approve paused run
  runs/[id]/cancel/route.ts               # POST cancel
  runs/[id]/replay/route.ts               # POST replay all SKUs from a completed run
  skus/[partNumber]/replay/route.ts       # POST replay one SKU using its latest staging row

backend/src/scripts/
  vendor-sync-dry-run.ts                  # medusa exec wrapper: fetch + stage + diff, no apply
  vendor-sync-apply.ts                    # medusa exec wrapper: apply a previously-staged run
```

Modified files:

```
backend/src/lib/constants.ts              # add vendor-sync env exports
backend/medusa-config.js                  # conditional module registration block
backend/package.json                      # add bullmq, papaparse, zod, ssh2-sftp-client (last is dev-installed but unused in Phase 1)
backend/.env.template                     # document new vars
backend/jest.config.js                    # new file: jest config for module tests (does not exist today)
```

The two added pnpm scripts:

```json
{
  "scripts": {
    "test:sync": "jest --config jest.config.js src/modules/vendor-sync",
    "vendor-sync:dry-run": "medusa exec ./src/scripts/vendor-sync-dry-run.ts",
    "vendor-sync:apply": "medusa exec ./src/scripts/vendor-sync-apply.ts"
  }
}
```

---

## 3. Data Model

All four tables live in the `vendor-sync` module and use Medusa's MikroORM data-model DSL. Migrations are auto-generated via `medusa db:generate vendor-sync`. The SQL below is the contract — the generated migration must produce equivalent DDL.

### 3.1 `vendor_feed_run`

One row per ingestion attempt. Drives the state machine.

```sql
CREATE TABLE vendor_feed_run (
  id                    TEXT PRIMARY KEY,        -- ulid generated in TS land
  vendor_code           TEXT NOT NULL,
  source_filename       TEXT NOT NULL,
  source_archive_key    TEXT,                    -- MinIO object key, set after archive upload
  run_date_vendor       TIMESTAMPTZ,             -- parsed from CSV RunDate column
  row_count             INTEGER DEFAULT 0,
  skipped_no_image_count INTEGER DEFAULT 0,      -- rows dropped because ImageURL was empty
  hash_match_count      INTEGER DEFAULT 0,       -- rows with content_hash matching vendor_product_current
  new_count             INTEGER DEFAULT 0,
  changed_count         INTEGER DEFAULT 0,
  discontinued_count    INTEGER DEFAULT 0,
  status                TEXT NOT NULL,           -- see status enum below
  approved_by           TEXT,                    -- admin user id, set on approve
  approved_at           TIMESTAMPTZ,
  error_message         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_feed_run_vendor_status ON vendor_feed_run (vendor_code, status);
CREATE INDEX idx_vendor_feed_run_created_at    ON vendor_feed_run (created_at DESC);
```

Status values: `'fetching' | 'staging' | 'diffing' | 'awaiting_approval' | 'applying' | 'completed' | 'failed' | 'cancelled'`.

State transitions are linear with one branch:

```
fetching -> staging -> diffing -> [awaiting_approval -> applying | applying] -> completed
                                                                  \
                                                                   -> failed
                                                                   -> cancelled
```

### 3.2 `vendor_feed_staging`

Parsed rows for the in-flight run. Cleared per `(vendor_code)` at the start of the next run, not on completion (so a completed run's diff remains queryable until the next ingestion).

```sql
CREATE TABLE vendor_feed_staging (
  id              TEXT PRIMARY KEY,                 -- ulid
  run_id          TEXT NOT NULL REFERENCES vendor_feed_run(id) ON DELETE CASCADE,
  vendor_code     TEXT NOT NULL,
  part_number     TEXT NOT NULL,
  row_json        JSONB NOT NULL,                   -- full original row, untouched
  normalized      JSONB NOT NULL,                   -- NormalizedRecord shape (see §4)
  content_hash    TEXT NOT NULL,                    -- SHA256 hex of normalized
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_vfs_run_part            ON vendor_feed_staging (run_id, part_number);
CREATE INDEX        idx_vfs_vendor_part        ON vendor_feed_staging (vendor_code, part_number);
CREATE INDEX        idx_vfs_run_content_hash   ON vendor_feed_staging (run_id, content_hash);
```

### 3.3 `vendor_stock_staging`

Exploded per-warehouse rows for the in-flight run. Only rows with `qoh > 0` are inserted (a missing row implies zero for that warehouse).

```sql
CREATE TABLE vendor_stock_staging (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES vendor_feed_run(id) ON DELETE CASCADE,
  vendor_code     TEXT NOT NULL,
  part_number     TEXT NOT NULL,
  warehouse_code  TEXT NOT NULL,
  qoh             INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_vss_run_part_wh ON vendor_stock_staging (run_id, part_number, warehouse_code);
CREATE INDEX        idx_vss_run_part    ON vendor_stock_staging (run_id, part_number);
```

### 3.4 `vendor_product_current`

Last canonical applied state per `(vendor_code, part_number)`. The `content_hash` is the single source of truth for "do we need to apply this row?" — it is only advanced when the apply step succeeds (architectural anti-pattern #5: never advance the hash before the apply succeeds).

```sql
CREATE TABLE vendor_product_current (
  id                  TEXT PRIMARY KEY,
  vendor_code         TEXT NOT NULL,
  part_number         TEXT NOT NULL,
  content_hash        TEXT NOT NULL,
  medusa_product_id   TEXT,                       -- set after first successful create
  medusa_variant_id   TEXT,                       -- the single variant per part_number
  inventory_item_id   TEXT,                       -- the variant's inventory item
  normalized          JSONB NOT NULL,             -- last applied NormalizedRecord
  last_seen_run_id    TEXT REFERENCES vendor_feed_run(id) ON DELETE SET NULL,
  applied_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discontinued_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_vpc_vendor_part      ON vendor_product_current (vendor_code, part_number);
CREATE INDEX        idx_vpc_medusa_product  ON vendor_product_current (medusa_product_id);
CREATE INDEX        idx_vpc_vendor_hash     ON vendor_product_current (vendor_code, content_hash);
CREATE INDEX        idx_vpc_discontinued    ON vendor_product_current (vendor_code, discontinued_at) WHERE discontinued_at IS NULL;
```

### 3.5 The three diff queries

Run after staging is finished and `diffing` status is set.

```sql
-- new: in staging, not in current
SELECT s.part_number
FROM   vendor_feed_staging s
LEFT   JOIN vendor_product_current c
       ON c.vendor_code = s.vendor_code AND c.part_number = s.part_number
WHERE  s.run_id = $1
AND    c.id IS NULL;

-- changed: in staging AND in current, hash differs
SELECT s.part_number
FROM   vendor_feed_staging s
JOIN   vendor_product_current c
       ON c.vendor_code = s.vendor_code AND c.part_number = s.part_number
WHERE  s.run_id = $1
AND    c.content_hash <> s.content_hash
AND    c.discontinued_at IS NULL;

-- discontinued: in current, not in staging, not already discontinued
SELECT c.part_number
FROM   vendor_product_current c
LEFT   JOIN vendor_feed_staging s
       ON s.vendor_code = c.vendor_code AND s.part_number = c.part_number AND s.run_id = $1
WHERE  c.vendor_code = $2
AND    s.id IS NULL
AND    c.discontinued_at IS NULL;
```

The first two are O(staging size) with the unique index on `(run_id, part_number)`; the third uses the partial index on `discontinued_at IS NULL`. On a 45k-row feed these run in well under a second.

---

## 4. Adapter Interface

`backend/src/modules/vendor-sync/adapters/types.ts`:

```typescript
import { Readable } from 'stream'

/**
 * Describes a freshly fetched feed file before parsing. Returned by
 * VendorAdapter.fetch(). archiveKey is the MinIO object key under
 * the vendor-feeds bucket where the raw bytes are stored.
 */
export interface VendorFeedDescriptor {
  vendorCode: string
  archiveKey: string
  sourceFilename: string
  byteLength: number
  fetchedAt: Date
}

/**
 * One raw row from the CSV after header detection. warehouseColumns
 * lists the dynamically-detected numeric column headers (e.g. '1001',
 * '1058') so the normalize step does not need to re-detect them.
 */
export interface ParsedRow {
  partNumber: string
  raw: Record<string, string>
  warehouseColumns: string[]
}

/**
 * Common fields shared by all product types. Every normalized record
 * includes these. Adding a field here is a breaking hash change:
 * every row will appear "changed" in the next run.
 */
export interface NormalizedRecordBase {
  partNumber: string
  vendorCode: string
  title: string
  brand: string
  imageUrl: string | null
  invOrderType: 'ST' | 'N2' | 'SO'
  totalQoh: number
  msrpUsd: number
  mapUsd: number
  runDateVendor: Date
  stockByWarehouse: Record<string, number>
}

export interface WheelNormalizedRecord extends NormalizedRecordBase {
  productType: 'wheel'
  displayStyleNo: string | null
  finish: string | null
  diameterIn: number
  widthIn: number
  boltCount: number
  boltCircleIn: number
  offsetMm: number
  centerBoreMm: number | null
  loadRatingLb: number | null
  shippingWeightLb: number | null
  style: string | null
}

export interface TireNormalizedRecord extends NormalizedRecordBase {
  productType: 'tire'
  manufacturerPartNumber: string | null
  division: string | null
  // Parsed from PartDescription (e.g. "235/55ZR17", "LT37X12.50R18 128R E")
  tireWidthMm: number | null          // 235
  aspectRatio: number | null           // 55
  constructionType: string | null      // 'R' (radial), 'B' (bias), 'D' (diagonal)
  rimDiameterIn: number | null         // 17
  loadIndex: number | null             // 99 (from description suffix)
  speedRating: string | null           // 'W', 'Y', 'H', 'T', etc.
  plyRating: string | null             // '8PR', 'E', etc. (from description)
  tirePrefix: string | null            // 'LT', 'P', 'ST', null (from description prefix)
}

/**
 * Discriminated union. The `productType` field determines which
 * type-specific fields are present. The content hash function
 * switches on this to include the correct field set.
 */
export type NormalizedRecord = WheelNormalizedRecord | TireNormalizedRecord

export interface VendorAdapter {
  readonly vendorCode: string

  /**
   * Pulls the latest feed file from the vendor's source, archives it
   * to MinIO, and returns a descriptor. Throws on transient IO
   * failures so the caller can retry on the next cron tick.
   */
  fetch(): Promise<VendorFeedDescriptor>

  /**
   * Opens a streaming reader of the archived file and yields one
   * ParsedRow per CSV record. The implementation must back-pressure
   * (do not buffer the whole file in memory).
   */
  parse(descriptor: VendorFeedDescriptor): AsyncIterable<ParsedRow>

  /**
   * Pure function — transforms one ParsedRow into one
   * NormalizedRecord. Must be deterministic: same input always
   * produces the same content_hash. No IO.
   */
  normalize(row: ParsedRow): NormalizedRecord

  /**
   * Future hook for outbound drop-ship POs. Phase 1 throws
   * NotImplemented unconditionally. The signature exists so callers
   * are forced to handle the unimplemented case explicitly.
   */
  submitPurchaseOrder(input: unknown): Promise<never>
}
```

`backend/src/modules/vendor-sync/adapters/teraflex-wheels/index.ts` outline:

```typescript
import { promises as fs } from 'fs'
import path from 'path'
import { MedusaError } from '@medusajs/framework/utils'
import type { VendorAdapter, VendorFeedDescriptor, ParsedRow, NormalizedRecord } from '../types'
import { parseWheelStream } from './parse'
import { normalizeWheelRow } from './normalize'
import { uploadFeedToMinio } from '../../utils/archive'

export interface TeraflexWheelAdapterDeps {
  feedPath: string                        // VENDOR_TERAFLEX_WHEEL_FEED_PATH
  archiveBucket: string                   // VENDOR_SYNC_FEED_ARCHIVE_BUCKET
  fileService: any                        // resolves @medusajs/file (Modules.FILE)
}

export class TeraflexWheelAdapter implements VendorAdapter {
  readonly vendorCode = 'teraflex-wheels'

  constructor(private readonly deps: TeraflexWheelAdapterDeps) {}

  async fetch(): Promise<VendorFeedDescriptor> {
    const stat = await fs.stat(this.deps.feedPath)
    const buffer = await fs.readFile(this.deps.feedPath)
    const timestamp = new Date()
    const archiveKey = await uploadFeedToMinio(
      this.deps.fileService,
      this.deps.archiveBucket,
      this.vendorCode,
      timestamp,
      buffer
    )
    return {
      vendorCode: this.vendorCode,
      archiveKey,
      sourceFilename: path.basename(this.deps.feedPath),
      byteLength: stat.size,
      fetchedAt: timestamp,
    }
  }

  parse(descriptor: VendorFeedDescriptor): AsyncIterable<ParsedRow> {
    return parseWheelStream(this.deps.fileService, this.deps.archiveBucket, descriptor.archiveKey)
  }

  normalize(row: ParsedRow): NormalizedRecord {
    return normalizeWheelRow(row, this.vendorCode)
  }

  async submitPurchaseOrder(): Promise<never> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'TeraflexWheelAdapter.submitPurchaseOrder is not implemented in Phase 1'
    )
  }
}
```

`backend/src/modules/vendor-sync/adapters/teraflex-tires/index.ts` follows the same shape but uses `vendorCode = 'teraflex-tires'`, reads from `VENDOR_TERAFLEX_TIRE_FEED_PATH`, and calls `parseTireStream` / `normalizeTireRow`. The tire normalizer parses the tire size from `PartDescription` using a regex:

```typescript
// teraflex-tires/normalize.ts (parsing sketch)
//
// Tire descriptions follow patterns like:
//   "235/55ZR17  AZFK450 99W  SL 26.7 2355517"
//   "LT37X12.50R18 128R E"
//   "12.4-24 8PR BKT TR171 TT 451224"
//   "WDPEAK AT4W 305/45R22 118S"
//
// Primary regex for metric tires:
//   /^(LT|P|ST)?(\d{2,3})\/(\d{2,3})(Z?)(R|B|D)(\d{2})[\s]/
//
// Fallback for inch-format tires:
//   /^(LT)?(\d+\.?\d*)[xX-](\d+\.?\d*)\s*(\d+PR)?\s*.*?(R|B|D|-)(\d{2})/
//
// Speed rating and load index parsed from the suffix after the size block.
// Not all descriptions parse cleanly — unparseable dimensions are stored
// as null and logged at WARN level so a human can add a pattern later.
```

Content hash (`utils/hash.ts`):

```typescript
import { createHash } from 'crypto'
import type { NormalizedRecord } from '../adapters/types'

/**
 * Stable JSON-stringify with sorted keys, then SHA256. The stockByWarehouse
 * map is sorted by warehouse_code to keep the hash stable across row order.
 * Switches on productType to include type-specific fields. Adding a field
 * to either branch is a breaking hash change for that product type.
 */
export function contentHash(record: NormalizedRecord): string {
  const sortedStock = Object.keys(record.stockByWarehouse)
    .sort()
    .reduce<Record<string, number>>((acc, k) => {
      acc[k] = record.stockByWarehouse[k]
      return acc
    }, {})

  const base = {
    productType: record.productType,
    partNumber: record.partNumber,
    vendorCode: record.vendorCode,
    title: record.title,
    brand: record.brand,
    imageUrl: record.imageUrl,
    invOrderType: record.invOrderType,
    totalQoh: record.totalQoh,
    msrpUsd: record.msrpUsd,
    mapUsd: record.mapUsd,
    stockByWarehouse: sortedStock,
  }

  let typeFields: Record<string, unknown>
  if (record.productType === 'wheel') {
    typeFields = {
      displayStyleNo: record.displayStyleNo,
      finish: record.finish,
      diameterIn: record.diameterIn,
      widthIn: record.widthIn,
      boltCount: record.boltCount,
      boltCircleIn: record.boltCircleIn,
      offsetMm: record.offsetMm,
      centerBoreMm: record.centerBoreMm,
      loadRatingLb: record.loadRatingLb,
      shippingWeightLb: record.shippingWeightLb,
      style: record.style,
    }
  } else {
    typeFields = {
      manufacturerPartNumber: record.manufacturerPartNumber,
      division: record.division,
      tireWidthMm: record.tireWidthMm,
      aspectRatio: record.aspectRatio,
      constructionType: record.constructionType,
      rimDiameterIn: record.rimDiameterIn,
      loadIndex: record.loadIndex,
      speedRating: record.speedRating,
      plyRating: record.plyRating,
      tirePrefix: record.tirePrefix,
    }
  }

  return createHash('sha256')
    .update(JSON.stringify({ ...base, ...typeFields }))
    .digest('hex')
}
```

`runDateVendor` is intentionally excluded from the hash — it advances every feed publication and would invalidate every row.

---

## 5. Workflow Composition

Each apply path is a thin `createWorkflow` that composes core flows. They are invoked from the BullMQ worker, not directly from the pipeline.

### 5.1 `upsertVendorProductWorkflow`

Inputs: `{ runId, partNumber, normalized: NormalizedRecord, regionId, salesChannelId, brandCollectionId, categoryId, shippingProfileId }`.

`categoryId` is resolved by the bootstrap step — `Wheels` category id for wheel adapters, `Tires` category id for tire adapters.

Branch on whether a `vendor_product_current` row already has a `medusa_product_id`:

- **No existing product (create path):**
  1. `createProductsWorkflow` with one product:
     ```
     {
       title:    normalized.title,
       handle:   slugify(normalized.title + '-' + normalized.partNumber),
       status:   'published',
       thumbnail: normalized.imageUrl,              // vendor CDN URL (pass-through)
       images:   [{ url: normalized.imageUrl }],    // guaranteed non-null (empty-image rows were filtered at staging)
       weight:   normalized.productType === 'wheel'
                   ? Math.round(normalized.shippingWeightLb * 453.592)  // lb -> g
                   : undefined,  // tire weight not in feed
       collection_id: brandCollectionId,
       category_ids: [categoryId],    // "Wheels" or "Tires" top-level category
       sales_channels: [{ id: salesChannelId }],
       shipping_profile_id: shippingProfileId,
       external_id: normalized.partNumber,
       metadata: buildProductMetadata(normalized),  // see below
       options: [{ title: 'Default', values: ['Default'] }],
       variants: [{
         title: 'Default',
         sku:   normalized.partNumber,
         options: { Default: 'Default' },
         manage_inventory: true,
         allow_backorder:  false,
         prices: [{ amount: Math.round(normalized.msrpUsd * 100), currency_code: 'usd' }],
       }],
     }
     ```

     `buildProductMetadata(normalized)` returns product-type-aware metadata:

     ```typescript
     // Common metadata (both types)
     const base = {
       vendor_code:           normalized.vendorCode,
       vendor_part_number:    normalized.partNumber,
       vendor_map_usd:        normalized.mapUsd,
       vendor_inv_order_type: normalized.invOrderType,
       product_type:          normalized.productType,
     }

     // Wheel-specific
     if (normalized.productType === 'wheel') {
       return { ...base,
         wheel_diameter_in: normalized.diameterIn,
         wheel_width_in:    normalized.widthIn,
         bolt_count:        normalized.boltCount,
         bolt_circle_in:    normalized.boltCircleIn,
         offset_mm:         normalized.offsetMm,
         center_bore_mm:    normalized.centerBoreMm,
         load_rating_lb:    normalized.loadRatingLb,
         finish:            normalized.finish,
         style:             normalized.style,
         display_style_no:  normalized.displayStyleNo,
       }
     }

     // Tire-specific
     return { ...base,
       manufacturer_part_number: normalized.manufacturerPartNumber,
       vendor_division:          normalized.division,
       tire_width_mm:            normalized.tireWidthMm,
       aspect_ratio:             normalized.aspectRatio,
       construction_type:        normalized.constructionType,
       rim_diameter_in:          normalized.rimDiameterIn,
       load_index:               normalized.loadIndex,
       speed_rating:             normalized.speedRating,
       ply_rating:               normalized.plyRating,
       tire_prefix:              normalized.tirePrefix,
     }
     ```

     Prices use Medusa's integer-cents convention (verify against `createProductsWorkflow` input types during PR 4; if 2.13.6 uses decimals there, drop the `*100`).
  2. Persist `medusa_product_id`, `medusa_variant_id`, `inventory_item_id`, and `content_hash` to `vendor_product_current` via the module's service step.
  3. Refresh `applied_at` and `last_seen_run_id`.

- **Existing product (update path):**
  1. `updateProductsWorkflow` with selector `{ id: existing.medusa_product_id }` and the same field map minus `options`/`variants` (the single variant is stable). Title, weight, metadata, collection_id all updateable.
  2. `upsertVariantPricesWorkflow` for the variant if `msrpUsd` differs from the previously applied value.
  3. Persist new `content_hash` and timestamp.

### 5.2 `upsertVendorStockWorkflow`

Inputs: `{ partNumber, vendorCode, stockByWarehouse: Record<string, number> }`.

1. Resolve `inventory_item_id` from `vendor_product_current` (assert non-null; if null, this run should not have enqueued the stock job — fail loudly).
2. For each warehouse_code referenced in `stockByWarehouse` AND in the existing inventory levels for this `inventory_item_id`:
   - Compute the union of warehouse codes (current row's warehouses ∪ previously-applied warehouses).
   - For each warehouse in the union:
     - Ensure the stock location exists (call `pipeline/bootstrap.ts:ensureStockLocation(warehouseCode)`). Returns `stock_location_id`.
     - Fetch existing `inventory_level.id` for `(inventory_item_id, stock_location_id)` if any.
     - Plan: if level exists → push to `update` array with `stocked_quantity: stockByWarehouse[code] ?? 0`. Else if `stockByWarehouse[code] > 0` → push to `create` array. Else → noop.
3. Call `batchInventoryItemLevelsWorkflow` with `{ create: [...], update: [...], delete: [], force: false }`.
4. Update `vendor_product_current.normalized.stockByWarehouse` to match what was applied.

### 5.3 `discontinueVendorProductWorkflow`

Inputs: `{ partNumber, vendorCode }`.

1. Look up `medusa_product_id` from `vendor_product_current`.
2. `updateProductsWorkflow` with:
   ```
   {
     selector: { id: existing.medusa_product_id },
     update: {
       status: 'draft',
       metadata: { ...keep existing..., discontinued_at: new Date().toISOString() },
     }
   }
   ```
3. Set `discontinued_at = NOW()` on `vendor_product_current`.

Per anti-pattern #6, we never call `deleteProductsWorkflow`. The product data, orders, and history are retained.

### 5.4 Pricing changes

There is no separate `updateVendorPriceWorkflow`. Price changes flow through `upsertVendorProductWorkflow`'s update path because any change to `msrpUsd` flips the content hash and lands in the `changed` diff bucket. The update path checks `msrpUsd` diff against `vendor_product_current.normalized.msrpUsd` and conditionally calls `upsertVariantPricesWorkflow`.

### 5.5 Search index

We do nothing explicit. `createProductsWorkflow` and `updateProductsWorkflow` emit `product.created` and `product.updated` events natively; the installed `@rokmohar/medusa-plugin-meilisearch` subscribes to those (confirmed via plugin docs — the plugin's `subscribers/README.md` documents the `product.created` subscriber pattern, and the plugin uses this internally). The Meilisearch index updates incrementally as a side effect.

**Verify-on-install (risk item R1):** If after `pnpm install` the plugin turns out NOT to subscribe to product events (only doing full reindexes), add a debounced `vendor-sync:reindex` BullMQ job that fires once per run with the list of touched product IDs and calls the plugin's reindex hook. Cost: ~half a PR. This is captured in §13 Risk Register.

---

## 6. Job and Queue Topology

One BullMQ queue, three job types, one dead-letter strategy.

### 6.1 Queue `vendor-sync:apply`

```typescript
// backend/src/modules/vendor-sync/queue/setup.ts (sketch)
import { Queue, Worker, QueueEvents } from 'bullmq'

export const APPLY_QUEUE_NAME = 'vendor-sync:apply'

export type ApplyJobName = 'upsert-product' | 'upsert-stock' | 'discontinue-product'

export interface UpsertProductJobData    { runId: string; vendorCode: string; partNumber: string }
export interface UpsertStockJobData      { runId: string; vendorCode: string; partNumber: string }
export interface DiscontinueProductJobData { runId: string; vendorCode: string; partNumber: string }

export const APPLY_JOB_DEFAULTS = {
  attempts:        3,
  backoff:         { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail:     { count: 10000 },
} as const

// Worker concurrency comes from VENDOR_SYNC_APPLY_CONCURRENCY (default 8).
```

### 6.2 Job IDs

Job id is `${runId}:${jobName}:${partNumber}`. BullMQ uses this as a dedup key when present, so re-enqueueing the same job within the same run is a no-op. This makes the apply step safe to re-run after a process crash mid-enqueue.

### 6.3 Ordering between job types

For one part_number in one run, the order is: `upsert-product` → `upsert-stock`. A stock job's worker waits via a "parent completed" check: the apply orchestrator (`pipeline/apply.ts`) enqueues stock jobs as `dependsOn` children of the product job using BullMQ flows (`FlowProducer.add`). If the product job fails after 3 attempts, the stock job is auto-cancelled.

`discontinue-product` jobs have no dependencies and run in parallel with the others.

### 6.4 Concurrency

`VENDOR_SYNC_APPLY_CONCURRENCY` (default 8) workers per process. With Medusa running on a shared-mode Railway service, that's 8 concurrent product workflows. On a 45k-row first ingestion that's roughly 90 minutes at ~7 workflows/sec. Acceptable for the bootstrap.

In production each subsequent run touches only the changed rows (estimated 100–2000), well under 5 minutes.

### 6.5 Dead-letter handling

BullMQ retains failed jobs after exhausting retries on the same queue with `attemptsMade >= attempts`. No separate DLQ queue. The admin endpoint `GET /admin/vendor-sync/runs/:id` includes failed jobs in its detail payload. The admin endpoint `POST /admin/vendor-sync/skus/:partNumber/replay` re-enqueues a single SKU using its most recent staging row.

---

## 7. Scheduled Job Spec

`backend/src/jobs/vendor-sync-tick.ts`:

```typescript
import type { MedusaContainer } from '@medusajs/framework/types'
import { VENDOR_SYNC_MODULE } from '../modules/vendor-sync'

export default async function vendorSyncTick(container: MedusaContainer) {
  const svc = container.resolve(VENDOR_SYNC_MODULE)
  const enabledVendors = svc.listEnabledVendors()    // reads VENDOR_*_ENABLED env vars
  for (const vendor of enabledVendors) {
    try {
      await svc.run(vendor)
    } catch (err) {
      svc.logger.error({ vendor, err }, 'vendor-sync tick failed')
    }
  }
}

export const config = {
  name:     'vendor-sync-tick',
  schedule: '0 */12 * * *',
}
```

`svc.run(vendor)` is the entry point and implements:

1. **In-progress guard.** Query `vendor_feed_run` for `vendor_code = $1 AND status IN ('fetching','staging','diffing','applying')`. If any row exists, log INFO `'previous run still in flight, skipping tick'` and return.
2. **Fetch.** Create a `vendor_feed_run` row with status `'fetching'`. Call `adapter.fetch()`. Update row with `source_filename`, `source_archive_key`, `run_date_vendor`, `row_count` (after first stream pass — see step 3).
3. **RunDate short-circuit.** If `run_date_vendor` equals the most recent `completed` run's `run_date_vendor` for this vendor, mark this run `completed` with all counts at 0 and an `error_message: 'no-op: vendor RunDate unchanged'`. Return.
4. **Stage.** Status → `'staging'`. Stream `adapter.parse(descriptor)`, normalize, content-hash. **Rows with empty `imageUrl` after normalization are dropped** — they increment `skipped_no_image_count` on the run row but are not inserted into staging. Remaining rows are inserted into `vendor_feed_staging` and `vendor_stock_staging`. Compute `row_count` (total parsed), `skipped_no_image_count`, and `hash_match_count` (staged rows whose hash matches the corresponding `vendor_product_current.content_hash`).
5. **Diff.** Status → `'diffing'`. Run the three SQL queries. Persist `new_count`, `changed_count`, `discontinued_count` on the run row.
6. **Threshold check.** If `discontinued_count > 0 AND current_count > 0 AND discontinued_count / current_count > VENDOR_SYNC_DISCONTINUE_THRESHOLD` → status `'awaiting_approval'`. Return without applying.
7. **Apply.** Status → `'applying'`. Call `pipeline/apply.ts` which enqueues jobs and awaits the BullMQ queue to drain for this `runId` (uses QueueEvents `completed`/`failed` tracking against the `runId` job-id prefix).
8. **Finalize.** If any apply job permanently failed, status → `'failed'`, `error_message` includes failed part_numbers (truncated). Otherwise status → `'completed'`. Set `finished_at`.

Steps 4–7 advance `vendor_product_current` ONLY when their corresponding apply job succeeds (architectural decision A1). A failed run leaves the previous canonical state untouched and the next tick will re-diff and re-apply.

---

## 8. Admin Endpoints

All endpoints are under `/admin/vendor-sync/` and require the standard Medusa admin auth (the existing admin middleware applies because the routes live under `src/api/admin/`).

### 8.1 `GET /admin/vendor-sync/runs`

Query: `?vendor=teraflex&limit=20&offset=0&status=completed`. All filters optional.

Response:
```json
{
  "runs": [
    {
      "id": "01HXY...",
      "vendor_code": "teraflex",
      "status": "completed",
      "row_count": 43821,
      "skipped_no_image_count": 8412,
      "hash_match_count": 34690,
      "new_count": 12,
      "changed_count": 631,
      "discontinued_count": 76,
      "started_at": "2026-05-17T00:00:01Z",
      "finished_at": "2026-05-17T00:04:32Z",
      "run_date_vendor": "2026-05-16T22:06:48Z"
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

### 8.2 `POST /admin/vendor-sync/runs`

Body: `{ "vendor_code": "teraflex", "dry_run": false }`. Triggers an out-of-cycle run. Returns the new run id. Rejects with 409 if a run for this vendor is already in flight.

### 8.3 `GET /admin/vendor-sync/runs/:id`

Returns the run row plus a `diff_sample` block with the first 50 part_numbers in each of the three buckets, plus a `failed_jobs` array (part_number + last error message).

### 8.4 `POST /admin/vendor-sync/runs/:id/approve`

Only valid if `status = 'awaiting_approval'`. Sets `approved_by = req.user.id`, `approved_at = NOW()`, status → `'applying'`, and re-invokes the apply step. Returns the updated run row.

### 8.5 `POST /admin/vendor-sync/runs/:id/cancel`

Valid for `status IN ('awaiting_approval','applying')`. Sets status → `'cancelled'`. If `applying`, also drains/removes pending jobs for this `runId` from the queue.

### 8.6 `POST /admin/vendor-sync/runs/:id/replay`

Re-enqueues every part_number from the staging tables of this run, regardless of whether they were originally in the new/changed/discontinued buckets. Used after fixing an apply bug — forces a re-check against current Medusa state. Updates this run's counts in place. Returns the run row.

### 8.7 `POST /admin/vendor-sync/skus/:partNumber/replay`

Body: `{ "vendor_code": "teraflex" }`. Looks up the most recent staging row for this `(vendor_code, part_number)`, classifies it (new/changed/unchanged/discontinued) against current state, and enqueues the appropriate job. Used for one-off recovery from a bad row.

All endpoints respond `application/json`. Errors follow Medusa's standard `{ "type": "...", "message": "..." }` shape via `MedusaError`.

---

## 9. Env Vars

Add to `backend/src/lib/constants.ts` (export pattern matches existing file).

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `VENDOR_SYNC_FEED_ARCHIVE_BUCKET` | optional | `vendor-feeds` | MinIO bucket holding raw CSV archives. Created on first use. |
| `VENDOR_SYNC_DISCONTINUE_THRESHOLD` | optional | `0.05` | Fraction (0–1) of current catalog above which a discontinue diff pauses the run for approval. |
| `VENDOR_SYNC_APPLY_CONCURRENCY` | optional | `8` | BullMQ worker concurrency per process. |
| `VENDOR_SYNC_DRY_RUN` | optional | `false` | When `true`, the scheduled job stops after the diff and never applies. |
| `VENDOR_TERAFLEX_WHEELS_ENABLED` | required to activate | `false` | Master switch for the Teraflex wheel adapter. |
| `VENDOR_TERAFLEX_WHEEL_FEED_PATH` | required if wheels enabled | `./wheelInvPriceData.csv` | Local CSV path for the wheel feed. Phase 1 only — SFTP replaces this. |
| `VENDOR_TERAFLEX_TIRES_ENABLED` | required to activate | `false` | Master switch for the Teraflex tire adapter. |
| `VENDOR_TERAFLEX_TIRE_FEED_PATH` | required if tires enabled | `./tireInvPriceData.csv` | Local CSV path for the tire feed. Phase 1 only — SFTP replaces this. |
| `VENDOR_TERAFLEX_SFTP_HOST` | placeholder | — | Reserved for the SFTP follow-up PR. Currently unread. Shared across wheel + tire feeds from the same vendor. |
| `VENDOR_TERAFLEX_SFTP_PORT` | placeholder | `22` | Reserved. |
| `VENDOR_TERAFLEX_SFTP_USER` | placeholder | — | Reserved. |
| `VENDOR_TERAFLEX_SFTP_PASSWORD` | placeholder | — | Reserved. Use either password OR private key, never both. |
| `VENDOR_TERAFLEX_SFTP_PRIVATE_KEY` | placeholder | — | Reserved. PEM string, not a file path. |
| `VENDOR_TERAFLEX_SFTP_WHEEL_REMOTE_PATH` | placeholder | — | Reserved. Remote path for wheel CSV on the vendor SFTP. |
| `VENDOR_TERAFLEX_SFTP_TIRE_REMOTE_PATH` | placeholder | — | Reserved. Remote path for tire CSV on the vendor SFTP. |

### 9.1 Conditional module registration in `medusa-config.js`

Add this block after the existing modules array entries:

```javascript
// constants additions
import {
  // ...
  VENDOR_TERAFLEX_WHEELS_ENABLED,
  VENDOR_TERAFLEX_TIRES_ENABLED,
  VENDOR_TERAFLEX_WHEEL_FEED_PATH,
  VENDOR_TERAFLEX_TIRE_FEED_PATH,
} from 'lib/constants';

const VENDOR_SYNC_ANY_ENABLED =
  VENDOR_TERAFLEX_WHEELS_ENABLED === 'true' ||
  VENDOR_TERAFLEX_TIRES_ENABLED === 'true'
  /* future: || OTHER_VENDOR_ENABLED */

// inside modules array
...(VENDOR_SYNC_ANY_ENABLED ? [{
  resolve: './src/modules/vendor-sync',
  options: {
    discontinueThreshold: parseFloat(VENDOR_SYNC_DISCONTINUE_THRESHOLD ?? '0.05'),
    applyConcurrency:     parseInt(VENDOR_SYNC_APPLY_CONCURRENCY ?? '8', 10),
    archiveBucket:        VENDOR_SYNC_FEED_ARCHIVE_BUCKET ?? 'vendor-feeds',
    dryRun:               VENDOR_SYNC_DRY_RUN === 'true',
    vendors: {
      'teraflex-wheels': {
        enabled:  VENDOR_TERAFLEX_WHEELS_ENABLED === 'true',
        feedPath: VENDOR_TERAFLEX_WHEEL_FEED_PATH,
      },
      'teraflex-tires': {
        enabled:  VENDOR_TERAFLEX_TIRES_ENABLED === 'true',
        feedPath: VENDOR_TERAFLEX_TIRE_FEED_PATH,
      },
    },
  },
}] : []),
```

The module is *only* loaded when at least one vendor is enabled — same pattern as the conditional Sendgrid/Resend/Stripe blocks already in the file.

### 9.2 `.env.template` additions

Append at the bottom of `backend/.env.template`:

```
# --- Vendor Sync (Phase 1: Teraflex Wheels + Tires) ---
# Master switches. Set to 'true' to activate the corresponding adapter.
# Each feed runs independently in the cron with its own dry-run/apply cycle.
# VENDOR_TERAFLEX_WHEELS_ENABLED=false
# VENDOR_TERAFLEX_TIRES_ENABLED=false

# Phase 1 reads CSVs from local paths. Replace with SFTP env vars
# in the follow-up SFTP PR (placeholders below are reserved but unused).
# VENDOR_TERAFLEX_WHEEL_FEED_PATH=./wheelInvPriceData.csv
# VENDOR_TERAFLEX_TIRE_FEED_PATH=./tireInvPriceData.csv

# Optional pipeline tuning
# VENDOR_SYNC_FEED_ARCHIVE_BUCKET=vendor-feeds
# VENDOR_SYNC_DISCONTINUE_THRESHOLD=0.05
# VENDOR_SYNC_APPLY_CONCURRENCY=8
# VENDOR_SYNC_DRY_RUN=false

# Reserved for the SFTP follow-up PR (currently unread)
# Shared SFTP connection for both wheel and tire feeds
# VENDOR_TERAFLEX_SFTP_HOST=
# VENDOR_TERAFLEX_SFTP_PORT=22
# VENDOR_TERAFLEX_SFTP_USER=
# VENDOR_TERAFLEX_SFTP_PASSWORD=
# VENDOR_TERAFLEX_SFTP_PRIVATE_KEY=
# VENDOR_TERAFLEX_SFTP_WHEEL_REMOTE_PATH=
# VENDOR_TERAFLEX_SFTP_TIRE_REMOTE_PATH=
```

---

## 10. Migrations

Order is fixed by foreign-key dependencies — `vendor_feed_run` is referenced by both staging tables and `vendor_product_current`, so it must come first.

| # | File | Creates |
|---|---|---|
| 1 | `Migration20260517000001.ts` | `vendor_feed_run` table + indexes from §3.1 |
| 2 | `Migration20260517000002.ts` | `vendor_feed_staging` table + indexes from §3.2, with FK to `vendor_feed_run(id)` |
| 3 | `Migration20260517000003.ts` | `vendor_stock_staging` table + indexes from §3.3, with FK to `vendor_feed_run(id)` |
| 4 | `Migration20260517000004.ts` | `vendor_product_current` table + indexes from §3.4, with FK to `vendor_feed_run(id)` |

All four are generated by `medusa db:generate vendor-sync` after the data models in `models/*.ts` are written. Inspect the generated SQL against §3 before committing — auto-generation does not always produce partial indexes or composite unique indexes correctly, so add them manually if missing.

`pnpm ib` runs these in order on every fresh database. Existing developer databases pick them up on next `pnpm dev` (Medusa auto-runs pending migrations in dev).

---

## 11. Test Strategy

### 11.1 Test runner

Add `backend/jest.config.js` (this file does not exist today; `@swc/jest` is already in devDependencies):

```javascript
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['@swc/jest', { jsc: { target: 'es2022' } }] },
  moduleNameMapper: { '^(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testTimeout: 30000,
}
```

Add to `backend/package.json` scripts:
```
"test:sync": "jest src/modules/vendor-sync"
```

### 11.2 Fixtures

`wheels-small.csv` (5 rows from `wheelInvPriceData.csv`; pick rows that exercise both ST and N2, both 5x5 and 6x5.5 bolt patterns, both positive and negative offset).

`wheels-small-v2.csv` is the same fixture with the following deltas:
- 1 new row appended (a fabricated part_number `000000000099900001`)
- 1 changed `MSRP_USD` (e.g. `058029` from $369.99 to $389.99)
- 1 changed warehouse QOH (e.g. `058049` warehouse `1020` from 4 to 8)
- 1 removed row (delete one part_number entirely — e.g. `056150`)
- 1 unchanged row to assert hash-match works

`tires-small.csv` (5 rows from `tireInvPriceData.csv`; pick rows that exercise ST, N2, and SO, metric and inch-format tire sizes, real ImageURLs, different brands).

`tires-small-v2.csv` with the same five permutations (1 new, 1 changed, 1 removed, 1 unchanged, 1 qoh-changed).

These fixture pairs cover every diff path for both product types.

### 11.3 Unit tests

`__tests__/wheel-parse.test.ts`:
- parses zero-padded `part_number` as string (asserts result is `'000000000001056059'`, not `1056059`)
- detects every numeric column header as a warehouse code regardless of position
- parses `RunDate` `05/07/2026 10:06:48 PM` to a Date (treat as wall-clock timestamp in UTC)
- empty `ImageURL`, empty `LoadRating`, empty `CenterBore`, empty `Finish` all produce `null` after normalization
- `TotalQOH != sum(warehouse columns)` produces a WARN log and trusts the per-warehouse breakdown

`__tests__/wheel-normalize.test.ts`:
- `Size = "17X8.5"` → `{ diameterIn: 17, widthIn: 8.5 }`
- `BoltPattern = "5X5.0"` → `{ boltCount: 5, boltCircleIn: 5.0 }`
- `BoltPattern = "6X5.5"` → `{ boltCount: 6, boltCircleIn: 5.5 }`
- `Offset = "-12"` → `offsetMm: -12`
- `MSRP_USD = "369.99"` → `msrpUsd: 369.99`
- `InvOrderType` accepts `'ST'` and `'N2'`; other values throw (wheels don't use `SO`)
- `productType` is always `'wheel'`

`__tests__/tire-parse.test.ts`:
- parses alphanumeric `part_number` as string (`F28173725`, not numeric coercion)
- `Brand` is the first column (different column order from wheels) — parsed correctly
- `ManufacturerPartNumber` and `Division` columns are captured
- `InvOrderType` accepts `'ST'`, `'N2'`, and `'SO'`
- real `ImageURL` values are preserved (e.g. `https://images.wheelpros.com/m500/mFTWPK4.png`)

`__tests__/tire-normalize.test.ts`:
- metric tire: `"235/55ZR17  AZFK450 99W  SL 26.7"` → `{ tireWidthMm: 235, aspectRatio: 55, constructionType: 'R', rimDiameterIn: 17, speedRating: 'W', loadIndex: 99 }`
- LT tire: `"LT37X12.50R18 128R E"` → `{ tirePrefix: 'LT', tireWidthMm: null (inch format), rimDiameterIn: 18, loadIndex: 128, speedRating: 'R', plyRating: 'E' }`
- inch-format bias: `"12.4-24 8PR BKT TR171 TT"` → `{ plyRating: '8PR', constructionType: null (bias implied), rimDiameterIn: 24 }`
- unparseable description → all dimension fields `null`, WARN logged (not an error)
- `Division = "10"` → `division: "10"` (stored as string)
- `productType` is always `'tire'`

`__tests__/hash.test.ts`:
- Same `WheelNormalizedRecord` produces the same hex hash across runs
- Same `TireNormalizedRecord` produces the same hex hash across runs
- Reordering keys in `stockByWarehouse` produces the same hash
- Changing `msrpUsd` by 1 cent produces a different hash
- Changing `runDateVendor` does NOT change the hash
- A wheel and a tire with identical base fields produce different hashes (because `productType` differs)

### 11.4 Integration tests

`__tests__/diff.test.ts` — requires a live Postgres but no Medusa modules:
1. Spin up the module's tables only (helper runs migrations 1-4 against a test schema).
2. Insert `wheels-small.csv` rows into `vendor_feed_staging` via the module service (run id = `run-1`, vendor_code = `teraflex-wheels`).
3. Pretend `run-1` was applied: copy staging into `vendor_product_current`.
4. Insert `wheels-small-v2.csv` rows into staging as `run-2`.
5. Call `diff.ts` for `run-2` and assert: `new = 1`, `changed = 2`, `discontinued = 1`, hash_match = 1.
6. Repeat steps 2-5 with `tires-small.csv`/`tires-small-v2.csv` as `teraflex-tires` to verify the diff is product-type-agnostic (it operates on vendor_code + content_hash, not product-specific fields).

`__tests__/apply.integration.test.ts` — requires a clean Medusa instance:
1. Helper `setupMedusaWithRegion()` boots Medusa via `@medusajs/test-utils`, creates the USD region, sales channel, shipping profile, and `Wheels`/`Tires` categories.
2. Load `wheels-small.csv` end-to-end via `run('teraflex-wheels')` with `VENDOR_SYNC_DRY_RUN=false`.
3. Assert:
   - 5 wheel products exist with expected handles, prices, brand collection `Teraflex`, category `Wheels`, wheel-specific metadata
   - Each variant's `inventory_item` has levels at the expected warehouses
   - `vendor_product_current` has 5 rows with `vendor_code = 'teraflex-wheels'`
4. Load `tires-small.csv` via `run('teraflex-tires')`.
5. Assert:
   - Tire products exist with category `Tires`, multiple brand collections (`Falken`, `BKT`, etc.), tire-specific metadata
   - Wheel and tire products coexist without collision (different vendor_codes, different categories)
6. Load `wheels-small-v2.csv` and run again against `teraflex-wheels`.
7. Assert: 1 new, 2 updated, 1 discontinued — only wheel products affected, tire products untouched.

Integration tests are tagged with `describe.skip` if `process.env.RUN_INTEGRATION !== 'true'` so `pnpm test:sync` runs only unit tests by default. Document this in the module README.

Playwright tests are not relevant for this work — the storefront does not change in Phase 1.

---

## 12. Observability

### 12.1 Log levels

| Level | Event |
|---|---|
| INFO | run started (vendor, runId) |
| INFO | run stage transition (fetching → staging → diffing → applying → completed) |
| INFO | run completed (vendor, runId, duration_ms, counts) |
| INFO | RunDate short-circuit (no-op tick) |
| INFO | rows skipped for missing ImageURL (vendor, runId, skipped_no_image_count) |
| INFO | stock location auto-created (warehouse_code, location_id) |
| INFO | brand collection auto-created (brand, collection_id) |
| WARN | TotalQOH mismatches sum of warehouse columns (part_number, total_qoh, sum) |
| WARN | discontinue threshold exceeded — run paused (vendor, runId, discontinued, total) |
| WARN | workflow retry attempted (job_name, part_number, attempt) |
| WARN | RunDate could not be parsed; falling back to now() |
| ERROR | parse failure (line_number, raw_line snippet) |
| ERROR | workflow failed after all retries (job_name, part_number, last_error) |
| ERROR | fetch failure (vendor, archive_key_attempted) |
| ERROR | diff SQL failure (runId, sql_error) |
| ERROR | unexpected adapter exception (vendor, stage) |

All log lines emit structured fields. Use the container's logger (`container.resolve(ContainerRegistrationKeys.LOGGER)`) — Medusa's pino-backed logger already formats JSON in production. No bespoke logger.

### 12.2 Sentry

`SENTRY_DSN` is not currently wired in this repo. The plan adds a minimal hook: if `process.env.SENTRY_DSN` is set, the module imports `@sentry/node` (added to package.json as an optional dev-installed dep — actually a regular dep to keep production parity) and calls `Sentry.captureException(err, { tags: { vendor, runId, stage } })` from every ERROR site. If `SENTRY_DSN` is unset, the Sentry import is a no-op. Sentry initialization itself is out of scope; it can be wired in a follow-up by the existing app.

### 12.3 Metrics (structured log fields, scrape-friendly)

| Field | Type | Where emitted |
|---|---|---|
| `vendor_sync.run.duration_ms` | int | run-completed log |
| `vendor_sync.run.rows_processed` | int | run-completed log |
| `vendor_sync.run.skipped_no_image` | int | run-completed log |
| `vendor_sync.run.hash_match_count` | int | run-completed log |
| `vendor_sync.run.new_count` | int | run-completed log |
| `vendor_sync.run.changed_count` | int | run-completed log |
| `vendor_sync.run.discontinued_count` | int | run-completed log |
| `vendor_sync.apply.job_duration_ms` | int | per-job-completed log, with `job_name` tag |
| `vendor_sync.apply.errors_total` | int | counter incremented in error log, with `stage` tag |

These are emitted as plain log fields; whatever log shipper Railway is configured with picks them up.

---

## 13. Phased Commit Plan

Each PR below ships independently working code. The cron is not enabled until the final PR, so partial implementations live behind manual scripts and admin endpoints. After each PR lands and is reviewed, the next PR's own bite-sized task plan is generated.

### PR 1 — Schema, data models, migrations, module shell

**What ships:**
- `backend/src/modules/vendor-sync/` directory with `index.ts`, `service.ts`, four `models/*.ts` files, four `migrations/*.ts` files, `README.md` stub.
- Conditional registration block in `medusa-config.js` (vendor-sync loads only if `VENDOR_TERAFLEX_WHEELS_ENABLED=true` or `VENDOR_TERAFLEX_TIRES_ENABLED=true`).
- `bullmq`, `papaparse`, `zod` added to `backend/package.json`. No usage yet.
- New env vars added to `constants.ts` and `.env.template` (both wheel and tire feed paths, both enable flags).
- `jest.config.js` and `test:sync` script added.

**Service surface:** Only CRUD on the four tables. No fetch/stage/diff/apply.

**Acceptance:**
- `cd backend && pnpm install` succeeds.
- `pnpm ib` runs the four new migrations against a fresh DB without error.
- With both `VENDOR_TERAFLEX_*_ENABLED=false`, `pnpm dev` starts identically to before this PR.
- With either enabled, `pnpm dev` starts and the module appears in the boot log.
- `pnpm test:sync` runs (zero tests pass; that's fine for this PR).

### PR 2 — Wheel adapter: fetch + parse + normalize, dry-run-only

**What ships:**
- `adapters/types.ts` (discriminated union NormalizedRecord), `adapters/registry.ts`, `adapters/teraflex-wheels/{index,parse,normalize,schema}.ts`.
- `utils/{hash,archive,parse-helpers}.ts`.
- `pipeline/fetch.ts` and `pipeline/stage.ts`.
- `scripts/vendor-sync-dry-run.ts` — `medusa exec` script that runs fetch + stage and prints a summary table.
- Unit tests for wheel parse, wheel normalize, hash (both product types).
- Fixture: `wheels-small.csv`, `wheels-small-v2.csv`.
- `pnpm vendor-sync:dry-run teraflex-wheels` script in package.json.

**Acceptance:**
- `pnpm test:sync` runs and passes the wheel parse/normalize/hash unit tests.
- `pnpm vendor-sync:dry-run teraflex-wheels` against `wheelInvPriceData.csv` populates `vendor_feed_run` (status `'staging'`), `vendor_feed_staging` (row_count rows), `vendor_stock_staging` (rows with non-zero qoh).
- The archived CSV appears in MinIO bucket `vendor-feeds` at `teraflex-wheels/<timestamp>.csv` (or in local `static/` if MinIO not configured).
- Running dry-run a second time on the same file creates a second run row with the same content_hashes.

### PR 2b — Tire adapter: fetch + parse + normalize, dry-run-only

**What ships:**
- `adapters/teraflex-tires/{index,parse,normalize,schema}.ts`.
- Tire-specific parse helpers: regex-based tire size parser for metric (`235/55ZR17`), inch-format (`37X12.50R18`), and partial-match descriptions with WARN-level fallback to null for unparseable dimensions.
- Unit tests for tire parse, tire normalize (including edge cases: `LT` prefix, `8PR` ply, missing speed rating).
- Fixture: `tires-small.csv`, `tires-small-v2.csv`.
- Registry updated: `resolveAdapter('teraflex-tires')` returns `TeraflexTireAdapter`.

**Acceptance:**
- `pnpm test:sync` passes tire parse and normalize tests.
- `pnpm vendor-sync:dry-run teraflex-tires` against `tireInvPriceData.csv` stages correctly with tire-specific normalized records.
- Content hashes for tire rows differ from wheel rows even if they share the same part_number (they won't in practice, but the hash includes `productType` so this is guaranteed).
- Descriptions that don't match any known tire size pattern produce `null` dimensions and a WARN log (not an error — the row still stages).

### PR 3 — SQL diff and run lifecycle

**What ships:**
- `pipeline/diff.ts` implementing the three SQL queries.
- Service method `run(vendor)` that advances states: fetching → staging → diffing, with the in-progress guard and RunDate short-circuit.
- `vendor-sync-dry-run.ts` now drives the full pipeline through `diffing` and prints `new/changed/discontinued` counts plus a sample of 10 part_numbers per bucket.
- `__tests__/diff.test.ts` integration test using both wheel and tire fixture versions.
- `discontinue_count / current_count` threshold check (when tripped, status → `awaiting_approval`).

**Acceptance:**
- `pnpm vendor-sync:dry-run teraflex-wheels` against an unchanged CSV reports `new=0 changed=0 discontinued=0` and finishes in `completed` status. Same for `teraflex-tires`.
- Modifying either CSV (delete a row, change a price) and re-running shows the expected diff.
- The diff integration test passes against a test DB for both product types.
- An in-progress run for one adapter does not block the other adapter's run (they use different `vendor_code` values).

### PR 4 — Apply path: upsert product (no stock, no discontinue)

**What ships:**
- `pipeline/bootstrap.ts` — idempotent ensure-region (USD), ensure-sales-channel (`Default Sales Channel`), ensure-brand-collection, ensure-product-categories (`Wheels`, `Tires`).
- `workflows/upsert-vendor-product.ts` — product-type-aware: reads `normalized.productType` to select the correct `categoryId` and `buildProductMetadata` branch.
- `queue/setup.ts` and `queue/workers/apply-worker.ts` (only handles `upsert-product` job type).
- `pipeline/apply.ts` enqueues only `upsert-product` jobs.
- `scripts/vendor-sync-apply.ts` — `medusa exec` script that, given a `runId`, enqueues the product upserts, awaits drain, finalizes the run.

**Acceptance:**
- Against the wheel fixture: after `pnpm vendor-sync:dry-run teraflex-wheels` then `pnpm vendor-sync:apply <runId>`, wheel products exist with correct title, MSRP price, brand collection `Teraflex`, category `Wheels`, and wheel-specific metadata (bolt pattern, offset, etc.).
- Against the tire fixture: after `pnpm vendor-sync:dry-run teraflex-tires` then `pnpm vendor-sync:apply <runId>`, tire products exist with category `Tires`, brand collections `Falken`/`BKT`/`OHTSU`, and tire-specific metadata (tire width, aspect ratio, speed rating, etc.).
- `vendor_product_current` rows have correct `medusa_product_id`, `medusa_variant_id`, `inventory_item_id`, `content_hash` for both product types.
- Running dry-run+apply again with the same CSV is a no-op (hash-match).
- Changing one row's `MSRP_USD` then re-running flows it through the update path; the variant price updates.

### PR 5 — Apply path: per-warehouse stock

**What ships:**
- `pipeline/bootstrap.ts` extended with `ensureStockLocation(warehouseCode)`.
- `workflows/upsert-vendor-stock.ts` composing `batchInventoryItemLevelsWorkflow`.
- `apply-worker.ts` now handles `upsert-stock` jobs.
- `pipeline/apply.ts` uses `FlowProducer` to enqueue `upsert-product` with `upsert-stock` as a dependent child.

**Acceptance:**
- After apply, inventory levels in Medusa match the per-warehouse QOH from the fixture, including zeros for warehouses present in `current` but missing from the new feed.
- New warehouse codes auto-create stock locations named `Warehouse <code>` with `metadata.vendor_warehouse_code` set.
- The `batchInventoryItemLevelsWorkflow.force` flag is `false`; deletes that would zero out a non-zero level are not attempted.

### PR 6 — Apply path: discontinue + threshold guard

**What ships:**
- `workflows/discontinue-vendor-product.ts` — sets `status: 'draft'` and `metadata.discontinued_at`.
- `apply-worker.ts` handles `discontinue-product` jobs.
- `pipeline/apply.ts` enqueues `discontinue-product` for the third diff bucket.
- Threshold check from PR 3 now actually pauses the apply (not just the diff).
- `apply.integration.test.ts` end-to-end test.

**Acceptance:**
- Deleting a single row from the fixture and re-running marks that product `status = 'draft'` with `metadata.discontinued_at` populated.
- Deleting ≥6% of fixture rows trips the threshold; the apply script exits with a non-zero code and the run is `awaiting_approval`.
- The end-to-end integration test passes.

### PR 7 — Admin endpoints

**What ships:**
- All seven routes from §8.
- A README section showing example `curl` calls for each.
- Light integration tests (per-route) using `supertest` against a running Medusa.

**Acceptance:**
- `GET /admin/vendor-sync/runs` returns a paginated list, filterable by vendor and status.
- `POST /admin/vendor-sync/runs/:id/approve` advances an `awaiting_approval` run to `applying` and drains it.
- `POST /admin/vendor-sync/skus/:partNumber/replay` re-applies a single SKU using its most recent staging row.

### PR 8 — Scheduled job, archive, observability polish, README

**What ships:**
- `backend/src/jobs/vendor-sync-tick.ts` cron (every 12h).
- MinIO archive logic moved into `pipeline/fetch.ts` as a pre-parse step (replacing whatever placeholder PR 2 used).
- Sentry-conditional error capture.
- Structured-log additions and metric fields per §12.
- Full README at `backend/src/modules/vendor-sync/README.md` covering the four-step recipe: configure env, run dry-run, review diff, run apply, enable cron.

**Acceptance:**
- With `VENDOR_TERAFLEX_ENABLED=true` and a recent dry-run/apply pair completed, the cron tick triggers on schedule and either runs (file changed) or short-circuits (RunDate unchanged).
- MinIO bucket `vendor-feeds` contains the archived CSV at the expected key after each run.
- The README walks a new engineer from `git pull` to "first cron tick green" without external help.

---

## 14. Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Meilisearch plugin (`@rokmohar/medusa-plugin-meilisearch`) may not subscribe to `product.created`/`product.updated` events — could require full reindex on every change. | Verify at start of PR 4 by reading the plugin source post-install. If verified missing, add a debounced `vendor-sync:reindex` job that fires once per run with the touched product IDs. Half-PR scope. |
| R2 | Medusa 2.13.6's `createProductsWorkflow` price input may use decimal or integer-cents — easy to get backwards. | PR 4 first task: write a Jest unit that creates one product with `prices: [{ amount: 100, currency_code: 'usd' }]` and reads it back; assert the visible price is $1.00 not $100. Adjust the multiplier in the workflow accordingly. |
| R3 | BullMQ on the same Redis used for `@medusajs/event-bus-redis` and `@medusajs/workflow-engine-redis` may collide on key prefixes. | Configure the BullMQ Queue with `prefix: 'vendor-sync'`. Document in PR 4. |
| R4 | First ingestion enqueues ~45k product creates; Railway service memory and Postgres connection pool may not handle the burst at `applyConcurrency=8`. | Default concurrency is 8 (low). Tunable via env. First-run script prints estimated duration; recommend running it during low-traffic window. |
| R5 | `RunDate` short-circuit depends on consistent timestamp parsing. If the vendor switches `05/07/2026` between US (`MM/DD`) and EU (`DD/MM`) interpretation, dedup breaks silently. | Lock to US `MM/DD/YYYY hh:mm:ss AM/PM` in the Teraflex adapter's normalize step (it's a Teraflex-specific quirk; the abstract type uses a `Date` so other adapters can parse differently). Add an explicit assertion that the parsed year is between 2024 and 2030 — out-of-range raises a parse error. |
| R6 | Region/sales-channel/shipping-profile drift — if an admin renames `Default Sales Channel` in the Medusa admin, the bootstrap step's name-based lookup breaks. | Bootstrap step uses `metadata.vendor_sync_managed = 'default'` as the lookup key, applied at first creation. Name is a display label only. |
| R7 | Content hash includes every normalized field. Adding a new field is a breaking hash change — every row appears `changed` on the next run. | Document in the README and add a one-line comment above the `contentHash` function. When adding a field, plan a one-time "no-op apply" (the apply path is idempotent, so this is a cost issue, not a correctness issue). |
| R8 | `pnpm install` at the repo root is a no-op (no workspace). Engineer must `cd backend && pnpm install` for new dependencies. | Already documented in `CLAUDE.md`. README also calls it out. |
| R9 | Tire size parsing from `PartDescription` is regex-based and will not cover every format in a 45k-row feed. Unparsed descriptions produce `null` dimension fields. | Normalizer logs WARN for every unparsed description. After the first full dry-run, audit the WARN lines to identify missing patterns and add them before the apply run. The product still stages and applies — it just lacks searchable tire dimensions until the regex is extended. |
| R10 | The two adapters (`teraflex-wheels`, `teraflex-tires`) share a Redis queue (`vendor-sync:apply`). If both cron runs fire simultaneously, 2x the concurrent workers hit Postgres/Medusa. | Acceptable at `VENDOR_SYNC_APPLY_CONCURRENCY=8` — that's 16 total. The skip-if-running guard is per-vendor_code, so both can run in parallel. If this causes resource pressure, stagger the crons (tires at `0 1,13 * * *`) by editing the job schedule. |
| R11 | The wheel CSV sample has zero `ImageURL` values. With the "skip items without image" rule, the entire wheel catalog could be empty until the vendor starts populating images. | The user accepted this explicitly. The dry-run output will report `skipped_no_image_count` prominently so this is visible before any apply. If the full production feed does populate wheel images, this is a non-issue. If it does not, the user can override the skip rule for wheels in a follow-up by adding a per-adapter `requireImage` config flag (trivial change in the staging filter). |

---

## 15. Self-Review

Checked against the brief's 12 deliverables: §2 covers module layout, §3 covers data model, §4 covers adapter interface, §5 covers workflow composition, §6 covers queue topology, §7 covers scheduled job, §8 covers admin endpoints, §9 covers env vars and conditional loading, §10 covers migrations, §11 covers test strategy, §12 covers observability, §13 covers the phased commit plan. §14 adds a risk register that the brief didn't explicitly request but flags the verify-on-install Meilisearch question the brief told me to surface.

No placeholders or TBDs. Every workflow named in §5 is one I confirmed exists in Medusa 2.13.6 via the `@medusajs/medusa/core-flows` docs (`createProductsWorkflow`, `updateProductsWorkflow`, `batchProductsWorkflow`, `deleteProductsWorkflow`, `upsertVariantPricesWorkflow`, `createInventoryLevelsWorkflow`, `updateInventoryLevelsWorkflow`, `batchInventoryItemLevelsWorkflow`, `createStockLocationsWorkflow`). Types and method signatures are consistent across sections.
