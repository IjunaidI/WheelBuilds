# PDP correctness & polish (G3) — Design

> Spec for backlog group **G3** — items **WB-048**, **WB-029**, **WB-030**.
> Date: 2026-06-25. Status: in-progress. Pillar: PDP.
> All three are storefront-PDP-local (plus one shared backend test for WB-030).
> No catalog re-apply, no migration, no new dependency.

## Context

The six-axis variant model (WB-051) made the PDP bolt-pattern row **load-bearing** —
it now gates the size grid (WB-003). That promotion exposed a live correctness defect
(WB-048) and is a natural moment to close two adjacent PDP-polish items (WB-029 placeholder
de-hardcoding, WB-030 the hand-synced `normalizeFinish` twin).

Design principle throughout: **the logic lives in pure, unit-testable helpers; React only
consumes them.** Nothing here touches the database or the vendor pipeline.

Relevant files (read during brainstorming):
- `storefront/src/modules/product-detail/data/get-product.ts` — PDP loader (`mapToDetail`)
- `storefront/src/modules/product-detail/data/group-sizes.ts` — pure size-grouping helpers
- `storefront/src/modules/product-detail/components/hero/index.tsx` — owns variant-selection state
- `storefront/src/modules/product-detail/components/hero/variant-picker.tsx` — renders the rows
- `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx` — qty + trust strip
- `storefront/src/modules/product-detail/components/specs/index.tsx` — engineering spec grid
- `backend/src/modules/vendor-sync/search/normalize-finish.ts` — canonical finish bucketer
- `fixtures/bolt-pattern-canonical-golden.json` + its two twin tests — the de-drift precedent

---

## WB-048 · Placeholder bolt pattern ("BLANK"/empty) is a selectable PDP gate

### Problem
`mapToDetail` builds the bolt-pattern list with `.filter(Boolean)`:

```ts
const boltPatterns = Array.from(new Set(
  variants.map((v) => String((v.metadata as any)?.bolt_pattern_raw ?? "")).filter(Boolean)
))
```

`.filter(Boolean)` drops `""` but **keeps the literal string `"BLANK"`** that some vendor rows
carry as a placeholder. Since WB-003 made the bolt-pattern row gate the size grid, `"BLANK"`
becomes a clickable chip, a group key, and a filter target (e.g. `performance-replicas-126-gloss-black`
exposes a clickable "BLANK"). It also flows into `boltPatternsCanonical` (reverse-fitment) and the
`boltPattern` lead value.

### Fix
Loader-side normalization, keeping `sizesForBoltPattern`'s all-sizes fallback as the safety net for
genuinely pattern-less products.

1. **New pure helper** in `group-sizes.ts`:
   ```ts
   /** True when a vendor bolt_pattern_raw is a real, selectable pattern (not a placeholder). */
   export function isRealBoltPattern(raw: unknown): boolean
   ```
   Rejects (case-insensitive, trimmed): `""`, whitespace-only, `"BLANK"`, `"N/A"`. Accepts everything
   else (real patterns like `5X114.3`, `6X135/5.5`).

2. **`mapToDetail`** — replace `.filter(Boolean)` with `.filter(isRealBoltPattern)`. One change cleans
   `boltPatternOptions`, `boltPatternsCanonical` (derived), and `boltPattern` (the lead value) at once.

3. **`groupVariantsIntoSizes`** — normalize a placeholder `bolt_pattern_raw` to `""` in the size key:
   ```ts
   const rawBp = String(m.bolt_pattern_raw ?? "")
   const boltPattern = isRealBoltPattern(rawBp) ? rawBp : ""
   ```
   Placeholder-keyed sizes collapse into the pattern-less bucket and remain reachable **only** via the
   existing all-sizes fallback in `sizesForBoltPattern` (matching length 0 → returns all sizes).

4. **`hero/index.tsx` + `variant-picker.tsx`** — hide the bolt-pattern row when there are **≤1 real
   patterns**. One chip is not a meaningful choice; zero is noise. The hero already derives
   `selectedBoltPattern = boltPatternOptions[0] ?? product.boltPattern`; with an empty options array this
   falls back to `""` and `sizesForBoltPattern(sizes, "")` returns all sizes (correct).

### Resulting behavior (matches WB-048 verify)
- A product with a `"BLANK"`/empty `bolt_pattern_raw` shows **no "BLANK" chip**; its sizes still render.
- **Mixed** real+BLANK in one group: selecting a real pattern hides the unknown-pattern sizes — correct,
  because we cannot assert those sizes fit the selected pattern.
