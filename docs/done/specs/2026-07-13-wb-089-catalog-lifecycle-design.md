# WB-089 · Catalog lifecycle & data integrity — design

> Detailed spec for **WB-089** (fix group **G11**, build order **step 1**). Expands the sketch in
> [../../future/specs/2026-07-13-ux-completeness-fixes-design.md §WB-089](../../future/specs/2026-07-13-ux-completeness-fixes-design.md).
> Findings: **L1 ✔, L3, L4, L5 ✔, L8, L9, L10** from the
> [2026-07-13 UX & product-logic audit §L](../../future/plans/2026-07-13-ux-completeness-audit.md).
> All seven were **re-verified against current `main`** on 2026-07-13 (evidence inline below) — the audit is static.
> **WB-089 runs first in G11 because it is the only chunk that forces a full Meili re-sync, and that same
> re-sync serves WB-087 (search) and WB-088 (discovery).**

## Why this chunk, why first

The catalog *machinery* held up under audit; what decays is *lifecycle truth* at the seams:
discontinued products never leave the search index (dead PDP links + dead sitemap URLs), an
all-warehouse sellout keeps phantom stock for up to 12 h, $0-MSRP rows become "From $0.00" cards
addable at $0, dead variants still price/facet the index, junk placeholder patterns are live facet
checkboxes, dash-metric tire sizes are unsearchable, and distinct group keys that collide on `handle`
fail silently on every run. These are backend data-integrity fixes that the storefront trust tasks
(WB-087/088/090/100) all read *through*, so they land first.

Backend `vendor-sync` + one `medusa-config.js` line + one migration. Wheels **and** tires — the
staging/index fixes are adapter-agnostic. One session, one deploy, one Meili re-sync.

## Decisions (resolved 2026-07-13)

- **D-L3 — $0 rows:** drop at staging **and** count in a new `skipped_invalid_price_count` run column
  (mirrors the image-less filter; one migration). *Chosen over log-only / UI-guard-only.*
- **D-L10 — handle collisions:** **deterministic** hash suffix (`-<hash6(group_key)>`) applied **only** to a
  colliding group; non-colliding handles stay byte-identical. *Chosen over numeric `-2` (churns) / surface-only.*
- **D-L8 — tire identity:** **full** — dash-metric size parse **+** model-confidence gate **+** a small
  brand→model alias map. Refinement below: the alias map expands the **display title + search text only,
  not the group_key/handle**, so identity (and URLs) stay stable and no tire re-grouping is triggered.

---

## Fix 1 — L1: index eviction (discontinued products leave Meili)

**Re-verified (current `main`).** `medusa-config.js:258-263` `fields` omits `'status'`. The installed
`@rokmohar/medusa-plugin-meilisearch@1.3.5` per-event step
(`.medusa/server/src/workflows/steps/upsert-product.js`) fetches the product with **only** the configured
`fields`, then:

```js
if (!product.status || product.status === 'published') addDocuments([product])
else deleteDocument(product.id)
```

Because `status` is absent from `fields`, `product.status` returns `undefined` → `!undefined` is truthy →
the handler **re-adds every drafted product instead of deleting it**. Vendor-sync emits `product.updated`
after discontinuation, so drafted products are actively re-added. The plugin's own full reconcile job
(`meilisearch-products-index`, which queries `status:'published'` and deletes orphans) is configured
`schedule:'* * * * *'` **but `numberOfExecutions: 1`** → it runs **once per process boot**, not continuously.

**Design.**
1. **Root fix — `medusa-config.js`:** add `'status'` to the Meili `fields` array. Now the per-event
   `product.updated` handler fetches a populated `product.status`; a drafted (discontinued) product takes
   the `deleteDocument` branch. Additive and side-effect-free — `buildSearchDocument` never reads `status`.
