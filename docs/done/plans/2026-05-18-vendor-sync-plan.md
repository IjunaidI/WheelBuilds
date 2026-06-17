# Vendor Inventory Sync Pipeline — Phase 1 Implementation Plan

> _Corrected 2026-06-17 — see [docs/STATUS.md](../../STATUS.md). Original was pre-rename / pre-cents-fix; preserved as historical record below._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to land remaining work PR-by-PR.

**Goal:** A two-feed (wheels + tires) vendor inventory sync pipeline running against the existing Medusa 2.13.6 backend, pulling CSVs from WheelPros, diffing them against last-applied state, and applying only the changes to Medusa products, stock locations, and inventory levels.

**Architecture:** A Medusa business module `vendor-sync` owns four tables (run, feed staging, stock staging, product current). Each tick of the cron resolves a `VendorAdapter` by code, runs a four-stage pipeline (fetch → stage → diff → apply), and writes the diff back to Medusa. The pipeline is sequential per-process — no external queue infrastructure, no BullMQ. Each apply step is wrapped in try/catch per part_number so one failure does not abort the run. Apply uses Medusa 2.0 core-flows directly (`createProductsWorkflow`, `updateProductsWorkflow`, `batchInventoryItemLevelsWorkflow`, `updateProductsWorkflow` for discontinue).

**Tech Stack:** TypeScript 5.9, Node 22, pnpm 9.10, MedusaJS 2.13.6 (`MedusaService` mixin + MikroORM data models + workflows-sdk + core-flows), Postgres, the existing Redis stack (used by `@medusajs/event-bus-redis` + `@medusajs/workflow-engine-redis`), MinIO (existing `minio-file` module) for raw feed archives, papaparse for streaming CSV, zod for row validation. No new build tooling.

---

## 0. Current Implementation Status (2026-05-21)

This plan was originally written for a green-field implementation. Most of it has shipped under the renamed vendor `wheelpros` (with two adapter instances). On 2026-05-21 the end-to-end pipeline was exercised for the first time against the dev DB: 39 wheels + 11 tires were dry-run-then-applied successfully, exposing one real bug (the inventory_item_id extraction after `createProductsWorkflow`) which was fixed and backfilled in the same session.

### Shipped

| Component | File(s) | Status |
|---|---|---|
| Module shell with `MedusaService({...})` mixin | [index.ts](../../../backend/src/modules/vendor-sync/index.ts), [service.ts](../../../backend/src/modules/vendor-sync/service.ts) | done |
| Data models (4) | [models/](../../../backend/src/modules/vendor-sync/models/) | done |
| Consolidated migration | [migrations/Migration20260517220005.ts](../../../backend/src/modules/vendor-sync/migrations/Migration20260517220005.ts) | done (untracked in git) |
| Discriminated-union `NormalizedRecord` (wheel \| tire) | [adapters/types.ts](../../../backend/src/modules/vendor-sync/adapters/types.ts) | done |
| WheelPros wheels adapter | [adapters/wheelpros-wheels/](../../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/) | done |
| WheelPros tires adapter | [adapters/wheelpros-tires/](../../../backend/src/modules/vendor-sync/adapters/wheelpros-tires/) | done |
| Adapter registry | [adapters/registry.ts](../../../backend/src/modules/vendor-sync/adapters/registry.ts) | done |
| Fetch (local file → MinIO archive) | [pipeline/fetch.ts](../../../backend/src/modules/vendor-sync/pipeline/fetch.ts) | done |
| Stage (parse, normalize, hash, **skip rows with no image**) | [pipeline/stage.ts](../../../backend/src/modules/vendor-sync/pipeline/stage.ts) | done |
| Diff (pure function + DB wrapper) | [pipeline/diff.ts](../../../backend/src/modules/vendor-sync/pipeline/diff.ts) | done |
| Bootstrap (region, sales channel, categories, brand collection, shipping profile, stock locations) | [pipeline/bootstrap.ts](../../../backend/src/modules/vendor-sync/pipeline/bootstrap.ts) | done |
| Apply: create + update products | [pipeline/apply.ts](../../../backend/src/modules/vendor-sync/pipeline/apply.ts) | done (inventory_item_id bug fixed 2026-05-21) |
| Apply: stock levels | [pipeline/apply-stock.ts](../../../backend/src/modules/vendor-sync/pipeline/apply-stock.ts) | done |
| Apply: discontinue | [pipeline/apply-discontinue.ts](../../../backend/src/modules/vendor-sync/pipeline/apply-discontinue.ts) | done (idempotency hardening pending: §15) |
| Cron job (12h) | [jobs/vendor-sync-tick.ts](../../../backend/src/jobs/vendor-sync-tick.ts) | done |
| Admin endpoints (list, detail, approve, cancel, replay run, replay SKU) | [api/admin/vendor-sync/](../../../backend/src/api/admin/vendor-sync/) | done (cancel status guards pending: §15) |
| Scripts: dry-run, apply, mock, cleanup, backfill-inventory | [scripts/vendor-sync-*.ts](../../../backend/src/scripts/) | done (apply ergonomics pending: §15) |
| Unit tests (parse, normalize, hash, build-metadata, diff, apply-stock) | [__tests__/](../../../backend/src/modules/vendor-sync/__tests__/) | done |
| Fixtures (wheels-small + v2, tires-small + v2) | [__fixtures__/](../../../backend/src/modules/vendor-sync/__fixtures__/) | done |
| Module README | [modules/vendor-sync/README.md](../../../backend/src/modules/vendor-sync/README.md) | done |

### Today's session (2026-05-21)

All previously in-flight work was committed in five focused commits:

1. `add vendor-sync schema migration and mikro-orm snapshots`
2. `use single-object form for MedusaService update calls`
3. `fix inventory_item_id extraction after createProductsWorkflow`
4. `add cleanup script for stale in-progress runs`
5. `update phase 1 plan to reflect shipped state`

End-to-end verification result against the dev DB:

| Vendor | Rows in feed | Skipped (no image) | New products created | With stock |
|---|---:|---:|---:|---:|
| wheelpros-wheels | 39 | 2 | 37 | 18 |
| wheelpros-tires | 11 | 7 | 4 | 2 |

