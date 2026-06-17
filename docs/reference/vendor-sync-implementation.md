# Vendor Sync — Implementation Summary

> _Corrected 2026-06-17 — see [docs/STATUS.md](../STATUS.md). Original was pre-rename / pre-cents-fix; preserved as historical record below._

A short, "what shipped and how to use it" companion to [`vendor-sync-plan`](../done/plans/2026-05-18-vendor-sync-plan.md) (design + rationale) and [`vendor-sync open-questions`](../done/specs/2026-05-18-vendor-sync-open-questions.md) (decisions audit). If you just need to understand the system, start here.

Module location: [`backend/src/modules/vendor-sync/`](../../backend/src/modules/vendor-sync/).

Last verified end-to-end against the dev DB on 2026-05-21: 39 wheels + 11 tires across two feeds, 41 products created in Medusa (37 wheels + 4 tires after image-filter skips), inventory levels applied at the right warehouses.

---

## What it does

Pulls two CSV feeds (`wheelInvPriceData.csv`, `tireInvPriceData.csv`) from the WheelPros distributor system, diffs them against the last applied state, and applies only the changes to Medusa products, brand collections, stock locations, and inventory levels. Runs every 12 hours via a scheduled job; can also be invoked manually via scripts or the admin API.

```
Local CSV (Phase 1) ──► fetch ──► stage ──► group-aware diff ──► [threshold check] ──► apply ──► Medusa products
                                                                                              └─► inventory levels
```

Idempotent: re-running with the same feed is a no-op (RunDate short-circuit if the vendor timestamp is unchanged; content-hash dedup otherwise). Image-less rows are filtered out at staging — they never enter the diff or the apply.

**Wheel grouping.** Multiple wheel rows that share `Brand + DisplayStyleNo + Finish` collapse into ONE Medusa product with N variants. Variant axes: Bolt Pattern, Diameter, Width, Offset. A row with empty `DisplayStyleNo` becomes its own single-variant product via the per-SKU fallback key `sku:<partNumber>`. Tires currently keep one-product-per-row.

---

## How to run it

All commands are from `backend/`. The module loads only when at least one `VENDOR_WHEELPROS_*_ENABLED` env var is `true`.

### First-time setup

1. Set in `backend/.env`:
   ```
   VENDOR_WHEELPROS_WHEELS_ENABLED=true
   VENDOR_WHEELPROS_WHEEL_FEED_PATH=../wheelInvPriceData.csv
   VENDOR_WHEELPROS_TIRES_ENABLED=true
   VENDOR_WHEELPROS_TIRE_FEED_PATH=../tireInvPriceData.csv
   ```
2. Migrate: `pnpm ib` (or `pnpm exec medusa db:migrate`).

### Dry-run + apply

```bash
pnpm vendor-sync:dry-run wheelpros-wheels      # prints staged counts and run id
pnpm vendor-sync:apply <run-id>                 # apply that run to Medusa
pnpm vendor-sync:dry-run wheelpros-tires        # repeat for tires
pnpm vendor-sync:apply <run-id>
```

Dry-run fetches, parses, normalizes, stages, and diffs — but stops before any Medusa mutation. The apply script re-computes the diff against current state (so changes that landed between dry-run and apply are picked up) and writes products + inventory.

### Automated runs

Cron `0 */12 * * *` (00:00 and 12:00 UTC), defined in [`backend/src/jobs/vendor-sync-tick.ts`](../../backend/src/jobs/vendor-sync-tick.ts). It iterates `service.listEnabledVendors()` and calls `service.run(vendor)` for each in series. Each vendor has its own in-progress guard, so a long-running wheels apply does not skip the tires tick on the next cycle.

### Recovery

```bash
pnpm exec medusa exec ./src/scripts/vendor-sync-cleanup.ts                # release stuck-run guards
pnpm exec medusa exec ./src/scripts/vendor-sync-backfill-inventory.ts     # repair vendor_product_current.inventory_item_id
```

---