2. **Belt-and-braces reconcile — a new daily `vendor-sync` cron** (`src/jobs/meilisearch-reconcile-tick.ts`,
   e.g. `0 4 * * *`) that resolves the event bus and **emits the plugin's existing `meilisearch.sync` event**
   (handled by the plugin's `meilisearch-sync` subscriber → reindex published + delete orphans). We reuse the
   plugin's reconcile rather than reimplementing it. This sweeps strays the per-event path can miss: image-less
   publishes, dropped events, and anything indexed before this fix. Gated on Meilisearch being configured
   (same env guard the module uses).

**Test.** A guard unit test asserting the Meili `fields` list includes `'status'` (regression tripwire, since
the whole fix hinges on it); a unit test that the reconcile cron resolves `EVENT_BUS` and emits
`meilisearch.sync`. The plugin's own delete behavior is pinned by the version + the read above, not re-tested here.

**Deploy.** Restart picks up `fields`. The full re-sync (below) clears already-indexed drafts immediately;
thereafter the per-event delete + daily reconcile keep the index clean.

---

## Fix 2 — L5: all-warehouse sellout zeroing

**Re-verified.** `stage.ts:92-104` only inserts `vendor_stock_staging` rows for warehouses with `qoh > 0`.
`service.ts:553-554` (`runStockOnly`) derives `stagedParts` from `vendor_stock_staging`:

```js
const stockRows = await listVendorStockStagings({ run_id: runId }, { take: null })
const stagedParts = stockRows.map(r => r.part_number)
```

A part that sold out at **every** warehouse has **no** stock-staging rows this run → it is absent from
`stagedParts` → never selected by `selectStockPartNumbers` → its Medusa levels are never zeroed. Phantom
stock persists until the next full 12 h sync (partial sellouts already work — WB-070 A1). The zero-out
machinery itself is correct: `applyStockLevels` (`apply-stock.ts:80-89`) zeros every existing Medusa level not
covered by the current feed, and builds the location map from `previousStock` warehouse codes, so a
selected-but-empty part *does* get zeroed.

**Design.** In `runStockOnly`, source `stagedParts` from **`vendor_feed_staging`** (every part staged this run,
regardless of stock) instead of `vendor_stock_staging`:

```js
const stagedRows = await listVendorFeedStagings({ run_id: runId }, { select: ["part_number"], take: null })
const stagedParts = stagedRows.map(r => r.part_number)
```

`selectStockPartNumbers` already dedupes and intersects with current products, so the only change is the
source table. A fully-sold-out part now flows into `applyStockLevels`, which zeros its uncovered levels.

**Test.** Regression: a part with stock rows in run N and **none** in run N+1 → `runStockOnly` selects it and
its levels are zeroed (RED against the `vendor_stock_staging` sourcing). Cover the selection sourcing at the
service call site; the pure `selectStockPartNumbers` and `computeStockChanges` zero-out path already have tests.

---

## Fix 3 — L3: $0 / missing-MSRP gate at staging

**Re-verified.** `stage.ts:74-78` skips only `!normalized.imageUrl`. `NormalizedRecord.msrpUsd: number`
exists (`adapters/types.ts:23`) but nothing gates `<= 0`. A $0 row becomes a $0 Medusa price, `price_min: 0`,
a "From $0.00" card that leads price-asc, and is addable at $0.

**Design (D-L3: drop + count).**
1. **`stage.ts`:** after the image check, `if (normalized.msrpUsd <= 0) { skippedInvalidPriceCount++; continue }`.
   Add `skippedInvalidPriceCount` to `StageResult` and the completion log line, mirroring `skippedNoImageCount`.
2. **`models/vendor-feed-run.ts` + migration:** add `skipped_invalid_price_count` (`model.number()`, default 0);
   a hand-authored MikroORM migration adds the column. Write it in the run-row update at `stage.ts:122-126`
   next to `skipped_no_image_count`.
3. **Admin console (WB-006):** surface the new count on the run row/detail like the image-less count (small,
   additive — no new route).

Adapter-agnostic: the gate reads `normalized.msrpUsd`, so it covers wheels and tires uniformly.

**Test.** A `msrpUsd: 0` (and a negative) row is skipped and counted; a positive row is staged. Cover the
counter surfacing in the run update.

---

## Fix 4 — L4: discontinued variants out of the index

**Re-verified.** Write side flags discontinuation on the variant: `apply.ts:740` and `apply.ts:834` write
`metadata.discontinued = true` (+ `discontinued_at`), and `vendor_product_current.discontinued_at` is set
(`models/vendor-product-current.ts:15`); re-list clears both (`apply.ts:1229-1233`). Read side
(`build-search-document.ts:66,150`) iterates **all** variants, so a kept-but-discontinued variant still
contributes `price_min`/facets/sizes — "From $279" can be a permanently-dead variant.

**Design.** In both `buildWheelDocument` and `buildTireDocument`, derive from **live** variants only:

```js
const liveVariants = (product.variants ?? []).filter(v => (v.metadata ?? {}).discontinued !== true)
if (liveVariants.length === 0) return null   // → excluded stub, like image-less
```

Price/facets/sizes/`fit_specs` all iterate `liveVariants`. A product whose variants are **all** discontinued
returns `null` (coalesced to the `product_type:'non-wheel'` stub → excluded from discovery), consistent with
the image-less path. (PDP-side $0/variant-less guards are WB-090's job — out of scope here.)

**Test.** A product with one live + one discontinued variant indexes only the live variant's price/facets;
an all-discontinued product → `null`. Both wheel and tire builders.

---

## Fix 5 — L9: placeholder bolt patterns never index

**Re-verified.** `build-search-document.ts:77-81` pushes any truthy `bolt_pattern_raw` (including literal
`"BLANK"`, `"CALL"`) into the raw `bolt_patterns` facet; `canonicalBoltPatterns` drops unparseable values so
`bolt_patterns_canonical` is clean, but the **raw** facet renders `"BLANK"` as a live checkbox (D4/L9). This is
the backend root-cause of the WB-074 D7 follow-up.

**Design.**
1. **Backend transformer:** a shared `PLACEHOLDER_BOLT_PATTERNS` set (`BLANK`, `N/A`, `NA`, `CALL`, empty,
   case-insensitive). Filter the raw pattern before pushing to `bolt_patterns` (and before canonicalizing).
   Co-locate with / reuse the existing `parse-helpers.ts` placeholder recognition so there is one source of truth.
2. **Storefront twin:** add `"call"` to the storefront `PLACEHOLDER_BOLT_PATTERNS` list (the deferred WB-074 D7
   item) so any legacy indexed value is also filtered at the card/filter layer until the re-sync lands.

**Test.** A variant with `bolt_pattern_raw` `"BLANK"`/`"CALL"` produces no `bolt_patterns` entry; a real pattern
is unaffected.

---

## Fix 6 — L8: tire identity (full)

**Re-verified.** `parseTireSize` (`tire-parse-helpers.ts:65`) tries three regexes (metric `…R…`, LT/inch `…X…`,
bias `…-…PR`); none match dash-metric `WWW/AA-RR` (e.g. `285/45-22 114H`) → all-null result →
`tireSizeLabel` falls back to the raw **part number** (`tire-facets.ts:20-28`), which is then excluded from the
`tire_sizes` facet and `fit_specs` (`build-search-document.ts:153-169`). `extractTireModel` (`model-key.ts:69`)
marks a model "confident" on **any** surviving alphabetic token, so vendor abbreviations pass verbatim
(`"WDPEAK AT4W"`) and junk becomes a confident title (`"UNKNOWN TIRE FORMAT"`). No alias map exists today.
Golden: `fixtures/tire-model-golden.json` (13 vectors; vector 12 currently encodes the dash-metric-unparsed
case as expected).

**Design (D-L8: full).**
1. **Dash-metric parse:** add a 4th `parseTireSize` pattern `~/(\d{2,3})\/(\d{2,3})-(\d{2})\b/` capturing
   width/aspect/rim, canonicalizing the `-` to radial `R` → `285/45R22` (+ existing load/speed capture). Verified
   downstream: a parsed size now flows into `canonical_size`, the size label, the `tire_sizes` facet, and `fit_specs`.
2. **Confidence gate:** `extractTireModel` treats "**no** size token found **and** nothing structured stripped"
   as **unconfident** → the existing per-SKU group fallback (`group-key.ts:11-21`), so junk descriptions no longer
   become confident titles. (A confident model still requires a surviving alphabetic token *plus* evidence the line
   parsed as a real tire.)
3. **Alias map (title/search only — churn-avoiding refinement):** a new pure `model-alias.ts` with a small,
   documented table (~10 vendor abbreviations, e.g. `WDPEAK → "Wildpeak A/T4W"`), applied **only** when building
   the **display title** (`buildTireGroupTitle`) and the search-facing model/style text — **not** the
   `group_key`/`handle`. Rationale: the tire `group_key` is `Brand|model` and drives the handle; expanding it would
   re-identify affected groups → discontinue-old / create-new + URL churn on the next full sync. Keeping identity on
   the raw model and expanding only the human-facing name fixes the ugly titles with zero re-grouping. (If identity
   should follow the expanded name instead, that is a one-line change but re-introduces the churn — flagged, not chosen.)
4. **Golden updates:** `fixtures/tire-model-golden.json` — vector 12 flips from `sizeToken: null` to the parsed
   size; add abbreviation-expansion and junk→unconfident vectors. Update the inline expectations in
   `tire-facets.test.ts` / `tire-parse.test.ts` and add a dash-metric row to `__fixtures__/tires-small.csv`.

**Test.** `parseTireSize` canonicalizes `285/45-22 114H`; `extractTireModel` returns unconfident for junk and the
expanded name for known abbreviations (golden); `canonicalTireSize` yields a real size for the dash-metric case.

---

## Fix 7 — L10: handle collisions retry deterministically

**Re-verified.** `buildGroupHandle` (`wheel-grouping.ts:182-187`) slugifies `Brand + DisplayStyleNo`;
`slugify` (`:27-32`) collapses all non-alphanumerics to `-` and is **not injective**, so distinct group_keys can
map to the same handle (e.g. punctuation-only differences in `DisplayStyleNo`, or a brand/style join-boundary
ambiguity). On the resulting unique-handle DB violation, the per-group `try/catch` (`apply.ts:186-196`) logs +
pushes to `errors` + **skips** the group with **no** retry; adoption is by `external_id`/`group_key`, not handle,
so the next run re-classifies it as new, regenerates the identical handle, and fails identically — a permanent,
admin-console-only silent gap. Tires share the shape (`tire-grouping.ts:63-68`, create path `apply.ts:464-486`).

**Design (D-L10: deterministic hash suffix).**
1. **Pure `resolveUniqueHandle(base, handleExists, groupKey)`** helper: returns `base` when free, else
   `${base}-${hash6(groupKey)}` where `hash6` is the first 6 chars of a stable hash of the group_key (deterministic
   → the same colliding group gets the same handle every run). Unit-tested in isolation.
2. **`apply.ts`** (wheel `applyNewGroup` + tire create): wrap `createProductsWorkflow` so that on a **handle**
   uniqueness violation (guarded on the error being a handle conflict, not any error) it retries **once** with the
   suffixed handle; if that also collides, it errors as today. Non-colliding groups are untouched → no URL churn.

**Test.** The pure helper: free base → base; collision → `base-<hash6>`; deterministic across calls; distinct
group_keys colliding on base get distinct suffixes.

---

## Verify (whole chunk)

- **Offline:** `pnpm test:sync` green with one RED-against-old case per fix (fields-includes-status guard;
  feed-staging stock sourcing; $0 skip+count; live-variant-only doc + all-discontinued→null; placeholder filter;
  dash-metric parse + confidence + alias golden; `resolveUniqueHandle`).
- **Live (post deploy + re-sync):** a drafted product disappears from Meili within the reconcile window; a forced
  all-warehouse-zero part reads 0 stock after the next stock tick; a dash-metric tire shows a real size and appears
  in the size facet; no `BLANK`/`CALL` bolt-pattern checkbox; a $0 feed row is absent from the catalog and counted
  in the run summary.

## Deploy / ops (run by the operator, per G9/G10 precedent)

1. **Backend deploy → restart** — picks up `fields: status` and the reconcile cron; the
   `skipped_invalid_price_count` migration auto-runs on `db:migrate`.
2. **Full Meili re-sync** — doc shape changed (L4 live-variant filtering, L9 placeholder filtering, L8 titles), so
   re-index every product (restart triggers the plugin's boot reconcile, or emit `meilisearch.sync`). This also
   evicts already-indexed drafts (L1). **This same re-sync is the one WB-087 needs** — do WB-087 in the same deploy
   window if convenient.
3. **Next FULL vendor sync** re-applies groups where staging rules changed (L3 gate) — idempotent, run off-peak
   (WB-070 precedent). L8's alias map is title/search-only, so **no tire re-grouping** occurs.

## Out of scope (owned elsewhere)

- Storefront $0 / `discontinued` UI guards and card range rendering → WB-088 (D5) / WB-090 (P10-P12).
- Search title enrichment, synonyms, size-token search → WB-087.
- `in_stock` availability facet + reindex-on-stock-flip → WB-100 (depends on this chunk).
- PDP variant-less / all-OOS banners → WB-090.

## Docs workflow (on completion)

Flip WB-089 → `done` in [BACKLOG.md](../../future/BACKLOG.md); update the G11 line and the Vendor-import /
Discovery pillar rows + "Last verified" in [STATUS.md](../../STATUS.md); move this spec (and its plan) to
`docs/done/`; run `/doc-review` before committing doc-affecting changes.
