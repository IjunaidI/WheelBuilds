# Vendor Sync Module

Automated inventory sync pipeline that pulls wheel and tire CSV feeds from vendor sources, diffs against the current catalog state, and applies changes to Medusa products, variants, and inventory levels.

## Quick Start

### 1. Configure environment

Add to `backend/.env`:

```
VENDOR_WHEELPROS_WHEELS_ENABLED=true
VENDOR_WHEELPROS_WHEEL_FEED_PATH=./wheelInvPriceData.csv
VENDOR_WHEELPROS_TIRES_ENABLED=true
VENDOR_WHEELPROS_TIRE_FEED_PATH=./tireInvPriceData.csv
```

These env vars cause `medusa-config.js` to register the vendor-sync module with the appropriate vendor configs. If neither vendor is enabled, the module is not loaded at all.

### 2. Run a dry-run

```bash
pnpm vendor-sync:dry-run wheelpros-wheels
pnpm vendor-sync:dry-run wheelpros-tires
```

A dry-run executes the full pipeline (fetch, parse, normalize, stage, diff) but stops before applying changes to Medusa products. It creates a run record you can inspect.

### 3. Review the diff

Use the admin API to list runs and inspect results:

```bash
# List recent runs
curl -H "Authorization: Bearer <token>" \
  http://localhost:9000/admin/vendor-sync/runs

# Get a specific run
curl -H "Authorization: Bearer <token>" \
  http://localhost:9000/admin/vendor-sync/runs/<run-id>
```

### 4. Apply changes

```bash
pnpm vendor-sync:apply <run-id>
```

Or trigger a full (non-dry-run) sync via the API:

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_code": "wheelpros-wheels"}' \
  http://localhost:9000/admin/vendor-sync/runs