- **Genuinely pattern-less** product: no chip row at all, all sizes shown via fallback.

### Tests (storefront Vitest, `group-sizes`)
- `isRealBoltPattern`: `""`, `"  "`, `"BLANK"`, `"blank"`, `"N/A"` → false; `"5X114.3"`, `"6X135/5.5"` → true.
- `groupVariantsIntoSizes`: a variant with `bolt_pattern_raw="BLANK"` is keyed under `""`; a product whose
  only pattern is BLANK still yields its sizes via `sizesForBoltPattern(sizes, "")`.

---

## WB-029 · PDP placeholders (qty default, low-stock threshold, specs, ship copy)

### Finding that scopes this item
The wheel feed carries **no** construction, country-of-origin, or warranty field. Wheel variant metadata
is dimensions / bolt geometry / center bore / load rating; product metadata is brand / style / finish
(`backend/src/modules/vendor-sync/pipeline/build-metadata.ts`). So "populate from vendor data" is
impossible for those three — we will **not fabricate** them. The honest split:

### A. Real de-hardcoding → a PDP config module
**New `storefront/src/modules/product-detail/data/pdp-config.ts`** exporting (each with an optional
`NEXT_PUBLIC_PDP_*` env override, else the literal default):

| Constant | Default | Replaces |
|---|---|---|
| `DEFAULT_WHEEL_QTY` | `4` | `useState(4)` in purchase-panel |
| `LOW_STOCK_THRESHOLD` | `4` | `qty <= 4` in `availabilityOf` |
| `FREE_SHIP_THRESHOLD_USD` | `199` | "Orders $199+" trust strip |
| `SHIP_LEAD_TIME` | `"Ships 2–3 days"` | variant-picker availability label + trust strip |
| trust-strip copy | (current 3 cells) | hardcoded array in purchase-panel |

Wiring:
- `purchase-panel.tsx`: `useState(DEFAULT_WHEEL_QTY)`; trust-strip cells + "$199+" read from config.
- `group-sizes.ts`: `availabilityOf(qty, threshold = LOW_STOCK_THRESHOLD)` — stays a pure function
  (threshold defaulted from config; tests can pass an explicit threshold).
- `variant-picker.tsx`: `AVAILABILITY_LABEL.in_stock` lead-time text from config.

### B. Specs grid → read admin metadata if present, else hide
- `mapToDetail`: `construction` / `countryOfOrigin` / `warranty` read from `metadata.construction` /
  `metadata.country_of_origin` / `metadata.warranty` if an admin set them, else `null` (not `"—"`).
- `ProductDetail.specs` type: relax those three from `string` to `string | null`.
- `specs/index.tsx`: build the rows array conditionally — **omit a row whose value is `null`** (the exact
  pattern the Hub-bore row already uses). No dead "—" cells.

### Tests
- `group-sizes`: `availabilityOf(qty, threshold)` honors a passed threshold (e.g. threshold 2 → qty 3 is
  `in_stock`, qty 2 is `low_stock`).
- Config defaults are plain constants (smoke-importable); env-override parsing is a thin `Number(...) || default`.

### Trade-off accepted
Construction / origin / warranty stay **hidden** until an admin populates product metadata. This is the
honest state of the data — better than a fabricated value or a permanent "—".

---

## WB-030 · `normalizeFinish` hand-synced twin → golden-fixture lockstep

### Problem
`normalizeFinish` exists twice: the canonical backend copy
(`backend/src/modules/vendor-sync/search/normalize-finish.ts`, used by the Meili transformer) and an
**inline** copy in the storefront PDP loader (`get-product.ts`). They are logically equivalent but **not**
byte-equivalent (backend uses keyword arrays + `.some`; storefront uses regex). The comment claims
"byte-equivalent" and asks for manual lockstep — exactly the silent-drift hazard CLAUDE.md warns about.

### Fix (chosen approach: golden-fixture lockstep — mirrors the existing bolt-pattern precedent)
The repo already de-drifts a twin this way: `fixtures/bolt-pattern-canonical-golden.json` is consumed by a
test in **each** app (`backend/.../__tests__/bolt-pattern-canonical-golden.test.ts` and
`storefront/src/lib/fitment/__tests__/canonical-bolt-pattern.test.ts`). Drift becomes a failing test, not a
prod mismatch. We replicate that for finish.

