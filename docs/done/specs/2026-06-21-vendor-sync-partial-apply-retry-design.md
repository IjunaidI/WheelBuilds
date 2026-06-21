# Vendor-Sync Partial-Apply Retry — Design (WB-016)

> Status: done (shipped 2026-06-21) · Created 2026-06-21 · Backlog: WB-016 (merges WB-038)
> The final 2026-06-05 NO-GO deploy blocker. Closing it makes the backend deploy-ready.

## Context — the bug

`applyChanges` processes each product group inside its own try/catch (apply.ts:148-201), so
one failing group does not abort the run; failures accumulate in `ApplyResult.errors`. But
the terminal transition in `run()` (service.ts:361-378) — duplicated in `approveAndApply()`
(454-460) and `replayRun()` (523-530) — sets a run with `errors.length > 0` to
**`status: "completed"`** (just recording `failed_part_numbers`).

Both feed short-circuits key off the last **`completed`** run:
- RunDate short-circuit (service.ts:235-258) compares the feed's `run_date_vendor` to the
  last completed run's; equal → skip.
- SFTP/delta short-circuit (service.ts:152-164 → `resolveFeed`) compares the newest SFTP
  file name+mtime to the last completed run's `source_filename`/`source_modify_time`.

So once a partial-failure run is marked `completed`, the next 12 h cron cycle sees the feed
as done and **strands the failed groups** until the vendor publishes a new feed date.

## Why the naive fix is unsafe (idempotency trap)

If we merely stop marking partial runs `completed`, the next cron re-stages + re-diffs +
re-applies. `computeGroupDiffFromSets` (diff.ts:191-246) is the safety net for *succeeded*
groups: a group whose `vendor_product_current` rows carry matching `content_hash` produces
no added/removed/changed parts → it is skipped (diff.ts:236-238). Good.

The trap is a group that failed **after** `createProductsWorkflow` returned but **before**
`persistGroupAfterCreate` wrote its `vendor_product_current` rows (apply.ts:286-310,
718-775): the product + all its variants exist in Medusa, but **no tracking row exists**.
The re-diff sees `currentParts.length === 0` for that `group_key` → classifies it **new**
again (diff.ts:203-208) → `applyNewWheelGroup` calls `createProductsWorkflow` a second time
→ **duplicate product** (or a handle/SKU-uniqueness crash). The same hazard exists for a
changed group's `added_part_numbers` that created variants but failed before persisting
(apply.ts:445-487).

Therefore a correct retry **requires** apply idempotency: adopt-by-`external_id` for new
groups and adopt-by-SKU for added variants. `external_id` is already set to `group_key`
(wheels, apply.ts:300) / `part_number` (tires, apply.ts:344), so adoption is feasible with
no new identity scheme.

## Design

Two pillars: (1) orchestration — a bounded retry driven by run status; (2) idempotency —
adoption so the retry never duplicates.

### Pillar 1 — status model + bounded retry

`vendor_feed_run.status` is `model.text()` (a free string, vendor-feed-run.ts:16), so new
status values need **no enum migration**.

| status | meaning | short-circuits this feed? | cron retries? | in-progress guard? |
|---|---|---|---|---|
| `fetching`/`staging`/`diffing`/`applying` | running | n/a | n/a | yes |
| `completed` | feed fully applied | **yes** | no | no |
| `partially_failed` *(new)* | some groups failed, retry budget remains | **no** | **yes** | no |
| `exhausted` *(new)* | partial failures, budget spent — gave up | **yes** | no (manual replay) | no |
| `failed` | hard run error (fetch/stage/diff/whole-apply threw) | no | yes (next cycle) | no |
| `awaiting_approval` | over discontinue threshold | no | no | no |
| `cancelled` | cancelled mid-apply | no | no | no |

**Retry mechanism (re-run, single code path).** When the latest run for a feed is
`partially_failed`, the RunDate short-circuit does **not** fire, so the next normal cron
`run()` re-stages + re-diffs + re-applies. The diff hash-skips succeeded groups and
re-attempts the rest — idempotently (Pillar 2). No second orchestration method.

**Bound.** A new `apply_attempt_count` column carries the attempt number forward. When
finalizing a run that still has errors:

```
attempt = max(apply_attempt_count over prior runs for this vendor with the same
              run_date_vendor) + 1     // first failure of a feed → attempt = 1
```

Decision (pure helper `decideTerminalStatus`):

```ts
// applyMaxAttempts is a module option (default 3) = total attempts incl. the first.
function decideTerminalStatus(errorCount: number, attempt: number, maxAttempts: number):
  "completed" | "partially_failed" | "exhausted" {
  if (errorCount === 0) return "completed"
  if (attempt >= maxAttempts) return "exhausted"
  return "partially_failed"
}
```

With `applyMaxAttempts = 3`: a stuck feed runs attempts 1, 2 (`partially_failed`), then 3
(`exhausted`). `exhausted` short-circuits future cycles, so a permanently-broken group does
**not** cause the full feed to re-process every 12 h forever.

**Short-circuit predicate (pure helper `shouldShortCircuitFeed`).** The RunDate check
(service.ts:235-258) is rewritten to look at the most recent run for this vendor whose
`run_date_vendor` equals the feed date (across `completed`/`exhausted`/`partially_failed`),
and short-circuit iff:

```ts
function shouldShortCircuitFeed(latestSameFeedStatus: string | undefined): boolean {
  return latestSameFeedStatus === "completed" || latestSameFeedStatus === "exhausted"
}
```

`partially_failed` (or no prior same-feed run) → proceed = retry. The SFTP/delta
short-circuit is left keyed on the last `completed` run (a `partially_failed` feed file is
newer than the last completed file, so it re-downloads — exactly what we want); no change
there.

