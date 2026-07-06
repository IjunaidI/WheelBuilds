# Sync-lifecycle integrity — honest state & recoverable failure (G9 cluster 1) — Design

> Status: **done** — implemented + merged to `main` 2026-07-06. Session = epic **G9** (audit remediation), cluster **sync-lifecycle-integrity**.
> Backlog id: **WB-070** (under the WB-069 umbrella).
> Remediates **9 CONFIRMED findings** (vendor-sync log #1–9) + **2 folded-in PENDING mediums** (#11, #16).
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)
> Umbrella: [docs/future/plans/2026-07-06-audit-remediation-theme.md](../../future/plans/2026-07-06-audit-remediation-theme.md)
> Raw findings: [audit-findings-vendor-sync.md](../../future/plans/2026-07-06-audit-findings-vendor-sync.md)
> Living ref: [reference/vendor-sync-implementation.md](../../reference/vendor-sync-implementation.md)

## 1. Context

The vendor-sync pipeline is **live** (prod cutover 2026-06-27 wheels, 2026-07-03 tires; ~1,724 wheel
groups / ~29k variants + ~1,000 tire products). It is a Medusa business module with a thin imperative
service (`fetch → stage → diff → apply`), idempotent by design (content-hash / RunDate short-circuits,
per-vendor in-progress guard, WB-016 bounded partial-apply retry, WB-037 DB-backed cancel).

The 2026-07-06 done-specs audit found that the pipeline's idempotency guarantees have **seams where the
persisted state silently diverges from the vendor feed while the run still reports success** — the G9
theme's failure family. This cluster fixes the nine confirmed instances plus two pending mediums that
live in the same code and reinforce the same theme (phantom stock).

Every fix serves one principle: **the sync must tell the truth about stock, catalog visibility, and
price — and every failure must be loud (surfaced on the run row) and recoverable (retried on a later
run or via the existing replay tools).**

### The findings this cluster closes

| # | Sev | One-line | Root seam |
|---|---|---|---|
| 1 | HIGH✓ | Changed path overwrites `normalized` before the stock pass → per-warehouse sellouts never zeroed (oversell) | stock zero-out trusts a mutated snapshot |
| 2 | HIGH✓ | Discontinued group re-listed → adopted but never republished → stays DRAFT forever | adoption path has no re-list branch |
| 3 | HIGH✓ | Adoption writes null-variant current rows with a settled hash → zombie SKUs, wedged groups | miss-on-adopt persists poison row |
| 4 | HIGH✓ | Re-listed removed variant keeps `discontinued:true` + stale price | added-path `toAdopt` set discarded |
| 5 | HIGH✓ | Stock-pass errors invisible to finalize/retry; hash advances before stock | errors dropped + hash written too early |
| 6 | HIGH✓ | Price/variant changes never emit `product.updated` → Meili stale forever | changed path calls only variant/option workflows |
| 7 | HIGH✓ | Dry-run finishes `completed` `mode:"full"` → skips the next real sync | dry runs indistinguishable from full |
| 8 | HIGH✓ | Approving a stale `awaiting_approval` run rolls the catalog back; parked runs pile up | no blocking / no staleness guard |
| 9 | HIGH✓ | No vendor concurrency guard on approve/replay → two apply loops on one vendor | `awaiting_approval` non-blocking; no lock |
| 11 | MED | `computeContentHash` array-replacer serializes `stockByWarehouse` as `{}` → redistributions hash unchanged | array replacer whitelists only top-level keys |
| 16 | MED | `approveAndApply` never re-reads status → approve→cancel→re-apply | route status check is advisory once off-request |