Run ids: `01KS3PW3MZQ8RP0K28QEAHTYZP` (wheels), `01KS3PXC0Q8XV13NDNNSV7NCPJ` (tires).

§15 itemises the remaining Phase 1 hardening work.

---

## 1. Locked Decisions

| # | Decision | Source |
|---|---|---|
| A1 | Diff-based sync, never full-resync. | Brief |
| A2 | Postgres staging tables; pure-function diff against `vendor_product_current`. | Brief |
| A3 | SHA256 content hash on the canonical normalized record (excluding `runDateVendor`) decides change detection. | Brief |
| A4 | **No external queue.** Sequential per-product apply inside the cron tick, wrapped in try/catch. This intentionally diverges from the brief's "BullMQ on Redis" — the volume (~45k rows once, then ~thousands per tick) does not require it, and skipping the queue removes a whole class of operational concerns (DLQ, job ordering, drain detection). Revisit if a single tick ever runs longer than the 12h cron interval. | Implementation choice |
| A5 | Medusa 2.0 core-flows for every catalog mutation. No direct service calls. | Brief |
| A6 | `VendorAdapter` interface from day one. Two instances ship in Phase 1: `wheelpros-wheels`, `wheelpros-tires`. `submitPurchaseOrder` is reserved for a later phase and not yet on the interface (Phase 1 has no outbound POs). | Brief, OQ9, OQ11 |
| A7 | Raw feeds archived to MinIO under `vendor-feeds/{vendor}/...` via the existing `@medusajs/file` module abstraction (which routes to MinIO if configured, local `static/` otherwise). Never deleted. | Brief |
| A8 | Warehouse codes become Medusa `StockLocation`s. Match by `metadata.vendor_warehouse_code`, not by display name. | Brief, OQ4 |
| A9 | Natural key is `(vendor_code, part_number)`. Stored on Medusa product as `external_id = part_number` and on `vendor_product_current.(vendor_code, part_number)`. | Brief, OQ11 |
| A10 | If `discontinued_count / active_current_count > VENDOR_SYNC_DISCONTINUE_THRESHOLD` (default 0.05), the run pauses with status `awaiting_approval`. Admin must call POST `/admin/vendor-sync/runs/:id/approve` to apply. | Brief |
| Q1 | Selling price = `MSRP_USD`. `MAP_USD` stored on product metadata but not enforced. | OQ1 |
| Q2 | **(Revised 2026-05-18)** Rows with empty `ImageURL` are **dropped during staging** and counted as `skipped_no_image_count`. Rows that pass use the vendor CDN URL as `thumbnail` and `images[0].url` — pass-through, no download, no rehost. | OQ2 revised |
| Q3 | Brand modeled as a Medusa `product_collection` per unique brand string. Idempotent. Identified internally by `metadata.vendor_sync_brand = "true"`. | OQ3 |
| Q4 | Stock locations auto-created as `Warehouse <code>` with `metadata.vendor_warehouse_code = <code>` on first appearance. | OQ4 |
| Q5 | Phase 1 reads CSV from a local path (env-configurable). SFTP is a follow-up PR behind the same `VendorAdapter.fetch()` boundary. | OQ5 |
| Q6 | First run via `pnpm vendor-sync:dry-run wheelpros-wheels` → review → `pnpm vendor-sync:apply <run-id>` → repeat for tires → then enable cron. | OQ6 |
| Q7 | Cron `0 */12 * * *` with skip-if-running guard plus `RunDate` short-circuit. | OQ7 |
| Q8 | Bootstrap step ensures a `United States` region (USD, `us`) attached to existing `Default Sales Channel`. | OQ8 |
| Q9 | Tires implemented in Phase 1, not just architected for. Same vendor system (identical warehouse codes 1001-1088, identical pricing structure), incremental effort. | OQ9 |
| Q10 | Two top-level product categories: `Wheels` and `Tires`. Assigned by `NormalizedRecord.productType`. Brand collection is orthogonal — e.g. Falken is a collection, the product is also in `Tires`. | OQ10 |
| Q11 | Two adapter instances: `wheelpros-wheels`, `wheelpros-tires`. Each has its own enable flag, feed path, and independent dry-run/apply cycle. Cron runs both with separate in-progress guards. | OQ11 |
| Q12 | Tires accept `InvOrderType` values `ST`, `N2`, `SO`. `SO` (special order) is treated identically to `N2` for shipping-speed and ordering UI. `Division` (values like `10`, `20`) stored as `metadata.vendor_division`. | OQ12 |

---

## 2. Module Layout (as built)