**Shared finalize.** Extract the duplicated terminal transition from `run()`,
`approveAndApply()`, and `replayRun()` into one `finalizeApply(ctx)` helper that: on
`cancelled` keeps today's behavior (record `failed_part_numbers` only); otherwise computes
`attempt` + `decideTerminalStatus`, and updates `status`, `failed_part_numbers`,
`failed_group_keys`, `apply_attempt_count`, `finished_at`, then clears the cancel flag. This
fixes all three callers at once and removes ~40 duplicated lines.

`failed_group_keys` (new json column) = unique `groupKey`s from `ApplyResult.errors` — for
admin visibility and the per-feed attempt association. It is diagnostic; the retry mechanism
itself is diff-driven and does not read it.

### Pillar 2 — apply idempotency (adoption)

**New groups — adopt-by-`external_id`.** In `applyNewWheelGroup` / `applyNewTireGroup`,
before `createProductsWorkflow`, query for an existing product with the group's
`external_id` (`group_key` for wheels, `part_number` for tires):

```ts
const { data: existing } = await query.graph({
  entity: "product",
  fields: ["id", "variants.id", "variants.sku", "variants.inventory_items.inventory_item_id"],
  filters: { external_id: [externalId] },
})
if (existing?.length) {            // created by a prior failed attempt; rows never persisted
  await persistAdoptedGroup(ctx, group, records, existing[0])  // map SKU→variantId/invItemId
  return { variantCount: records.length }
}
// else: create as today
```

`createProductsWorkflow` creates product + all variants atomically, so the only failure
window is the post-create persist loop; the adopted product therefore has every variant and
adoption reduces to writing the missing `vendor_product_current` rows (the same write
`persistGroupAfterCreate` does, sourced from the existing product instead of the workflow
result).

**Changed-group added variants — adopt-by-SKU.** In `applyChangedGroup`'s
`added_part_numbers` branch, before `createProductVariantsWorkflow`, query the product's
existing variant SKUs; create only the SKUs not already present; then persist
`vendor_product_current` rows for **all** added parts (mapping SKU→variantId/invItemId from a
combined query). A re-created SKU from a prior failed attempt is adopted, not re-created
(which would crash on SKU uniqueness).

`applyDiscontinuedGroup` already has an idempotency guard (apply.ts:558-564) — unchanged.

### Migration

Add to `vendor_feed_run` (new migration; generated via `medusa db:generate` so the tracked
`.snapshot-vendor-sync-module.json` stays in lockstep — see CLAUDE.md):
- `apply_attempt_count` — integer, NOT NULL, default `0`.
- `failed_group_keys` — jsonb, nullable.

### Module option

`applyMaxAttempts?: number` on `VendorSyncModuleOptions` (default 3), wired in
`medusa-config.js` from a new `VENDOR_SYNC_APPLY_MAX_ATTEMPTS` env var (constants.ts export +
`.env.template` note), following the existing `applyConcurrency` pattern.

## Components / files

- `service.ts` — new pure `decideTerminalStatus` + `shouldShortCircuitFeed` (exported for
  test); rewrite the RunDate short-circuit to use the predicate; replace the three terminal
  transitions with `finalizeApply`; thread `failed_group_keys`/`apply_attempt_count`.
- `pipeline/apply.ts` — adopt-by-`external_id` in `applyNewWheelGroup`/`applyNewTireGroup`
  (+ `persistAdoptedGroup`); adopt-by-SKU in the added-variants branch.
- `models/vendor-feed-run.ts` — two new fields.
- `migrations/Migration<ts>.ts` + `.snapshot-vendor-sync-module.json` — generated.
- `medusa-config.js`, `src/lib/constants.ts`, `.env.template` — `applyMaxAttempts` wiring.

## Testing

Pure helpers (Jest, no DB):
- `decideTerminalStatus`: `errorCount=0`→completed; errors+attempt`<`max→partially_failed;
  errors+attempt`>=`max→exhausted; boundary `attempt===max`→exhausted.
- `shouldShortCircuitFeed`: completed→true, exhausted→true, partially_failed→false,
  undefined→false, failed→false.

Apply idempotency (Jest, mocked `query.graph` + spied workflows):
- new wheel group whose `external_id` already resolves to a product → `createProductsWorkflow`
  **not** called; `createVendorProductCurrents` called for each SKU (adoption).
- new wheel group with no existing product → create path unchanged (regression guard).
- changed group `added_part_numbers` where one SKU already exists → `createProductVariantsWorkflow`
  called with only the missing SKU; current rows persisted for both.

Run-suite regression: full `npx jest` stays green (currently 237 pass / 4 skipped).

## Verification (maps to BACKLOG WB-016 `verify`)

- A run with one failed group is **not** marked `completed` (it becomes `partially_failed`).
- The next cron cycle re-applies the failed group (RunDate short-circuit does not fire for a
  `partially_failed` latest run).
- A fully-successful retry transitions the run to `completed`.
- Idempotency: a new group whose product already exists is adopted, not duplicated (no second
  `createProductsWorkflow`).
- Bound: after `applyMaxAttempts` failed attempts the run is `exhausted` and future cycles
  short-circuit (no infinite full-feed re-processing).

## Out of scope

- WB-011/012/013 (move apply to a background job) — orthogonal; this keeps the in-process
  apply loop.
- WB-014 (`applyConcurrency` parallelism) — apply stays sequential.
- A dedicated admin "retry now" button (admin already has replay run / replay SKU routes).
- Backfilling `apply_attempt_count` for historical rows (defaults to 0).