## Architecture in one paragraph

The pipeline is a Medusa business module with four MikroORM tables (`vendor_feed_run`, `vendor_feed_staging`, `vendor_stock_staging`, `vendor_product_current`) and a thin service that orchestrates fetch → stage → diff → apply against any registered `VendorAdapter`. Two adapters ship: `wheelpros-wheels` and `wheelpros-tires`, sharing the same pipeline infrastructure but with separate parse/normalize logic and separate run lifecycles. The group-aware diff is a pure function over staging × current rows bucketed by `group_key`; it emits three disjoint sets — `newGroups`, `changedGroups` (added / removed / changed variants inside an existing product), and `discontinuedGroups` — which `applyChanges` consumes to compose Medusa 2.0 core flows (`createProductsWorkflow`, `updateProductsWorkflow`, `createProductVariantsWorkflow`, `updateProductVariantsWorkflow`, `updateProductOptionsWorkflow`, `batchInventoryItemLevelsWorkflow`). Sequential per-process apply with try/catch around each group — no external queue. Process-local cancel flag lets the cancel admin endpoint stop an `applying` run between groups.

---

## Key files

| Path | What |
|---|---|
| [`models/`](../../backend/src/modules/vendor-sync/models/) | MikroORM data models for the four tables |
| [`migrations/Migration20260517220005.ts`](../../backend/src/modules/vendor-sync/migrations/Migration20260517220005.ts) | Creates all four tables |
| [`migrations/Migration20260521150000.ts`](../../backend/src/modules/vendor-sync/migrations/Migration20260521150000.ts) | Adds `failed_part_numbers` jsonb column to `vendor_feed_run` |
| [`adapters/types.ts`](../../backend/src/modules/vendor-sync/adapters/types.ts) | `VendorAdapter` interface + discriminated-union `NormalizedRecord` (`WheelNormalizedRecord` \| `TireNormalizedRecord`); both carry a `groupKey` field |
| [`adapters/wheelpros-wheels/group-key.ts`](../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/group-key.ts) | Pure helper that derives a wheel `groupKey` from brand + DisplayStyleNo + Finish (per-SKU fallback when DisplayStyleNo is empty) |
| [`pipeline/wheel-grouping.ts`](../../backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts) | Pure helpers used by the apply path: option/variant builders, four-axis collision detector, group title/handle |
| [`adapters/registry.ts`](../../backend/src/modules/vendor-sync/adapters/registry.ts) | `resolveAdapter('wheelpros-wheels' \| 'wheelpros-tires')` |
| [`adapters/wheelpros-wheels/`](../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/) | Wheel adapter (parse, normalize, schema) |
| [`adapters/wheelpros-tires/`](../../backend/src/modules/vendor-sync/adapters/wheelpros-tires/) | Tire adapter; reuses `parse-helpers` + `tire-parse-helpers` |
| [`pipeline/fetch.ts`](../../backend/src/modules/vendor-sync/pipeline/fetch.ts) | Reads local CSV, archives a copy to `static/vendor-feeds/<vendor>/<timestamp>.csv` |
| [`pipeline/stage.ts`](../../backend/src/modules/vendor-sync/pipeline/stage.ts) | Streams parsed rows into staging tables; skips rows with empty `ImageURL` |
| [`pipeline/diff.ts`](../../backend/src/modules/vendor-sync/pipeline/diff.ts) | Pure-function diff; `computeGroupDiff` is the production entry point (group-aware), `computeDiff` is the part-level legacy still used by tests |
| [`pipeline/bootstrap.ts`](../../backend/src/modules/vendor-sync/pipeline/bootstrap.ts) | Idempotent: US region, sales channel, `Wheels`/`Tires` categories, brand collections, shipping profile, stock locations |
| [`pipeline/apply.ts`](../../backend/src/modules/vendor-sync/pipeline/apply.ts) | Group-aware sequential apply with try/catch per group, cancel-poll between groups, query.graph for `inventory_item_id`. Routes new/changed/discontinued groups to per-type handlers; tires still go one-product-one-variant |
| [`pipeline/apply-stock.ts`](../../backend/src/modules/vendor-sync/pipeline/apply-stock.ts) | `batchInventoryItemLevelsWorkflow` + pure `computeStockChanges` |
| [`pipeline/build-metadata.ts`](../../backend/src/modules/vendor-sync/pipeline/build-metadata.ts) | Two pure helpers: `buildProductMetadata` (group-constant fields) and `buildVariantMetadata` (per-row fields). The apply path drafts the product only when ALL variants in a group are discontinued; individual-variant departure marks the variant via metadata.discontinued + zeroed stock instead |
| [`service.ts`](../../backend/src/modules/vendor-sync/service.ts) | `VendorSyncService`: orchestrator + cancel flag + `run`/`approveAndApply`/`replayRun`/`replaySku` |
| [`jobs/vendor-sync-tick.ts`](../../backend/src/jobs/vendor-sync-tick.ts) | Cron entry |
| [`api/admin/vendor-sync/`](../../backend/src/api/admin/vendor-sync/) | Admin endpoints (list runs, detail, approve, cancel, replay) |
| [`scripts/vendor-sync-*.ts`](../../backend/src/scripts/) | dry-run, apply, mock, cleanup, backfill-inventory, dev-wipe |
| [`__fixtures__/`](../../backend/src/modules/vendor-sync/__fixtures__/) | wheels-small.csv + v2, tires-small.csv + v2 |
| [`__tests__/`](../../backend/src/modules/vendor-sync/__tests__/) | unit tests + integration scaffold (4 `it.todo`s gated behind `RUN_INTEGRATION=true`) (test counts: see docs/STATUS.md) |