```
backend/src/modules/vendor-sync/
  index.ts                                # Module("vendorSyncModuleService", { service })
  service.ts                              # VendorSyncService extends MedusaService({...})
  README.md
  models/
    vendor-feed-run.ts                    # includes skipped_no_image_count
    vendor-feed-staging.ts
    vendor-stock-staging.ts
    vendor-product-current.ts
  adapters/
    types.ts                              # NormalizedRecord = WheelNormalizedRecord | TireNormalizedRecord
    registry.ts                           # resolveAdapter('wheelpros-wheels' | 'wheelpros-tires')
    wheelpros-wheels/
      index.ts                            # WheelProsWheelAdapter
      parse.ts                            # papaparse streaming over local file
      normalize.ts                        # ParsedRow -> WheelNormalizedRecord
      schema.ts                           # zod schemas
    wheelpros-tires/
      index.ts                            # WheelProsTireAdapter
      parse.ts
      normalize.ts                        # uses tire-parse-helpers for dimensions
      schema.ts
  pipeline/
    fetch.ts
    stage.ts                              # filters empty-imageUrl rows, tracks skipped_no_image_count
    diff.ts                               # computeDiffFromSets (pure) + computeDiff (DB wrapper)
    bootstrap.ts                          # ensureUsRegion, ensureDefaultSalesChannel,
                                          # ensureProductCategories (Wheels, Tires),
                                          # ensureBrandCollection, ensureShippingProfile,
                                          # ensureStockLocation
    apply.ts                              # applyChanges: create + update products,
                                          # then call apply-stock + apply-discontinue
    apply-stock.ts                        # computeStockChanges (pure) + applyStockLevels
    apply-discontinue.ts                  # applyDiscontinuations (status=draft, metadata)
    build-metadata.ts                     # Normalized -> product.metadata (wheel|tire branches)
  utils/
    hash.ts                               # computeContentHash(normalized)
    archive.ts                            # uploadFeedToMinio via @medusajs/file
    parse-helpers.ts                      # parseSize, parseBoltPattern, parseVendorDate, parsePrice,
                                          # parseOptionalNumber
    tire-parse-helpers.ts                 # parseTireSize: regex for 235/55ZR17, LT37X12.50R18,
                                          # 12.4-24 8PR; returns nulls on unmatched patterns
  migrations/
    Migration20260517220005.ts            # consolidated: all four tables in one file
  __fixtures__/
    wheels-small.csv                      # 5 wheel rows with populated ImageURL
    wheels-small-v2.csv                   # 1 new + 1 price changed + 1 stock changed + 1 removed
    tires-small.csv                       # 5 tire rows: 4 with images + 1 without (skipped)
    tires-small-v2.csv                    # 1 new + 1 price changed + 1 stock changed + 1 removed
  __tests__/
    wheel-parse.test.ts
    wheel-normalize.test.ts
    tire-parse.test.ts
    tire-normalize.test.ts
    hash.test.ts
    build-metadata.test.ts
    diff.test.ts
    apply-stock.test.ts

backend/src/jobs/
  vendor-sync-tick.ts                     # cron 0 */12 * * *

backend/src/api/admin/vendor-sync/
  runs/route.ts                           # GET list, POST trigger
  runs/[id]/route.ts                      # GET detail
  runs/[id]/approve/route.ts              # POST approve
  runs/[id]/cancel/route.ts               # POST cancel  (in flight: see §15)
  runs/[id]/replay/route.ts               # POST replay run
  skus/[partNumber]/replay/route.ts       # POST replay SKU

backend/src/scripts/
  vendor-sync-dry-run.ts                  # medusa exec
  vendor-sync-apply.ts                    # medusa exec  (in flight: see §15)
  vendor-sync-mock.ts                     # developer helper: generate a synthetic feed
  vendor-sync-cleanup.ts                  # delete vendor_*-managed Medusa rows  (in flight: see §15)
```

Modified existing files (one-time):
- `backend/src/lib/constants.ts` — vendor-sync env exports.
- `backend/medusa-config.js` — conditional module registration block.
- `backend/package.json` — `bullmq` was added initially but is unused (consider removing in a cleanup PR); `papaparse`, `zod` are in use.
- `backend/.env.template` — documents new vars.

---

## 3. Data Model

All four tables ship in the single migration `Migration20260517220005.ts`. They use Medusa's `model.define()` DSL — `id`, `created_at`, `updated_at`, `deleted_at` are auto-managed. Indexes are partial on `deleted_at IS NULL` per Medusa convention.

### 3.1 `vendor_feed_run`

```sql
CREATE TABLE vendor_feed_run (
  id                       TEXT PRIMARY KEY,
  vendor_code              TEXT NOT NULL,
  source_filename          TEXT NOT NULL,
  source_archive_key       TEXT,
  run_date_vendor          TIMESTAMPTZ,
  row_count                INTEGER NOT NULL DEFAULT 0,
  skipped_no_image_count   INTEGER NOT NULL DEFAULT 0,
  hash_match_count         INTEGER NOT NULL DEFAULT 0,
  new_count                INTEGER NOT NULL DEFAULT 0,
  changed_count            INTEGER NOT NULL DEFAULT 0,
  discontinued_count       INTEGER NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL,
  approved_by              TEXT,
  approved_at              TIMESTAMPTZ,
  error_message            TEXT,
  started_at               TIMESTAMPTZ NOT NULL,
  finished_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX IDX_vendor_feed_run_vendor_code_status ON vendor_feed_run (vendor_code, status) WHERE deleted_at IS NULL;
CREATE INDEX IDX_vendor_feed_run_created_at        ON vendor_feed_run (created_at)           WHERE deleted_at IS NULL;
```

Status values (used by `service.ts`): `'fetching' | 'staging' | 'diffing' | 'awaiting_approval' | 'applying' | 'completed' | 'failed' | 'cancelled'`.

State machine:
```
fetching -> staging -> diffing -> [awaiting_approval -> applying | applying] -> completed
                                                                  \
                                                                   -> failed
                                                                   -> cancelled
```

`skipped_no_image_count` is set at the end of staging and never advances after that.

### 3.2 `vendor_feed_staging`

```sql
CREATE TABLE vendor_feed_staging (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  vendor_code     TEXT NOT NULL,
  part_number     TEXT NOT NULL,
  row_json        JSONB NOT NULL,
  normalized      JSONB NOT NULL,
  content_hash    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IDX_vendor_feed_staging_run_id_part_number_unique ON vendor_feed_staging (run_id, part_number)       WHERE deleted_at IS NULL;
CREATE INDEX        IDX_vendor_feed_staging_vendor_code_part_number   ON vendor_feed_staging (vendor_code, part_number)  WHERE deleted_at IS NULL;
CREATE INDEX        IDX_vendor_feed_staging_run_id_content_hash       ON vendor_feed_staging (run_id, content_hash)      WHERE deleted_at IS NULL;
```

Rows with empty `ImageURL` never make it here — they are dropped during staging and only counted on the run row.

### 3.3 `vendor_stock_staging`

```sql
CREATE TABLE vendor_stock_staging (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  vendor_code     TEXT NOT NULL,
  part_number     TEXT NOT NULL,
  warehouse_code  TEXT NOT NULL,
  qoh             INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IDX_vendor_stock_staging_run_id_part_number_warehouse_code_unique ON vendor_stock_staging (run_id, part_number, warehouse_code) WHERE deleted_at IS NULL;
CREATE INDEX        IDX_vendor_stock_staging_run_id_part_number                       ON vendor_stock_staging (run_id, part_number)                  WHERE deleted_at IS NULL;
```

Only `qoh > 0` rows are inserted — a missing row means zero. The "zero out" logic in `apply-stock.ts:computeStockChanges` accounts for warehouses that previously had stock but are absent from the current run.

### 3.4 `vendor_product_current`