1. **`fixtures/finish-normalize-golden.json`** (repo root) — `[{ "input": string, "output": "black"|"bronze"|"silver" }]`
   covering the precedence rules:
   - bronze keywords: `"Bronze"`, `"Satin Gold"`, `"Copper"`, `"Brass"` → `bronze`
   - black dominance over silver accent: `"Gloss Black Machined"`, `"Gloss Black Milled"` → `black`
   - silver/accent without black face: `"Machined"`, `"Gunmetal"`, `"Titanium"`, `"Graphite"`, `"Polished"` → `silver`
   - empty / unknown: `""`, `"Brushed Olive"` → `black`
   - case-insensitivity: `"BRONZE"`, `"gloss black"` → expected bucket

2. **Extract the storefront copy** to `storefront/src/lib/fitment/normalize-finish.ts` (exported function
   returning `Finish`), and import it into `get-product.ts` (replaces the inline function). This makes the
   storefront copy importable and testable; the `Finish` type import stays from `@modules/common/components/wheel`.

3. **Two tests, one fixture** (mirror the bolt-pattern golden tests verbatim in structure):
   - `backend/src/modules/vendor-sync/__tests__/normalize-finish-golden.test.ts` (runs in `pnpm test:sync`),
     importing `../search/normalize-finish`, reading `../../../../../fixtures/finish-normalize-golden.json`.
   - `storefront/src/lib/fitment/__tests__/normalize-finish.test.ts` (Vitest), importing `../normalize-finish`,
     reading `../../../../../fixtures/finish-normalize-golden.json`.

4. **Comment in both `normalize-finish.ts` files** naming `fixtures/finish-normalize-golden.json` as the
   shared contract (replacing the current "keep byte-equivalent by hand" note).

### Trade-off accepted (per brainstorming decision)
Two implementations remain, guarded by a shared golden — rather than collapsing to one stored
`metadata.finish_bucket` (which would require a catalog backfill over the Railway proxy right after the
WB-051 re-import). Cheap, no DB writes, and consistent with the bolt-pattern precedent. The verify
intent — "drift cannot silently ship" — is met by the cross-app golden test.

---

## Out of scope (explicitly)
- **WB-053** (Discovery `/store` browse cap at Meili `maxTotalHits=1000`) is a backend `medusa-config.js`
  change requiring a redeploy to push index settings — it does **not** belong in this PDP branch. It will be
  folded in as its own one-line config commit alongside G2 (per the session plan).
- Real product photography, wishlist backend, tire PDP — unrelated, tracked elsewhere.

## File inventory (what the plan will touch)
**New**
- `storefront/src/modules/product-detail/data/pdp-config.ts`
- `storefront/src/lib/fitment/normalize-finish.ts`
- `storefront/src/lib/fitment/__tests__/normalize-finish.test.ts`
- `fixtures/finish-normalize-golden.json`
- `backend/src/modules/vendor-sync/__tests__/normalize-finish-golden.test.ts`

**Modified**
- `storefront/src/modules/product-detail/data/get-product.ts` (filter `isRealBoltPattern`; import extracted
  `normalizeFinish`; read optional construction/origin/warranty metadata)
- `storefront/src/modules/product-detail/data/group-sizes.ts` (`isRealBoltPattern`; placeholder size-keying;
  `availabilityOf` threshold param)
- `storefront/src/modules/product-detail/data/types.ts` (`specs` construction/origin/warranty → `string | null`)
- `storefront/src/modules/product-detail/components/hero/index.tsx` (hide bolt-pattern row when ≤1)
- `storefront/src/modules/product-detail/components/hero/variant-picker.tsx` (hide row; config lead-time)
- `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx` (qty default; trust copy)
- `storefront/src/modules/product-detail/components/specs/index.tsx` (omit null spec rows)
- `backend/src/modules/vendor-sync/search/normalize-finish.ts` (comment → golden contract)

## Verification (whole group)
- `cd storefront && pnpm vitest run` — new `group-sizes` + `normalize-finish` tests green; existing 48 still pass.
- `cd backend && pnpm test:sync` — new `normalize-finish-golden` green; vendor-sync suite still passes.
- `cd storefront && npx tsc --noEmit` — no new type errors from the `specs` type change.
- Manual PDP smoke (a known multi-pattern product + a BLANK-pattern product): BLANK chip absent;
  single-pattern product shows no bolt row; null specs hidden; qty defaults to config value.