---

## Data model

```
vendor_feed_run                     vendor_feed_staging
  id, vendor_code, status              run_id, vendor_code, part_number
  row_count, skipped_no_image_count    group_key
  new_count, changed_count,            row_json, normalized, content_hash
  discontinued_count
  failed_part_numbers (jsonb)        vendor_stock_staging
  approved_by, approved_at             run_id, vendor_code, part_number
  source_filename, source_archive_key  warehouse_code, qoh
  run_date_vendor
  started_at, finished_at            vendor_product_current
                                       vendor_code, part_number  ← natural key
                                       group_key                 ← shared across siblings
                                       content_hash
                                       medusa_product_id, medusa_variant_id,
                                       inventory_item_id
                                       normalized (jsonb)
                                       applied_at, discontinued_at
                                       last_seen_run_id
```

`vendor_product_current.content_hash` advances **only on successful apply**. A failed apply leaves the previous canonical state untouched and the next run will re-diff and re-attempt the failed SKUs.

---

## Run lifecycle (status field)

```
fetching ─► staging ─► diffing ─┬─► awaiting_approval ─► applying ─► completed
                                │                                ├─► failed
                                └────────────► applying ─────────┴─► cancelled
```

- `awaiting_approval` triggers when the discontinue ratio exceeds `VENDOR_SYNC_DISCONTINUE_THRESHOLD` (default 0.05). Resolve with `POST /admin/vendor-sync/runs/:id/approve`.
- `cancelled` is set by `POST /admin/vendor-sync/runs/:id/cancel`; the apply loop sees the flag between part_numbers and stops cleanly.
- `failed` captures uncaught exceptions; per-SKU errors do NOT abort the run, they get recorded in `failed_part_numbers`.

---

## Admin endpoints

All under `/admin/vendor-sync/`, all admin-auth-gated.

| Method | Path | Use |
|---|---|---|
| GET | `/runs` | List runs (filter by vendor, status) |
| POST | `/runs` | Trigger out-of-band run (body: `{ vendor_code, dry_run? }`) |
| GET | `/runs/:id` | Run detail incl. `failed_part_numbers` |
| POST | `/runs/:id/approve` | Approve an `awaiting_approval` run |
| POST | `/runs/:id/cancel` | Cancel an in-progress or awaiting-approval run |
| POST | `/runs/:id/replay` | Re-apply the staging data of a completed run |
| POST | `/skus/:partNumber/replay` | Replay one SKU from its most recent staging row |