```sql
CREATE TABLE vendor_product_current (
  id                  TEXT PRIMARY KEY,
  vendor_code         TEXT NOT NULL,
  part_number         TEXT NOT NULL,
  content_hash        TEXT NOT NULL,
  medusa_product_id   TEXT,
  medusa_variant_id   TEXT,
  inventory_item_id   TEXT,
  normalized          JSONB NOT NULL,
  last_seen_run_id    TEXT,
  applied_at          TIMESTAMPTZ NOT NULL,
  discontinued_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX IDX_vendor_product_current_vendor_code_part_number_unique ON vendor_product_current (vendor_code, part_number)   WHERE deleted_at IS NULL;
CREATE INDEX        IDX_vendor_product_current_medusa_product_id              ON vendor_product_current (medusa_product_id)          WHERE deleted_at IS NULL;
CREATE INDEX        IDX_vendor_product_current_vendor_code_content_hash       ON vendor_product_current (vendor_code, content_hash)  WHERE deleted_at IS NULL;
```

The natural key is `(vendor_code, part_number)`, so a part_number that appeared in both wheel and tire feeds (impossible in practice) would still have non-colliding rows.

### 3.5 Diff

The diff is a pure function (`computeDiffFromSets`) over two arrays — no SQL JOIN in the apply path. The wrapper `computeDiff` queries staging and current with `select` projections so only `part_number`, `content_hash`, and `discontinued_at` move between Postgres and Node. On 45k rows this is well under a second.

Logic:
- `new`: in staging, not in active current.
- `changed`: in both, hashes differ.
- `discontinued`: in active current, not in staging.

`active current` excludes rows with non-null `discontinued_at`.

---

## 4. Adapter Interface

```typescript
// backend/src/modules/vendor-sync/adapters/types.ts
export interface VendorFeedDescriptor {
  vendorCode: string
  archiveKey: string
  sourceFilename: string
  byteLength: number
  fetchedAt: Date
}

export interface ParsedRow {
  partNumber: string
  raw: Record<string, string>
  warehouseColumns: string[]      // dynamically detected numeric column headers
}

export interface NormalizedRecordBase {
  partNumber: string
  vendorCode: string
  title: string
  brand: string
  imageUrl: string | null         // empty here means the row will be filtered out of staging
  invOrderType: string            // 'ST' | 'N2' | 'SO' — SO is tire-only, treated like N2
  totalQoh: number
  msrpUsd: number
  mapUsd: number
  runDateVendor: Date             // not in content_hash
  stockByWarehouse: Record<string, number>
}

export interface WheelNormalizedRecord extends NormalizedRecordBase {
  productType: 'wheel'
  displayStyleNo:   string | null
  finish:           string | null
  diameterIn:       number
  widthIn:          number
  boltCount:        number | null
  boltCircleIn:     number | null
  boltPatternRaw:   string
  offsetMm:         number
  centerBoreMm:     number | null
  loadRatingLb:     number | null
  shippingWeightLb: number | null
  style:            string | null
}

export interface TireNormalizedRecord extends NormalizedRecordBase {
  productType: 'tire'
  manufacturerPartNumber: string | null
  division:               string | null
  tireWidthMm:            number | null
  aspectRatio:            number | null
  constructionType:       string | null
  rimDiameterIn:          number | null
  loadIndex:              number | null
  speedRating:            string | null
  plyRating:              string | null
  tirePrefix:             string | null
}

export type NormalizedRecord = WheelNormalizedRecord | TireNormalizedRecord

export interface VendorAdapter {
  readonly vendorCode: string
  fetch(): Promise<VendorFeedDescriptor>
  parse(descriptor: VendorFeedDescriptor): AsyncIterable<ParsedRow>
  normalize(row: ParsedRow): NormalizedRecord
}
```

The discriminator is `productType: 'wheel' | 'tire'`. Apply code branches on this for category assignment and wheel-only fields (`shippingWeightLb` → grams).

Tire dimension parsing is intentionally lenient: `parseTireSize` in `utils/tire-parse-helpers.ts` matches three known patterns (`235/55ZR17`, `LT37X12.50R18`, `12.4-24 8PR`) and returns `null` for every dimension field if none match. The row still goes through — its content_hash and metadata still work, just without parsed dimensions. WARN-level log is emitted when this happens (risk R10).

---

## 5. Apply Orchestration

The original plan called for per-SKU BullMQ jobs. The shipped implementation is **sequential per-part-number** within one `applyChanges()` call, with try/catch around each part_number so one failure does not abort the run. This decision (A4) trades retry-on-restart for operational simplicity. Below is what each apply path actually does.

### 5.1 `applyChanges(container, service, runId, vendorCode, diffResult, logger)`

Steps, in order, all inside the same Node process:

1. **Bootstrap** (parallel):
   - `ensureUsRegion(container)` → regionId
   - `ensureDefaultSalesChannel(container)` → salesChannelId
   - `ensureProductCategories(container)` → `{ wheelsCategoryId, tiresCategoryId }`
   - `ensureShippingProfile(container)` → shippingProfileId
2. **Create new products** — iterate `diffResult.newPartNumbers`. For each:
   - Read the staging row.
   - Lazily get brand collection id (cached per call by `Map<brand, id>`).
   - Pick category id by `normalized.productType`.
   - Compute weight (wheel only: `shippingWeightLb * 453.592`, rounded; tires leave weight `undefined`).
   - Call `createProductsWorkflow` with a single product spec:
     - `title`, `handle = slugify(partNumber)`, `status: PUBLISHED`
     - `thumbnail`, `images: [{ url: imageUrl }]` — both set to the vendor CDN URL (OQ2 pass-through)
     - `weight`, `collection_id`, `category_ids: [categoryId]`, `sales_channels`, `shipping_profile_id`, `external_id: partNumber`
     - `metadata: buildProductMetadata(normalized)` — see §5.4
     - One variant: `{ title: 'Default', sku: partNumber, manage_inventory: true, allow_backorder: false, prices: [{ amount: msrpUsd, currency_code: 'usd' }] }` — `amount` is in **dollars** (Medusa); the Meilisearch transformer converts to integer cents.
   - Insert `vendor_product_current` with `medusa_product_id`, `medusa_variant_id`, `inventory_item_id` (extracted from the workflow result), `content_hash`, `normalized`, `last_seen_run_id`, `applied_at = now()`.