```

### 5. Automated scheduling

The scheduled job at `src/jobs/vendor-sync-tick.ts` runs every 12 hours automatically. It iterates over all enabled vendors and calls `service.run()` for each. No manual intervention is needed once the environment is configured.

## Architecture

The pipeline has six stages, each tracked by the run's `status` field:

```
fetch -> stage -> diff -> [threshold check] -> apply -> completed
```

### Fetch

The adapter reads the CSV file from the configured path and archives a copy to `static/vendor-feeds/<vendor>/<timestamp>.csv`. The feed descriptor (filename, byte size, archive key) is recorded on the run.

### Parse

A streaming CSV parser yields one `ParsedRow` per data row. Each row carries the raw column values and a list of warehouse column names (used for per-warehouse stock extraction).

### Normalize

Each parsed row is normalized into a typed `NormalizedRecord` with consistent field names, parsed numeric values, computed `totalQoh`, and a content hash for change detection.

### Stage

Normalized records are bulk-inserted into the `vendor_feed_staging` table, keyed to the run ID. Rows without an image URL are counted but still staged. Stock-by-warehouse data goes into `vendor_stock_staging`.

### Diff

The diff compares staging rows against `vendor_product_current` (the last-known state). It classifies each part number as **new**, **changed** (content hash differs), or **discontinued** (present in current but absent from the feed).

### Threshold check

If the ratio of discontinued parts to current active parts exceeds the configured threshold (default 5%), the run is paused with status `awaiting_approval`. An admin must explicitly approve it before changes are applied.

### Apply

For each new/changed/discontinued part number, the apply stage:
- Creates or updates Medusa products and variants (new/changed)
- Updates inventory levels at each warehouse location (stock sync)
- Marks discontinued products as unavailable
- Updates `vendor_product_current` to reflect the new state

## Configuration

All configuration flows through `medusa-config.js` module options, which read from environment variables:

| Env Var | Default | Description |
|---------|---------|-------------|
| `VENDOR_WHEELPROS_WHEELS_ENABLED` | `false` | Enable the wheelpros-wheels adapter |
| `VENDOR_WHEELPROS_WHEEL_FEED_PATH` | `./wheelInvPriceData.csv` | Path to wheel CSV feed |
| `VENDOR_WHEELPROS_TIRES_ENABLED` | `false` | Enable the wheelpros-tires adapter |
| `VENDOR_WHEELPROS_TIRE_FEED_PATH` | `./tireInvPriceData.csv` | Path to tire CSV feed |
| `VENDOR_SYNC_DISCONTINUE_THRESHOLD` | `0.05` | Max ratio of discontinued/active before requiring approval |
| `VENDOR_SYNC_APPLY_CONCURRENCY` | `8` | Concurrency limit for apply operations |
| `VENDOR_SYNC_FEED_ARCHIVE_BUCKET` | `vendor-feeds` | Archive bucket name (reserved for future MinIO use) |
| `VENDOR_SYNC_DRY_RUN` | `false` | If `true`, all runs are dry-runs by default |

## Admin API

All endpoints require admin authentication (`Authorization: Bearer <token>`).

### List runs

```
GET /admin/vendor-sync/runs?vendor=<code>&status=<status>&limit=20&offset=0
```

Returns `{ runs, limit, offset }`.

### Trigger a run

```
POST /admin/vendor-sync/runs
Body: { "vendor_code": "wheelpros-wheels", "dry_run": false }
```

Returns `{ run_id }` (HTTP 201). Returns HTTP 409 if a run is already in progress.

### Get run detail

```
GET /admin/vendor-sync/runs/:id
```

Returns `{ run }` with all fields including counts, timestamps, and error info.

### Approve a paused run

```
POST /admin/vendor-sync/runs/:id/approve
```

Only valid when the run status is `awaiting_approval`. Re-computes the diff and applies changes.

### Cancel a run

```
POST /admin/vendor-sync/runs/:id/cancel
```

Valid for any in-progress or awaiting-approval run.

### Replay a run

```
POST /admin/vendor-sync/runs/:id/replay
```

Re-diffs and re-applies all SKUs from a completed or failed run's existing staging data.

### Replay a single SKU

```
POST /admin/vendor-sync/skus/:partNumber/replay
Body: { "vendor_code": "wheelpros-wheels" }
```

Finds the most recent staging row for the given vendor + part number and applies it.

## Data Models

The module defines four MikroORM models:

- **`VendorFeedRun`** -- One row per sync execution. Tracks status, counts, timestamps, and error messages.
- **`VendorFeedStaging`** -- Normalized feed rows keyed to a run. Used for diffing and as the source of truth during apply.
- **`VendorStockStaging`** -- Per-warehouse stock levels for each staging row.
- **`VendorProductCurrent`** -- The last-applied state for each vendor + part number. Used for diff computation.

## Feed Archive

Each fetch archives the CSV to `static/vendor-feeds/<vendor>/<YYYY-MM-DD-HHmm>.csv`. This is a local filesystem copy for debugging and audit purposes. If the archive write fails (e.g., permissions), the pipeline continues using the original file path.

Future enhancement: upload archives to MinIO for durable storage.

## Adding a New Vendor

1. Create a new adapter directory under `src/modules/vendor-sync/adapters/<vendor-name>/`
2. Implement the `VendorAdapter` interface (see `adapters/types.ts`):
   - `fetch()` -- read the CSV and return a `VendorFeedDescriptor`
   - `parse(descriptor)` -- async generator yielding `ParsedRow` objects
   - `normalize(row)` -- convert raw columns to a `NormalizedRecord`
3. Register the adapter in `adapters/registry.ts`
4. Add env vars and module options in `medusa-config.js`
5. Add the vendor to the `vendors` config block

## Testing

```bash
pnpm test:sync
```

This runs all unit tests in `src/modules/vendor-sync/__tests__/`. Tests cover:
- CSV parsing (wheels and tires)
- Normalization logic and edge cases
- Content hash computation
- Diff algorithm
- Metadata building
- Stock application

## Troubleshooting

- **Module not loading**: Check that at least one `VENDOR_*_ENABLED=true` env var is set. The module is conditionally registered in `medusa-config.js`.
- **Stale config in `.medusa/server`**: Run `rm -rf .medusa/server` before restarting after config changes.
- **Feed archive location**: `static/vendor-feeds/<vendor>/` in the backend directory.
- **Run stuck in progress**: Run `pnpm exec medusa exec ./src/scripts/vendor-sync-cleanup.ts` to mark non-terminal runs as `failed` so the next tick can start.
- **Threshold block**: If too many products would be discontinued, the run pauses at `awaiting_approval`. Review the diff and approve via the admin API.
- **Missing products after sync**: Check the run's `failed_part_numbers` field (JSON array of `{ partNumber, error }`) in the admin endpoint response. Individual SKU failures are logged AND persisted to the run row, but they do not abort the run.

## Recovery procedures

These scripts handle specific recovery scenarios that have come up in practice.

### `vendor-sync-cleanup.ts` — release a stuck in-progress guard

```bash
pnpm exec medusa exec ./src/scripts/vendor-sync-cleanup.ts
```

When a process crashes mid-run (Ctrl+C, container restart, Postgres blip), the `vendor_feed_run` row is left in a non-terminal status (`fetching` | `staging` | `diffing` | `applying`). The next cron tick's in-progress guard refuses to start a new run for that vendor while such a row exists. This script transitions every non-terminal run for any vendor to `status=failed` with `error_message: "manually cleaned up stale run"`. After it runs the guard is released and the next dry-run or cron tick can proceed.

Safe to run any time. If there are no stuck runs the script logs "No stale runs found." and exits.

### `vendor-sync-backfill-inventory.ts` — repair products created before the `inventory_item_id` fix

```bash
pnpm exec medusa exec ./src/scripts/vendor-sync-backfill-inventory.ts
```

Before [commit `000da81`](https://github.com/anthropics/claude-code/commit/000da81), `applyChanges` extracted `inventory_item_id` from the `createProductsWorkflow` result's variant shape — but that shape does not eagerly populate the `inventory_items` link. Products created during that window have `vendor_product_current.inventory_item_id = NULL`, and every subsequent apply-stock attempt logs `Skipping stock for X: no inventory_item_id`.

The script finds every `vendor_product_current` row with `inventory_item_id IS NULL`, looks up the correct id via `query.graph({ entity: "variant", fields: ["inventory_items.inventory_item_id"], filters: { id } })`, writes it back, then groups the repaired SKUs by their `last_seen_run_id` and calls `applyStockLevels` to push the correct per-warehouse stock. Idempotent and safe to re-run.

After the script runs, the affected products show inventory levels in the Medusa admin. Confirm by visiting a product with non-zero `TotalQOH` in the feed (e.g. wheelpros-tires `F28840215`) and checking its `Inventory` tab.

### Inspect failed part_numbers from a run

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:9000/admin/vendor-sync/runs/<run-id>
```

The response includes `failed_part_numbers` (JSON array of `{ partNumber, error }` or `null`). Targeted retry by part_number:

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"vendor_code": "wheelpros-wheels"}' \
  http://localhost:9000/admin/vendor-sync/skus/<part-number>/replay
```