---

## Verified working (as of 2026-05-21)

- Both adapters parse the production CSVs (`wheelInvPriceData.csv` 39 rows, `tireInvPriceData.csv` 11 rows) without errors.
- Image filter applied: 2 of 39 wheels and 7 of 11 tires skipped (no `ImageURL`).
- Apply created 37 wheels + 4 tires in Medusa with: correct title, USD price from `MSRP_USD`, brand collection, `Wheels` or `Tires` category, vendor CDN thumbnail, dimension/spec metadata, single `Default` variant with `manage_inventory: true`.
- Inventory levels written per warehouse: 18 wheels and 2 tires had non-zero stock; the rest correctly have no inventory levels (zero everywhere).
- Stock locations auto-created on first appearance (e.g. `Warehouse 1014`).
- Unit tests pass in ~4 seconds (test counts: see docs/STATUS.md).
- Meilisearch incremental indexing works: each `createProductsWorkflow` call triggers a `product.created` event the plugin subscribes to.

---

## Known limitations

| | Detail | Tracked |
|---|---|---|
| Apply throughput | ~13 seconds per product, dominated by the Meilisearch plugin's synchronous indexing subscriber. At 7 workflows/sec, 1000 SKUs/tick = ~2 hours. Fine for current volume, will not scale to a full daily wheelpros feed. | Plan §15, risk R13 |
| SFTP fetch | Phase 1 reads a local file. Real SFTP env vars are reserved (`VENDOR_WHEELPROS_SFTP_*`) but unused. | Plan §4, OQ5 |
| Image strategy | Pass-through to vendor CDN. If vendor URLs go offline, products show broken thumbnails. No rehost to MinIO yet. | OQ2 |
| Integration tests | 4 `it.todo` cases in [`__tests__/integration.test.ts`](../../backend/src/modules/vendor-sync/__tests__/integration.test.ts) document the regression scenarios but the implementation requires a CI Postgres setup. | Plan §15.8 |
| Region + sales channel match by name | `ensureUsRegion` / `ensureDefaultSalesChannel` look up by display name. Renaming either in admin breaks bootstrap. Low priority — rare event. | Plan risk R6b |

---

## Where to look when something goes wrong

| Symptom | Where |
|---|---|
| Run stuck "in progress" forever | Run [`vendor-sync-cleanup.ts`](../../backend/src/scripts/vendor-sync-cleanup.ts); see [module README](../../backend/src/modules/vendor-sync/README.md#vendor-sync-cleanupts--release-a-stuck-in-progress-guard) |
| Products have no stock | Either feed has `TotalQOH=0` for those SKUs (correct), or you're hitting the pre-fix state: run [`vendor-sync-backfill-inventory.ts`](../../backend/src/scripts/vendor-sync-backfill-inventory.ts) |
| Run paused at `awaiting_approval` | Discontinue ratio exceeded threshold; check the diff sample, then `POST /admin/vendor-sync/runs/:id/approve` or `/cancel` |
| Module not loaded | At least one `VENDOR_WHEELPROS_*_ENABLED` must be `true`; check `medusa-config.js` boot log JSON dump |
| Schema drift after editing models | `rm -rf backend/.medusa/server` and re-run `pnpm dev` or `pnpm ib` |

---

## Pointers

- Design + rationale: [`vendor-sync-plan`](../done/plans/2026-05-18-vendor-sync-plan.md)
- Decisions audit: [`vendor-sync open-questions`](../done/specs/2026-05-18-vendor-sync-open-questions.md)
- Per-module recipe: [`backend/src/modules/vendor-sync/README.md`](../../backend/src/modules/vendor-sync/README.md)
- Project-level conventions: [`CLAUDE.md`](../../CLAUDE.md)