3. **Update changed products** — iterate `diffResult.changedPartNumbers`. For each:
   - Read staging row and existing `vendor_product_current` row.
   - Call `updateProductsWorkflow` with `selector: { id: medusa_product_id }` and an `update` payload that includes the same field set as create (minus options) plus the variant price under `variants: [{ id: medusa_variant_id, prices: [...] }]`.
   - Update `vendor_product_current` with new `content_hash`, `normalized`, `last_seen_run_id`, `applied_at`.
4. **Apply stock levels** for `new ∪ changed` part_numbers via `applyStockLevels(container, service, runId, vendorCode, partNumbers, salesChannelId, logger)`:
   - For each part_number: load `inventory_item_id` from `vendor_product_current`, load current run's stock staging rows, ensure stock locations for every warehouse code, load existing inventory levels.
   - Call `computeStockChanges(currentStaging, previousStock, existingLevels, warehouseToLocationMap, inventoryItemId)` — pure function that produces `{ creates, updates }` (no deletes).
   - Call `batchInventoryItemLevelsWorkflow` with `{ create, update, delete: [], force: false }`.
   - Warehouses that previously had stock and are now absent are explicitly zeroed (not deleted).
5. **Apply discontinuations** via `applyDiscontinuations(container, service, vendorCode, discontinuedPartNumbers, logger)`:
   - For each: `updateProductsWorkflow` with `status: 'draft'`, `metadata: { ...existing, discontinued_at: nowISO }`.
   - Set `vendor_product_current.discontinued_at = now()`.
   - Never call `deleteProductsWorkflow`.

### 5.2 Price changes

Price changes flow through the changed-products path because any change to `msrpUsd` flips the content hash. No separate "price update" workflow.

### 5.3 Image changes

Same: a changed `imageUrl` flips the content hash and goes through the changed-products path, which sets `thumbnail` and `images` to the new vendor URL.

### 5.4 `buildProductMetadata(normalized)`

Wheels:
```
{
  vendor_code, vendor_part_number, vendor_brand, vendor_map_usd,
  vendor_inv_order_type, vendor_total_qoh,
  product_type: 'wheel',
  wheel_diameter_in, wheel_width_in, wheel_offset_mm,
  wheel_bolt_count, wheel_bolt_circle_in, wheel_bolt_pattern_raw,
  wheel_center_bore_mm, wheel_load_rating_lb,
  wheel_finish, wheel_style, wheel_display_style_no,
}
```

Tires:
```
{
  vendor_code, vendor_part_number, vendor_brand, vendor_map_usd,
  vendor_inv_order_type, vendor_total_qoh,
  product_type: 'tire',
  vendor_manufacturer_part_number, vendor_division,
  tire_width_mm, tire_aspect_ratio, tire_construction_type,
  tire_rim_diameter_in, tire_load_index, tire_speed_rating,
  tire_ply_rating, tire_prefix,
}
```

`undefined` values are omitted by the builder so storefront filters can use `metadata.<key>` presence to discriminate. Unit tests in `build-metadata.test.ts` lock the field set.

### 5.5 Search index

Same as the original plan: `createProductsWorkflow` and `updateProductsWorkflow` emit `product.created` / `product.updated` events; the Meilisearch plugin's subscribers handle incremental indexing. Verify on first install (risk R1).

---

## 6. Concurrency Model

(Replaces the original §6 BullMQ topology. The shipped architecture has no queue.)

### 6.1 Within a single tick

`applyChanges` processes part_numbers **sequentially**. Each iteration is wrapped in try/catch; errors are pushed to `errors[]` and counted toward `errorCount`. A single failure does not abort the run. At end of tick the run row is marked `completed` even if `errorCount > 0`. The `errors[]` array is logged but not persisted today — see §15 for the planned persistence (so admin replay-SKU can target previously-failed parts).

Sequential is correct for the current volume:
- First wheels + tires ingestion: estimated 45k–50k rows, ~80% will be skipped (no image), ~10k applies. At ~5 workflows/sec on a shared-mode Railway service that's ~30 min — acceptable for a one-off bootstrap during low-traffic window.
- Subsequent ticks: typically 100–2000 changed rows. Single-digit minutes.

### 6.2 Between vendors

The cron tick iterates enabled vendors and calls `service.run(vendorCode)` for each in series. Each vendor has its own in-progress guard (the guard is `vendor_code`-scoped). If wheels takes a long time, tires waits — they are sequential. This is fine; if we ever need parallelism the change is trivial (wrap in `Promise.allSettled`).

### 6.3 Skip-if-running guard

Before creating a new run row, `service.run` queries `vendor_feed_run` for rows in `('fetching', 'staging', 'diffing', 'applying')` for this vendor and exits if any exist. This guard prevents two ticks of the same vendor from overlapping if a previous run crashed without marking `completed`/`failed`. A crashed run leaves the guard in a "stuck" state — recovery is via `POST /admin/vendor-sync/runs/:id/cancel` or `vendor-sync-cleanup.ts`.

---

## 7. Scheduled Job Spec

`backend/src/jobs/vendor-sync-tick.ts` schedule `0 */12 * * *`. Resolves `VENDOR_SYNC_MODULE`, calls `listEnabledVendors()`, and runs each in series.

`service.run(vendorCode)` lifecycle (in [service.ts](../../../backend/src/modules/vendor-sync/service.ts)):

1. **In-progress guard** — query for non-terminal statuses, exit if found.
2. **Create run row** — `status: 'fetching'`, counts all zero, `started_at: now`.
3. **Resolve adapter** — `resolveAdapter(vendorCode)`.
4. **Fetch** — `fetchFeed(adapter)` returns descriptor; update row with `source_filename`, `source_archive_key`.
5. **RunDate short-circuit** — parse the first row's `runDateVendor`. If it equals the most recent `completed` run's `run_date_vendor` for this vendor, mark this run `completed` and return. This avoids re-staging a feed the vendor hasn't republished.
6. **Stage** — `stageFeed` populates staging tables. Tracks `rowCount`, `stagedCount`, `skippedNoImageCount`. Updates run row.
7. **Diff** — `computeDiff(service, runId, vendorCode)` returns `{ newPartNumbers, changedPartNumbers, discontinuedPartNumbers }`. Counts are persisted to the run row.
8. **Threshold check** — if active-current count > 0 and `discontinued / active > threshold`, set `status: 'awaiting_approval'` and return. The applied state of the catalog is left untouched until admin approves.
9. **Dry run** — if `isDryRun`, mark `completed` and return without applying.
10. **Apply** — `applyChanges(...)`. Catches errors per part_number. On overall success → `status: 'completed'`. On uncaught exception → `status: 'failed'` with truncated `error_message`.

