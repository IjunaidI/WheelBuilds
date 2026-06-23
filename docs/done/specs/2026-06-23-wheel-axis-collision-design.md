# WB-051 · Wheel grouping six-axis variant model — Design

> Status: design · Branch: `fix/wheel-axis-collision-center-bore` · Date: 2026-06-23
> Backlog: [WB-051](../../future/BACKLOG.md) (HIGH)

## Problem

Variants inside a wheel product are keyed by a **4-axis tuple** — bolt pattern × diameter × width ×
offset ([`variantAxisKey`](../../../backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts)). When
two SKUs in the same `Brand+DisplayStyleNo+Finish` group share all four but differ on **center bore**
(e.g. XD845: same `8X6.5|22|8.25|105`, different `centerBoreMm`) or **load rating**, they map to the
same variant cell. [`findAxisCollision`](../../../backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts)
detects this and [`applyNewWheelGroup`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L271)
**throws the whole group** rather than silently merging two physically-different wheels into one variant
(deliberate fail-loud-don't-corrupt).

On the 2026-06-23 production import this failed **~300 groups (~12.8k of ~33k variants)** — large
groups, so a big slice of the catalog is missing.

Medusa distinguishes variants **only** by their option-value tuple. So for two collided SKUs to exist
as separate variants, the distinguishing field must become a real product **option**. There is no way
around this — disambiguation requires new option axes.

## Decisions (locked in brainstorming, 2026-06-23)

1. **PDP exposure → progressive disclosure.** Center bore / load rating become real options
   backend-side, but the PDP renders a selector for them only when the current selection genuinely
   branches (>1 distinct value). Common case = zero visual change; the value still shows as a spec.
2. **Six variant axes.** Add **both** center bore (5th) and load rating (6th). Maximum fidelity — no
   genuinely-distinct SKU is ever dropped. Only **exact duplicates** (identical on all six fields,
   different part number) are deduped.
3. **Migration → full re-import.** The ~248 already-applied wheels are 4-option; new groups are
   6-option, and the changed-group path cannot add new options to an existing product. Wipe
   vendor-sync state + delete vendor products + re-apply from scratch so the whole catalog lands on
   the uniform 6-option model. Justified pre-launch (catalog is fully vendor-derived).

## Approach (chosen: A — always emit all six options)

Every wheel product carries all six options **always**, even when center bore or load rating has a
single value across the group. Variant identity is the full 6-tuple; the only residual collision is an
exact duplicate, which is deduped.

**Rejected — B, conditional axes** (emit center bore / load rating only when they vary within a group):
produces identical variant *distinctions*, but is fragile on the incremental 12h-cron path.
[`extendWheelOptions`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L934) can only add
*values* to an existing option — it cannot add a brand-new option to a product. Under B, a product
created when center bore was constant breaks the day a new SKU arrives with a different bore. A keeps
`buildVariantOptions` per-record (just two more keys) and is incremental-safe.

**Cost of A** is admin-only noise: most products have a single-value Center Bore / Load Rating option,
and null values map to a sentinel (`—`). The customer never sees this — decision 1 (progressive
disclosure) hides single-value selectors on the PDP.

## Changes

### 1. Grouping helpers — six-axis variant identity (`wheel-grouping.ts`)

- Add to `WHEEL_OPTION_TITLES`: `CENTER_BORE: "Center Bore"`, `LOAD_RATING: "Load Rating"`.
- New `formatOptionalAxis(value: number | null): string` — `formatNumericOption(value)` when present,
  the sentinel `"—"` when null. A stable sentinel means two nulls share a key (correct: not
  distinguished) while null-vs-value differ.
- `variantAxisKey(record)` → 6-tuple:
  `boltPatternRaw | diameter | width | offset | formatOptionalAxis(centerBoreMm) | formatOptionalAxis(loadRatingLb)`.
- `buildProductOptions(records)` → emits all six options (per-axis union of distinct values; sentinel
  included when any row's optional field is null).
- `buildVariantOptions(record)` → emits all six keys.

With the 6-tuple as variant identity, any pairwise difference in any field yields distinct variants.
The only thing that can still collide is an exact duplicate.

### 2. Dedupe replaces throw (`wheel-grouping.ts` + `apply.ts`)

- Replace `findAxisCollision` with `findExactDuplicates(records): WheelNormalizedRecord[][]` — groups by
  the 6-tuple, returns sets with >1 member. (`AxisCollision` / `hasHiddenDistinction` /
  `hiddenFieldsDiffering` are removed — the "you are missing an axis" signal no longer exists; the axes
  now exist.)
- New pure `dedupeExactDuplicates(records): { survivors, dropped }` — for each duplicate set keep one by
  deterministic tie-break: **prefer in-stock (`totalQoh > 0`), then lowest `partNumber`**; the rest go
  to `dropped`. **Inventory is not summed** — two distributor SKUs may double-count the same physical
  stock, so keeping one live SKU is safe while summing is not.
- [`applyNewWheelGroup`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L271): call
  `dedupeExactDuplicates`, `logger.warn` once per dropped SKU (`deduped exact duplicate, dropped <sku>`),
  build variants from `survivors`. **No longer throws on collision.** Defensive guard: if
  `findExactDuplicates(survivors)` is non-empty after dedupe (should be impossible), throw — belt-and-
  suspenders so a corrupting merge can never slip through silently.
- [`buildWheelVariantInput`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L802): variant
  title gains bore/load when present, e.g. `5X120 20x10 ET23 CB71.5 LR2200`, so admin can tell variants
  apart. SKU stays `partNumber` (already unique per row).

### 3. PDP — progressive disclosure (`group-sizes.ts` + hero)

The PDP reads variant **metadata** (`center_bore_mm`, `load_rating_lb` — both already written by
[`buildVariantMetadata`](../../../backend/src/modules/vendor-sync/pipeline/build-metadata.ts#L54)),
present regardless of option count — so the PDP is independent of the always-6 backend shape.

- Today an offset maps 1:1 to a variant
  ([`group-sizes.ts`](../../../storefront/src/modules/product-detail/data/group-sizes.ts)); now a
  `(boltPattern, size, offset)` can resolve to multiple variants differing by bore/load. Extend
  `OffsetVariant` ([types.ts](../../../storefront/src/modules/product-detail/data/types.ts)) with
  `centerBoreMm` / `loadRatingLb`, and resolve the leaf variant by
  `(size, offset, [centerBore], [loadRating])`.
- New pure helpers in `group-sizes.ts`:
  - `boresFor(candidates)` / `loadsFor(candidates)` — distinct values among the current candidate set.
  - `resolveLeafVariant(size, offsetMm, centerBoreMm?, loadRatingLb?)` — narrows to one variant.
- Hero/variant-picker renders a **Center Bore** selector and/or **Load Rating** selector only when the
  current candidate set has >1 distinct value for that field; otherwise the value is a read-only spec.
  Default selection deterministic (in-stock first, then a stable numeric order). The existing 3-row
  picker is visually unchanged for single-bore/single-load products (~all of them).

### 4. Discovery / Meilisearch — no change (verify only)

The index already carries `center_bores` in `displayedAttributes` and `filterableAttributes`
([medusa-config.js:252,257](../../../backend/medusa-config.js)) and the transformer already emits it
([build-search-document.ts:90](../../../backend/src/modules/vendor-sync/search/build-search-document.ts#L90)).
**No code change.** Load rating is *not* added as a Discovery facet (it is a variant spec, not a browse
filter). The storefront filter rail is unchanged.

## Migration / rollout — full re-import (executed 2026-06-23)

A clean re-import requires deleting the vendor Medusa products **and** clearing the four vendor-sync
state tables, **in that order**: products first so `applyNewWheelGroup` recreates them (never *adopts*
a stale 4-option product by `external_id`), state second so the diff treats every row as new. Leaving
`vendor_product_current` populated is fatal — the diff then skips groups as "unchanged" (so deleted
products are never recreated) or routes them to the changed-group path, which tries to update
now-deleted variants (`Cannot update non-existing variants` / `Product has 0 option values`).

`vendor-sync-dev-wipe.ts --purge-products` does both in principle but **does not work at production
scale**: the product cascade runs one `deleteProductsWorkflow` per chunk over the network (hours from a
local machine against the Railway proxy), and its state-table delete collects every id into one
`WHERE id IN (...)`, overflowing knex's compiler on the 372k-row `vendor_stock_staging`
(`Maximum call stack size exceeded`). Two purpose-built tools were added:

1. **Purge products** — `POST /admin/vendor-sync/purge-products`
   ([route](../../../backend/src/api/admin/vendor-sync/purge-products/route.ts)), looped until
   `remaining: 0`. Runs *inside* the backend (internal DB latency) and is wall-clock-budgeted so the
   HTTP call can't time out. Selects only products whose `metadata.vendor_code` is a vendor.
2. **Clear state** — `pnpm exec medusa exec ./src/scripts/vendor-sync-truncate-state.ts -- --confirm-host=<host>`
   ([script](../../../backend/src/scripts/vendor-sync-truncate-state.ts)). A single `TRUNCATE` of the
   four state tables — instant regardless of row count.
3. **Re-import** — `POST /admin/vendor-sync/runs {vendor_code:"wheelpros-wheels", dry_run:false}` (or the
   `pnpm vendor-sync:*` CLI). Every group is new → fresh 6-option products against an empty catalog.

Both tools are `--confirm-host`-guarded against the wrong DB. (Follow-up: harden/retire `dev-wipe`'s
ORM bulk-delete in favor of the truncate path — tracked in BACKLOG.)

## Outcome (2026-06-23)

Re-import completed clean: **`Apply complete: groups=2670 variants=29435 errors=0`** (16,092 stock
levels applied). The previously-failing ~300 collision groups now import; the catalog grew from ~2,383
to 2,670 groups. All variants on the uniform 6-axis model. WB-051 closed.

## Testing

### Backend (Jest — `pnpm test:sync`)

- `wheel-grouping.test.ts`: 6-tuple `variantAxisKey` incl. null sentinel; `buildProductOptions` /
  `buildVariantOptions` emit six axes; `dedupeExactDuplicates` tie-break (in-stock wins, then lowest
  part number) + `dropped` list; center-bore-distinct and load-rating-distinct records survive as
  distinct variants (NOT deduped); `findExactDuplicates` returns only true 6-tuple matches.
- `integration.test.ts`: a center-bore-distinct group imports as ONE product with N variants
  (distinct center-bore option values); a load-rating-distinct group likewise; an exact-duplicate
  group imports deduped to one variant.

### Storefront (Vitest — `npx vitest run src/modules/product-detail`)

- `group-sizes.test.ts`: a `(size, offset)` with two center bores resolves to the correct per-bore
  variant and surfaces a bore selector; a single-bore `(size, offset)` resolves 1:1 with no extra
  selector (regression — the WB-003 bolt-pattern-scoped behavior is preserved).

## Verification (acceptance)

A group whose SKUs differ only by center bore imports as **one** product carrying both variants with
distinct center-bore option values and no axis-collision failure. An exact-duplicate group keeps one
variant and logs the dropped SKU. Re-running the feed applies the previously-failing ~300 groups and
apply `errors` drops to ~0 (`Apply complete: groups=… variants=… errors=0`). On the PDP, a
center-bore-branching product (e.g. an XD845 handle) shows a Center Bore selector that resolves to the
correct variant; a single-bore product shows no extra selector.

## Out of scope

- Load rating as a Discovery facet; a center-bore filter in the storefront filter rail.
- Tire grouping (tires stay one-product-per-row).
- Any change to **grouping** — `group_key` (`Brand+DisplayStyleNo+Finish`, or the `sku:` fallback) is
  unchanged. This is purely intra-group **variant identity**.
- An in-place option-migration script for the existing 4-option products (decision 3 chose wipe +
  re-import instead).