(✓ = survived a unanimous 3-lens adversarial panel. #11/#16 re-verified against current `main` at spec
time — both still hold: [hash.ts:51](../../../backend/src/modules/vendor-sync/utils/hash.ts#L51),
[service.ts:553-559](../../../backend/src/modules/vendor-sync/service.ts#L553).)

### Current-state facts (grounded)

| Fact | Evidence |
|---|---|
| Changed path writes `normalized: r` (new feed) to the current row inside the changed loop; stock pass runs after ALL groups. | [apply.ts:535-541](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L535), [apply.ts:251-264](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L251) |
| Stock zero-out reads `currentRow.normalized.stockByWarehouse` as `previousStock`; only zeroes warehouses missing from staging. | [apply-stock.ts:161-162](../../../backend/src/modules/vendor-sync/pipeline/apply-stock.ts#L161), [apply-stock.ts:78-103](../../../backend/src/modules/vendor-sync/pipeline/apply-stock.ts#L78) |
| `applyStockLevels` returns only `{updatedCount, errorCount}`; `applyChanges` logs errorCount, never merges into `ApplyResult.errors`. | [apply-stock.ts:127/218-226](../../../backend/src/modules/vendor-sync/pipeline/apply-stock.ts#L218), [apply.ts:261-263](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L261) |
| `finalizeApply` marks `completed` when `errorCount===0`. | [finalize-apply.ts:63-73](../../../backend/src/modules/vendor-sync/pipeline/finalize-apply.ts#L63) |
| `content_hash` includes `stockByWarehouse`+`totalQoh`; hash uses a nested array replacer that drops warehouse keys. | [hash.ts:22/51](../../../backend/src/modules/vendor-sync/utils/hash.ts#L51) |
| `persistAdoptedGroup` warns on a SKU→variant miss then still writes `medusa_variant_id:null` + real hash; gets un-deduped records. | [apply.ts:909-951](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L909), [apply.ts:316](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L316) |
| `applyDiscontinuedGroup` drafts the product, keeps `external_id`; re-listing diffs it NEW → adopted, never republished. | [apply.ts:771-782](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L771) |
| Changed added-path: `partitionRecordsBySku` `toAdopt` discarded; adopted SKUs get a current-row write but no variant update. | [apply.ts:566-615](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L566), [adopt.ts:7-18](../../../backend/src/modules/vendor-sync/pipeline/adopt.ts#L7) |
| Changed path mutates variants/options only (`updateProductVariantsWorkflow`, `createProductVariantsWorkflow`, `updateProductOptionsWorkflow`) — no `product.updated`. Meili re-indexes only on product.created/updated/deleted. | [apply.ts:527/595/1118](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L527) |
| Dry run finishes `status:"completed"` with `mode:"full"` (set by `startRun(...,"full")`); full-run delta + RunDate short-circuit both filter `mode:"full"`. | [service.ts:382-393](../../../backend/src/modules/vendor-sync/service.ts#L382), [service.ts:166-169/278-281](../../../backend/src/modules/vendor-sync/service.ts#L278) |
| Admin console's only trigger button calls `triggerRun(vendor, true)` (dry-run). | [page.tsx:63-71](../../../backend/src/admin/routes/vendor-sync/page.tsx#L63) |
| `IN_PROGRESS_STATUSES` excludes `awaiting_approval`; `startRun` guard + `POST /runs` pre-check use it. | [service.ts:52/111-120](../../../backend/src/modules/vendor-sync/service.ts#L52), [runs/route.ts:51-62](../../../backend/src/api/admin/vendor-sync/runs/route.ts#L51) |
| `approveAndApply`/`replayRun`/`replaySku` set `status:"applying"` with no vendor-in-progress check; `approveAndApply` never re-reads status. | [service.ts:553-559/620-625/759](../../../backend/src/modules/vendor-sync/service.ts#L553) |
| Approve route status check is advisory: it emits `vendor-sync.approve` and returns 202; the subscriber runs `approveAndApply` later. | [approve/route.ts:19-39](../../../backend/src/api/admin/vendor-sync/runs/[id]/approve/route.ts#L19), [vendor-sync-run.ts:25-26](../../../backend/src/subscribers/vendor-sync-run.ts#L25) |

## 2. Goals / non-goals

**Goals**
- A per-warehouse sellout is always zeroed in Medusa (no phantom stock / oversell). *(1, 11)*
- A stock-pass failure makes the run terminal-`partially_failed`/`exhausted`, records `failed_part_numbers`, and is retried on a later run — never silently `completed`. *(5)*
- A vendor line dropped for a cycle and re-listed returns to the storefront: republished, `discontinued` flags cleared, price refreshed. *(2, 4)*
- Adoption never leaves a SKU tracked-as-applied with no Medusa variant. *(3)*
- A vendor price/facet change reaches Meilisearch within the same sync. *(6)*
- A dry-run never disables the next real sync. *(7)*
- Only one apply loop mutates a vendor's catalog at a time; a paused run cannot be approved into a catalog rollback. *(8, 9, 16)*

**Non-goals (out of scope for this cluster)**
- The other five G9 clusters (fitment-truth, checkout-money-honesty, garage-session-integrity, discovery-honest-signals, docs-truth-sweep) — separate specs.
- Other vendor-sync pending findings (#10 changed-variant options/title, #12–15, #17–19, #20–21) — logged for the sync cluster's follow-up; NOT touched here.
- No change to the diff algorithm, grouping, or the fetch/stage steps.
- No new Railway service or worker split.

## 3. Chosen approach

Keep the imperative pipeline. Four coherent seams, each fixing a group of findings that share a root
cause. All changes are additive/surgical; the pure decision logic is extracted for no-DB unit tests.

Decisions locked with the user (2026-07-06):
- **Finding 5:** *root fix* — the stock pass owns the settled `content_hash` (not the minimal invalidate-on-failure variant).
- **Findings 8+9:** *block + explicit lock* — `awaiting_approval` becomes blocking AND approve/replay take an explicit vendor lock, plus a staleness refuse-on-superseded on approve.
- **Scope:** fold in #11 and #16.

### Group A — The stock phase becomes authoritative and honest *(1, 5, 11)*

**A1 · Location-based zero-out (finding 1).** `computeStockChanges` stops using `previousStock` (derived
from the mutable `normalized`) to decide what to zero. Instead it iterates **`existingLevels` (real
Medusa state) and zeroes any level whose `location_id` is not covered by the current staging** (and whose
`stocked_quantity !== 0`). "Covered" = the set of `location_id`s that the current-staging warehouses map
to via `warehouseToLocationMap`. `previousStock` is no longer consulted for the zero decision, so a
sold-out warehouse (absent from staging, its snapshot possibly overwritten) is still reliably zeroed.
The map is still built for placing current-staging quantities into locations. Pure; unit-tested.

**A2 · Stock pass owns the settled hash + surfaces errors (finding 5).**
- `applyStockLevels` returns `{updatedCount, errors: {partNumber, error}[]}`. `applyChanges` merges
  `errors` into `ApplyResult.errors` → `finalizeApply` decides `partially_failed`/`exhausted` (not
  `completed`) and `failed_part_numbers` is populated for the admin console + `replay-sku`.
- **Settlement rule:** group processing (new / changed / added / adopt) writes the current row with an
  **unsettled** `content_hash` sentinel (empty string `""`). The stock pass writes the real staging hash
  **only after** that part's `batchInventoryItemLevelsWorkflow` succeeds (or there was nothing to
  change). A stock failure leaves `""` → the next diff sees `"" !== stagingHash` → re-classifies the
  part as changed → retried. `discontinued`/removed parts don't participate (their row is keyed by
  `discontinued_at`, not hash).

  *Self-heal path:* a `partially_failed` run does not trip the RunDate short-circuit
  ([retry-policy.ts:29-35](../../../backend/src/modules/vendor-sync/pipeline/retry-policy.ts#L29)), so a
  later feed re-diffs the unsettled parts and retries their stock. The visibility fix (errors on the run
  row) also lets an operator `replay-sku` immediately.

**A3 · Hash counts per-warehouse stock (finding 11).** Replace the nested array-replacer
`JSON.stringify(base, Object.keys(base).sort())` with a canonicalizer that deep-sorts keys and
stringifies **without** a replacer, so `stockByWarehouse: {W1:0,W2:5}` and `{W1:5,W2:0}` (same total)
hash differently → classified changed → the changed path runs → A1's zero-out fires. Closes the last
phantom-stock hole (a redistribution that keeps `totalQoh` constant).

> ⚠️ **Deploy consequence of A3.** Every existing `vendor_product_current.content_hash` was computed with
> `stockByWarehouse` = `{}`, so the first post-deploy full sync mismatches **every** part → the whole
> catalog classifies as **changed** and re-applies once (~29k variants, concurrency 8). Idempotent and
> safe (variants update to identical values; stock re-applies correctly), but a heavy first run. No
> discontinue-threshold trip (that is a missing-from-staging ratio, unrelated to hashing). See §6.

### Group B — Adoption / re-listing tells the truth *(2, 3, 4)*

Shared helper **`refreshReListedVariants(ctx, productId, records)`**: `updateProductVariantsWorkflow`
that clears `discontinued`/`discontinued_at` variant metadata and writes the current price + rebuilt
metadata. Used by B2 and B4.

**B1 · No zombie null-variant rows (finding 3).** `persistAdoptedGroup`:
- Dedupe records first (reuse `dedupeExactDuplicates` / `dedupeTireExactDuplicates`) so dropped
  duplicates never get a row.
- For a staging SKU with **no** matching variant on the adopted product, **create the variant** (reuse
  the added-variant machinery — `extendWheelOptions`/`extendTireOptions` + `createProductVariantsWorkflow`),
  then persist a real row.
- Never persist `medusa_variant_id: null` with a settled hash. If a variant genuinely cannot be created,
  push an error (group → `partially_failed`, retried) instead of writing a poison row.

**B2 · Re-listed discontinued group is republished (finding 2).** When `applyNewGroup` adopts a product
whose status is `draft` / carries `discontinued_at` (dropped a cycle, now back), the adoption branch:
1. `updateProductsWorkflow` status → `published`, clear product `discontinued_at` metadata (emits
   `product.updated` → Meili re-index).
2. `refreshReListedVariants` for each member (clears variant `discontinued`, refreshes price/metadata).
3. Persist current rows `discontinued_at: null`, unsettled hash (stock pass settles + re-applies stock).

Detection: `findProductByExternalId` already returns the product; widen its graph fields to include
`status` + `metadata` (and per-variant `metadata`) so the adopt branch can tell "prior partial apply"
(published, just missing rows) from "re-listed" (draft/discontinued).

**B4 · Changed-group re-adds refresh the variant (finding 4).** In `applyChangedGroup`'s added path, run
`refreshReListedVariants` on the `toAdopt` set (re-listed SKUs already on a live product) before
persisting their current rows — today they are silently discarded and keep `discontinued:true` + stale
price. Mirror the same refresh in the `replaySku` re-add branch (the `newGroups:[]` +
`changedGroups:[{added_part_numbers:[pn]}]` case).

### Group C — Indexing freshness *(6)*

**C1 · Emit `product.updated` after variant-only mutations.** Accumulate touched `productId`s on
`ApplyContext` (from `applyChangedGroup` and B2/B4 refresh paths). After the stock pass, resolve
`Modules.EVENT_BUS` and emit `product.updated` `{ id }` once per unique id, so the Meilisearch plugin
re-indexes `price_min`/`price_max`/facets. New-group create and discontinue already reach the index via
`createProductsWorkflow`/`updateProductsWorkflow`; B2's republish does too. Emitted even when the stock
pass had errors — the variant/price change itself committed and must be indexed.

### Group D — Lifecycle guards *(7, 8, 9, 16)*

**D1 · Dry runs get `mode:"dry"` (finding 7).** Thread the dry flag into `startRun` so a dry run is
created with `mode:"dry"`: `run()` calls `startRun(vendor, dryRun ? "dry" : "full")`; the `POST /runs`
route does the same from its `dry_run` body flag before emitting `vendor-sync.execute`. The full-run
delta lookup (`lastForDelta`, `status:"completed", mode:"full"`) and the RunDate short-circuit
(`recentRuns`, `mode:"full"`) already exclude non-full modes, so a completed dry run is invisible to
them → the next real cron proceeds normally. Admin console: add a real (full) **Run sync** action next to
the existing dry-run, so operators aren't funneled into the poisoning path.

**D2 · `awaiting_approval` blocks; approve/replay take an explicit lock (findings 8, 9).**
- New `BLOCKING_STATUSES = [...IN_PROGRESS_STATUSES, "awaiting_approval"]`, used by `startRun`'s guard and
  the `POST /runs` pre-check. A vendor with a parked run starts no new run → no pile-up, and no newer feed
  applies while paused → approving the parked run cannot roll the catalog back.
- `approveAndApply` / `replayRun` / `replaySku`: before writing `status:"applying"`, assert no **other**
  run for the vendor is in `IN_PROGRESS_STATUSES` (pure `isVendorBusy(runs, excludeRunId)`); else throw
  (subscriber logs the skip). The corresponding routes add a matching pre-check → **409** synchronously.
- `approveAndApply` also refuses if a `completed` run with a **newer `run_date_vendor`** exists for the
  vendor (pure `isRunSuperseded(run, vendorRuns)`) → `superseded`, not applied.

**D3 · Approve re-validates status (finding 16).** `approveAndApply` re-reads the run at entry; if its
status is not `awaiting_approval` (e.g. cancelled between the 202 and the subscriber firing) or
`cancel_requested_at` is set, it aborts **without** applying and without clearing the cancel flag. Closes
approve → cancel → re-apply.

## 4. Interfaces & isolation

Pure, unit-tested (no DB):
- `computeStockChanges(currentStaging, previousStock, existingLevels, warehouseToLocationMap, inventoryItemId)` — reworked zero-out (A1).
- `computeContentHash(record)` — canonical serialization (A3).
- `isVendorBusy(runs, excludeRunId): boolean`, `isRunSuperseded(run, vendorRuns): boolean` — new pure module `pipeline/lifecycle-guards.ts` (D2).
- `blockingStatuses()` / the `mode:"dry"` exclusion is exercised through the guard predicates.

I/O (service + apply), verified by build/type + review:
- `applyStockLevels` (return shape + hash settlement), `applyChanges` (error merge + event emit), `persistAdoptedGroup`/`applyNewGroup` (B1/B2), `applyChangedGroup` (B4), `approveAndApply`/`replayRun`/`replaySku`/`startRun` (D1–D3), the admin routes + console page.

## 5. Testing

- **`pnpm test:sync` (jest, ~4s, no DB)** — extend with: A1 location-based zero-out cases (sold-out
  warehouse, moved warehouse, unchanged); A3 warehouse-sensitivity (redistribution differs, identical
  matches, order-independence); D2 `isVendorBusy`/`isRunSuperseded` truth tables; the settled-hash
  sentinel classification (a `""` current hash diffs as changed).
- **`tsc`** — baseline-only (no new errors).
- **`medusa build`** — exit 0.
- **Live end-to-end is NOT run against prod** (`trolley.proxy.rlwy.net`). If a local scratch Postgres is
  available, a `vendor-sync:dry-run` + a small apply against a throwaway DB. Otherwise the I/O paths ship
  behind build/type gates + review, with a staged Railway dry-run recommended before the next full cron.

## 6. Deploy notes

- **A3 first-run churn:** the first post-deploy **full** sync re-applies the whole catalog once (hash
  format changed). Expect a long run; it is idempotent. Consider triggering it off-peak. Subsequent syncs
  return to normal delta volume.
- **`mode:"dry"`:** additive value on the existing `mode` column — **no migration**. Existing rows keep
  `mode:"full"`/`"stock"`.
- **No new required env.** No schema change (the `content_hash` column is `model.text()` / NON-nullable;
  the unsettled sentinel is the empty string `""`, never `null`).
- **Doubled current-row writes (A2):** each new/changed/adopted part is now written to
  `vendor_product_current` twice per run — once by group processing (`""`) and once by the stock pass
  (settled hash). Bounded and correct; on the A3 first run (whole catalog = changed) that is ~29k+ extra
  `updateVendorProductCurrents` writes stacked on the group writes. Runs off-peak with A3.
- **Meili:** C1 makes changed-group price/facet updates self-index going forward; a one-time full
  re-sync is only needed if drift already accumulated (out of scope — track separately).

## 7. Risks & trade-offs

- **Blocking `awaiting_approval` pauses only new FULL runs** for a vendor until an operator
  approves/cancels — mitigated by the admin console surfacing the parked run and by
  `vendor-sync-cleanup.ts`. The 3-hourly **stock-only cron is NOT blocked** by a merely-parked run (its
  guard is mode-aware: `stock` → `IN_PROGRESS_STATUSES`, else `BLOCKING_STATUSES`), so inventory stays
  fresh during a park; stock-only never settles hashes / writes product state, so it cannot move the diff
  baseline the parked run's approval re-computes. A concurrently-*applying* run still blocks stock-only (F9).
  *(Whole-branch review fast-follow, 2026-07-06.)*
- **A3 churn** (above) is the main operational cost. Accepted by the user in favor of closing the
  phantom-stock class fully.
- **Settled-hash sentinel** means a part that never gets a successful stock pass re-runs every feed until
  it succeeds — intended self-heal. A part with a missing `inventory_item_id` now pushes an error (rather
  than silently `continue`-ing), so it lands in `failed_part_numbers` and flips the run to
  `partially_failed`, visible in the console for `replay-sku` / the backfill script — that is the point.
  *(Whole-branch review fast-follow, 2026-07-06.)*
- **`product.updated` emission volume:** one event per touched product per run. Bounded by the changed
  set; negligible vs. the create/discontinue events already emitted.