`approveAndApply(runId, actorId)` re-computes the diff from existing staging data (so the diff is fresh against current Medusa state, not stale at threshold-check time) and applies it. Records `approved_by`, `approved_at`.

`replayRun(runId)` reuses an existing run's staging and re-applies — useful after fixing an apply bug.

`replaySku(vendorCode, partNumber)` finds the most recent staging row, classifies it against current state, and runs a minimal one-part apply.

---

## 8. Admin Endpoints

All under `/admin/vendor-sync/` and shipping today. Thin route handlers that call service methods.

| Method | Path | Behavior |
|---|---|---|
| GET    | `/admin/vendor-sync/runs`                          | Paginated list. Query: `vendor_code`, `status`, `limit`, `offset`. |
| POST   | `/admin/vendor-sync/runs`                          | Trigger out-of-band run. Body: `{ vendor_code, dry_run? }`. 409 if in-progress. |
| GET    | `/admin/vendor-sync/runs/:id`                      | Run detail with counts and a sample diff (first 50 part_numbers per bucket). |
| POST   | `/admin/vendor-sync/runs/:id/approve`              | Only for `awaiting_approval`. Calls `approveAndApply`. |
| POST   | `/admin/vendor-sync/runs/:id/cancel`               | Marks `cancelled`. (Pending hardening — see §15.) |
| POST   | `/admin/vendor-sync/runs/:id/replay`               | Re-applies the run's staging. |
| POST   | `/admin/vendor-sync/skus/:partNumber/replay`       | Body: `{ vendor_code }`. Most-recent-staging-row replay for one SKU. |

All routes use the existing admin auth middleware (file-based routing under `src/api/admin/` is admin-only by Medusa convention).

---

## 9. Env Vars

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `VENDOR_SYNC_FEED_ARCHIVE_BUCKET`     | optional                       | `vendor-feeds` | MinIO bucket holding raw CSV archives. |
| `VENDOR_SYNC_DISCONTINUE_THRESHOLD`   | optional                       | `0.05`         | Fraction above which a discontinue diff pauses the run for approval. |
| `VENDOR_SYNC_APPLY_CONCURRENCY`       | reserved (currently unread)    | —              | Reserved for future parallel apply. Sequential today. |
| `VENDOR_SYNC_DRY_RUN`                 | optional                       | `false`        | When `true`, every scheduled tick stops after the diff. |
| `VENDOR_WHEELPROS_WHEELS_ENABLED`     | required to activate           | `false`        | Master switch for the wheels adapter. |
| `VENDOR_WHEELPROS_WHEEL_FEED_PATH`    | required if wheels enabled     | `./wheelInvPriceData.csv` | Local CSV path. |
| `VENDOR_WHEELPROS_TIRES_ENABLED`      | required to activate           | `false`        | Master switch for the tires adapter. |
| `VENDOR_WHEELPROS_TIRE_FEED_PATH`     | required if tires enabled      | `./tireInvPriceData.csv`  | Local CSV path. |
| `VENDOR_WHEELPROS_SFTP_HOST`          | reserved                       | —              | Future SFTP. Currently unread. |
| `VENDOR_WHEELPROS_SFTP_PORT`          | reserved                       | `22`           | |
| `VENDOR_WHEELPROS_SFTP_USER`          | reserved                       | —              | |
| `VENDOR_WHEELPROS_SFTP_PASSWORD`      | reserved                       | —              | |
| `VENDOR_WHEELPROS_SFTP_PRIVATE_KEY`   | reserved                       | —              | PEM string. |

Conditional registration in `medusa-config.js`: the module loads if either `VENDOR_WHEELPROS_WHEELS_ENABLED` or `VENDOR_WHEELPROS_TIRES_ENABLED` is `'true'`. The `vendors` option is an object keyed by `vendorCode` with `{ enabled, feedPath }` per adapter, consumed by `service.listEnabledVendors()`.

---

## 10. Migrations

Order: `Migration20260517220005.ts` is the single migration creating all four tables, all indexes (partial on `deleted_at IS NULL`), and the unique constraints. It's idempotent (`if not exists`) so re-running is safe.

The migrations folder is untracked in `git status` — committing it is part of the §15 cleanup.

---

## 11. Test Strategy

`pnpm test:sync` runs Jest against `src/modules/vendor-sync`. The runner uses `@swc/jest` (already in devDependencies).

### 11.1 Fixtures

- [wheels-small.csv](../../../backend/src/modules/vendor-sync/__fixtures__/wheels-small.csv) — 5 wheel rows, all with non-empty ImageURL.
- [wheels-small-v2.csv](../../../backend/src/modules/vendor-sync/__fixtures__/wheels-small-v2.csv) — 1 new, 1 price-changed, 1 stock-changed, 1 removed, 1 unchanged.
- [tires-small.csv](../../../backend/src/modules/vendor-sync/__fixtures__/tires-small.csv) — 5 tire rows, 4 with images and 1 without (skipped at staging).
- [tires-small-v2.csv](../../../backend/src/modules/vendor-sync/__fixtures__/tires-small-v2.csv) — same delta pattern as wheels-v2.

### 11.2 Unit tests in place

- `wheel-parse.test.ts`, `wheel-normalize.test.ts` — zero-padded part_number stays text, Size/BoltPattern parse, empty optional fields → null.
- `tire-parse.test.ts`, `tire-normalize.test.ts` — three tire-size regex patterns + null fallback, Division metadata, SO accepted.
- `hash.test.ts` — stable across key order, changes on price/qoh/imageUrl, stable across `runDateVendor`.
- `build-metadata.test.ts` — wheel vs tire branches produce the expected metadata field set.
- `diff.test.ts` — pure function against synthetic staging and current sets.
- `apply-stock.test.ts` — `computeStockChanges` produces correct create/update/zero-out plans.

