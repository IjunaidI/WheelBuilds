# WB-104 Trim Honesty — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Backend + storefront. Spec: [../specs/2026-07-14-wb-104-trim-honesty-design.md](../specs/2026-07-14-wb-104-trim-honesty-design.md).

**Global constraints:** Backend tests `pnpm test:fitment` (+`test:sync`); storefront `npx vitest run` (import `{describe,it,expect}`; 5-error tsc baseline). `extractVehicleIdentity` is a SHARED wheel+tire helper (one fix → both lists). Region param is additive (default `usdm`). WB-091 already landed in `fitment/index.tsx` (chip/band/matching) + `reverse-fitment.ts` (bore path) — build on it, keep the seam clean. Branch `feat/g11-wave2-pdp-fitment`.

---

### Task 1: T1 — trim-honest identity (backend)
**Files:** `backend/src/modules/wheel-size/reverse-fitment.ts` (`extractVehicleIdentity` ~47-62), `backend/src/modules/wheel-size/types.ts` (`ReverseFitmentVehicle`/`ReverseTireFitmentVehicle` +`trimNarrowed`). Test: `__tests__/reverse-fitment.test.ts`.
- [ ] Failing test: `extractVehicleIdentity` with `raw.data` of >1 DISTINCT trims → `trim: undefined`; single entry → that trim; multiple entries ALL sharing one trim → that trim. Both reverse builders emit no trim for a union (multi-distinct-trim) row + set `trimNarrowed` correctly. (The current `rawOf` helper only builds single-entry data — extend it.)
- [ ] RED → implement: in `extractVehicleIdentity`, compute `const trims = new Set(raw.data.map(e => e?.trim).filter(Boolean))`; `trim = (raw.data.length === 1 || trims.size === 1) ? [...trims][0] ?? d.trim : undefined`. Make/model/year-label unchanged (still from `raw.data[0]`). Add `trimNarrowed: boolean` (`raw.data.length === 1`) to `ReverseFitmentVehicle` + `ReverseTireFitmentVehicle`; set it in both `buildReverseFitment` + `buildReverseTireFitment`.
- [ ] GREEN `npx -y pnpm@9.10.0 test:fitment`; `test:sync`; backend tsc.
- [ ] Commit `fix(WB-104): trim-honest reverse-fitment identity — union row claims no trim (T1)`.

---

### Task 2: T2 — honest YOUR-VEHICLE matching (storefront, both surfaces)
**Files:** new `storefront/src/lib/fitment/slugify.ts`, `components/fitment/index.tsx` (make/model/trim compare ~200-214) + `components/tire/fitment.tsx` (via the shared `vehicle-entry-match` helper WB-091 added). Test: highlight matrix.
- [ ] Failing test: make/model compare via `slugify` (so `"land-rover"` ↔ `"Land Rover"` match); a union row (no trim) anchors on year/make/model; a trim-narrowed row matches the vehicle's trim label OR its `modificationSlug`.
- [ ] RED → implement: new `slugify(v): string` (lowercase, non-alnum→`-`, trim `-`) — mirror the backend vendor-sync pattern; none exists in `storefront/src`. In the shared `vehicle-entry-match` helper (WB-091) + `fitment/index.tsx`/`tire/fitment.tsx`: make/model compare `slugify(f.x) === slugify(active.x)`; trim compare keeps the permissive `!f.trim || matches` (union rows now carry `trim: undefined` from T1), and when the row is trim-narrowed compare against BOTH `active.trim` (label) AND `active.modificationSlug` (slug-normalized). Port to both wheel + tire.
- [ ] GREEN storefront vitest; `tsc`.
- [ ] Commit `fix(WB-104): slug-normalized make/model + trim-aware YOUR-VEHICLE highlight, both surfaces (T2)`.

---

### Task 3: T3 — region-scoped modifications + visible fallback (backend)
**Files:** `backend/src/modules/wheel-size/client.ts` (`modifications` +region ~55-57), `service.ts` (`listModifications` +region cache key ~305-307; `resolveByModel` broad-fallback warn+trimNarrowed ~227-233), `backend/src/api/store/vehicle-catalog/modifications/route.ts` (+region query), `backend/src/modules/wheel-size/types.ts` (`VehicleFitment.source.trimNarrowed`). Test: cache key + fallback.
- [ ] Failing test: `listModifications` cache key includes region; `resolveByModel`'s broad fallback (trim-narrowed empty → retry without slug) logs a warn + sets `source.trimNarrowed = false`.
- [ ] RED → implement: `client.modifications(make, model, year, region = "usdm")` sends `?region=`; `service.listModifications(make, model, year, region = "usdm")` (cache key `${make}|${model}|${year}|${region}` — old 3-part rows orphan silently, self-heal); the route reads an optional `?region=` (default `usdm`). In `resolveByModel`, when the trim-narrowed query returns empty and it retries broad, `logger.warn` with the discarded slug + set `source.trimNarrowed = false` on the returned fitment (additive field; no required UI change).
- [ ] GREEN `test:fitment` + `test:sync`; `npx medusa build` exit 0; backend tsc.
- [ ] Commit `fix(WB-104): region-scoped modifications catalog + visible trim-fallback (T3)`.

---

### Task 4: T4 — pin the slug contract
**Files:** `backend/src/modules/wheel-size/__tests__/live-slug.test.ts` (extend the gated live test), new offline `toOptions` precedence test near `ymm-pane` (or a `toOptions` unit if extractable). Test.
- [ ] Offline: freeze `toOptions`' slug-first precedence (`item.slug ?? item.value ?? item.id ?? item.name`) against a captured modifications fixture — a modifications item with a `slug` yields that slug as the option value. (If `toOptions` isn't exported, extract it to a testable pure module.)
- [ ] Gated live (`RUN_WHEEL_SIZE_LIVE`): (a) `/modifications/` items expose a string `slug`; (b) a `by_model` narrowed by one of those slugs returns non-empty data whose entries all carry that trim.
- [ ] GREEN (offline runs; gated live skipped without the env). `tsc`.
- [ ] Commit `test(WB-104): pin /modifications slug contract (offline + gated live) (T4)`.