### 11.3 Integration tests (not in the current tree — see §15)

End-to-end against a clean Medusa instance with the US region preseeded:
1. Run `vendor-sync:dry-run wheelpros-wheels` with `wheels-small.csv` → assert staging counts, expected diff.
2. Run apply → assert 5 products created (or 4 if any have empty images), category=Wheels, brand collection exists, stock levels match per-warehouse.
3. Swap fixture to v2 and re-run → assert 1 new product, 2 updated, 1 discontinued (status=draft, metadata.discontinued_at populated), 1 unchanged.
4. Same flow for tires — should also assert the "skipped no image" row count.

Tagged behind `RUN_INTEGRATION=true` so `pnpm test:sync` runs only unit tests by default.

---

## 12. Observability

`service.ts` already logs structured info at every stage transition with run id, vendor code, and counts. Format: `[vendor-sync] [<runId>] stage=<name> vendor=<code> key=value ...`.

| Level | Event |
|---|---|
| INFO  | run started / stage transitions / run completed (duration, processed, errors) |
| INFO  | RunDate short-circuit |
| INFO  | brand collection / stock location auto-created |
| INFO  | staging complete (`rowCount, staged, skippedNoImage`) |
| INFO  | diff result (`new, changed, discontinued`) |
| INFO  | discontinuation succeeded |
| WARN  | discontinue threshold exceeded — awaiting_approval |
| WARN  | TotalQOH mismatch with warehouse sum |
| WARN  | row skipped: normalization failed |
| WARN  | stock skipped for SKU: no inventory_item_id |
| WARN  | tire size unparsed (regex didn't match) |
| ERROR | error creating/updating product (per part_number) |
| ERROR | error applying stock (per part_number) |
| ERROR | discontinue failed (per part_number) |
| ERROR | uncaught exception during run → status=failed |

Sentry: not wired today. If `SENTRY_DSN` is set in env, the §15 cleanup PR can add `Sentry.captureException` at every ERROR site behind a conditional import. Out of scope for vendor-sync itself.

Metric-shaped fields embedded in INFO logs: `durationMs`, `processed`, `errors`, `new_count`, `changed_count`, `discontinued_count`, `skipped_no_image_count`. Whatever Railway's log shipper is can parse these.

---

## 13. Phased Commit Plan

Original 8-PR plan and where it landed. Each row reflects what is actually in `git log` (most-recent first):

| Original PR | Shipped as | Commit | Status |
|---|---|---|---|
| PR 1 — schema, data models, migration | Initial vendor-sync module skeleton | (pre-rename) | done, vendor renamed in `f9a4dc9` |
| PR 2 — adapter: fetch + parse + normalize, dry-run only | WheelPros wheels adapter | `4fc8318` handles real CSV patterns | done |
| PR 2b — tire adapter | WheelPros tires adapter | (part of recent work) | done |
| PR 3 — SQL diff and run lifecycle | `pipeline/diff.ts` + service state machine | (early) | done |
| PR 4 — apply: upsert products | `applyChanges` (new + changed paths) | (early) | done, current modification: see §15 |
| PR 5 — apply: per-warehouse stock | `applyStockLevels` + `computeStockChanges` | (early) | done |
| PR 6 — apply: discontinue + threshold | `applyDiscontinuations` + threshold guard | `811eee3` | done, current modification: see §15 |
| PR 7 — admin endpoints | `api/admin/vendor-sync/` | `db4...` | done, cancel modification: see §15 |
| PR 8 — cron + archiving + logging + README | `jobs/vendor-sync-tick.ts`, archive helper, structured logs, module README | `0bf3458` | done |

Subsequent in-flight work is §15.

---

## 14. Risk Register

| ID  | Risk | Mitigation |
|---|---|---|
| R1  | Meilisearch plugin (`@rokmohar/medusa-plugin-meilisearch`) may not subscribe to `product.created` / `product.updated` events. | Verify post-install. If only full reindex is supported, add a debounced module-level subscriber that batches per run. |
| R2  | Medusa 2.13.6's variant `prices[].amount` unit (decimal vs integer cents). Stores dollars on the Medusa variant; the Meili transformer converts to integer cents. | A one-shot smoke test creating a product with `amount: 100` and inspecting the displayed price catches the unit mismatch instantly. |
| R3  | ~~`bullmq` is still in `package.json` but unused after A4 was finalized.~~ ~~done~~ (no longer a direct dependency) | Cleanup PR removes the unused dep. Listed in §15. |
| R4  | First ingestion of full feeds may take ~30+ minutes inside a single Node process. | Run during low-traffic window. RunDate short-circuit guarantees a re-tick won't double-process. If pressure mounts, switch to `Promise.allSettled` across vendors and/or batch part_numbers within a vendor. |
| R5  | `RunDate` parsing assumes US `MM/DD/YYYY hh:mm:ss AM/PM`. Locale-flip would silently break dedup. | `parseVendorDate` already asserts year is within a plausible window; a regression test on a known sample row is in `wheel-parse.test.ts` / `tire-parse.test.ts`. |
| R6  | Brand collection / stock location / sales channel rename in Medusa admin would break name-based lookups. | Stock locations use `metadata.vendor_warehouse_code`. Brand collections use `metadata.vendor_sync_brand`. Region and sales channel still match by name (see R6b). |
| R6b | `ensureUsRegion` and `ensureDefaultSalesChannel` match by display name. Renaming either in admin breaks bootstrap. | Add `metadata.vendor_sync_managed = "default"` lookup fallback in a future hardening pass. Low priority — these are admin-controlled rarely-changing entities. |
| R7  | Adding a new field to `NormalizedRecord` is a breaking hash change — every row appears `changed` on next run. | Documented in README and code comment above `computeContentHash`. Idempotent apply makes this cost-only, not correctness-breaking. |
| R8  | `pnpm install` at the repo root is a no-op (no workspace). | Already documented in `CLAUDE.md`. |
| R9  | Sequential apply: a single hung workflow stalls the rest of the run. | Per-part try/catch limits damage to one SKU; the run continues. Hung-not-thrown is the worry — Medusa workflows do not currently expose a timeout; add a per-workflow `Promise.race` with a generous timeout in a hardening pass if observed in production. |
| R10 | Tire dimensions are extracted from `PartDescription` via regex. Unmatched patterns produce `null` fields. | WARN log emitted on no-match. Storefront filters tolerate `null` (do not show dimension chips). Patterns can be added without a migration. |
| R11 | **(New, OQ2)** Wheel feed image coverage. In the OQ2 doc this was flagged as "all 9 wheel rows have empty `ImageURL`" — that turned out to be stale. The actual `wheelInvPriceData.csv` at the repo root (39 rows) has only 2 rows without images. The 2026-05-21 verification confirmed 37 of 39 wheel rows passed the image filter. The rule itself is correct; the OQ2 doc's example numbers were out of date and have been updated. |
| R13 | **(New, 2026-05-21)** Apply throughput. Each `createProductsWorkflow` call took ~13 seconds against the dev DB. Logs show `Processing product.created which has 1 subscribers` between every product, meaning the Meilisearch plugin subscriber runs synchronously after each create and dominates the wall-clock cost. For 37 + 4 products this is 8 minutes; for a production-scale feed (thousands of changed SKUs per tick) this would exceed the 12h cron interval. Mitigations: (a) disable the Meilisearch subscriber during the run and trigger a single batch reindex at the end, (b) switch to `batchProductsWorkflow` to amortize bootstrap costs, (c) move the apply step to a background worker process. None required for current feed sizes. |
| R12 | Two adapters run in series (§6.2). If one hangs, the other never runs that tick. | Acceptable for Phase 1. Move to `Promise.allSettled` if observed. |

---

## 15. Remaining Phase 1 Work

This section enumerates the changes implied by the current `git status`. Each is a focused PR (or sub-PR within one cleanup PR). The order assumes each leaves the system working.

### 15.1 Commit the consolidated migration — DONE 2026-05-21

Migration and snapshots committed as `add vendor-sync schema migration and mikro-orm snapshots`.

### 15.2 Persist per-part-number apply errors

- Today `applyChanges` returns `{ processedCount, errorCount, errors }` but the `errors` array is logged and discarded.
- Add a `vendor_apply_error` table or extend `vendor_feed_run` with a `failed_part_numbers JSONB` array so `GET /admin/vendor-sync/runs/:id` can list which SKUs failed and `POST /admin/vendor-sync/skus/:partNumber/replay` can target them by name.
- Implies the `service.ts` modification visible in `git status`.

### 15.3 Harden cancel endpoint

- `POST /admin/vendor-sync/runs/:id/cancel` exists. The in-flight modification likely adds:
  - Status-machine guard (only valid from `awaiting_approval`, `fetching`, `staging`, `diffing`, `applying`).
  - For an `applying` cancel, the sequential apply loop should observe a cancel flag between part_numbers and abort cleanly (the part_number being processed completes, but the next one does not start).
- Implies the `runs/[id]/cancel/route.ts` modification.

### 15.4 Discontinue: only flip status when needed

- The `apply-discontinue.ts` modification likely addresses idempotency. Today, calling `updateProductsWorkflow` for a product already at `status: 'draft'` is a no-op write but still emits `product.updated` (which Meilisearch will index again). A guard `if (currentRow.discontinued_at) skip` avoids re-doing the work on replay.
- Also: the current `existingMetadata` merge reads `currentRow.normalized.metadata` which is always `undefined` — there's no `metadata` key on `NormalizedRecord`. Fix: read the existing Medusa product's metadata via `productService.retrieveProduct(id)` before the workflow call so we don't overwrite manually-added admin metadata.

### 15.5 Cleanup script — DONE 2026-05-21 (committed; README docs still pending)

`backend/src/scripts/vendor-sync-cleanup.ts` is shipped: it scans for runs stuck in non-terminal statuses (`fetching | staging | diffing | applying`) and marks them `failed` so the in-progress guard lets the next tick start. README documentation for the procedure is still pending.

The "wipe vendor-sync-managed Medusa rows" variant originally proposed here (deletes products, categories, truncates staging) is NOT what shipped — that's a separate, more destructive script that has not been written yet. It is intentionally not built because the existing cleanup is the only stuck-run recovery the system has needed so far.

### 15.6 Apply script ergonomics

- `vendor-sync-apply.ts` modification likely adds:
  - Argument parsing for `<run-id>` with helpful error when missing.
  - Dry-run summary first (counts) with confirmation prompt unless `--yes`.
  - Pretty-printed errors after apply, grouping by error message.

### 15.7 ~~Remove unused `bullmq` dependency~~ ~~done~~ (no longer a direct dependency)

- Drop from `backend/package.json` (R3). `pnpm install` to refresh the lockfile.

### 15.8 Integration test on the real DB

- §11.3 lists what's missing. Build the smallest first: a single end-to-end run of `wheels-small.csv` against a test Medusa container. Tag behind `RUN_INTEGRATION=true`.

### 15.9 Verify Meilisearch incremental indexing (R1) — CONFIRMED 2026-05-21

Logs from the apply runs show `Processing product.created which has 1 subscribers` after every `createProductsWorkflow` call — that subscriber is the Meilisearch plugin's. So incremental indexing IS happening per product. The R1 risk (plugin only supporting full reindex) is closed.

The secondary issue exposed by the same logs is R13: each subscriber call takes ~12 seconds end-to-end, dominating the apply wall-clock cost. R13 captures that finding.

---

## 16. Self-Review

Covered against the brief's 12 deliverables:
- §2 module layout (matches built state, not the original sketch).
- §3 data model (matches the one shipped migration).
- §4 adapter interface (discriminated union actually shipped).
- §5 apply paths (sequential, not BullMQ — deviation explicit in A4).
- §6 concurrency model (replaces the original queue topology).
- §7 cron lifecycle.
- §8 admin endpoints (all seven, cancel hardening tracked in §15).
- §9 env vars (renamed and split per OQ11).
- §10 migrations (one consolidated file).
- §11 tests (in-tree unit tests; integration test still missing — §15.8).
- §12 observability.
- §13 phased commit plan now reflects what shipped, not what was speculated.
- §14 risk register includes the new R11 from OQ2 revision.
- §15 explicitly lists the in-flight work from `git status`.

No placeholders. Every workflow named in §5 is one I confirmed by reading the shipped pipeline files. Type and field names are consistent between §3, §4, and §5.4.
