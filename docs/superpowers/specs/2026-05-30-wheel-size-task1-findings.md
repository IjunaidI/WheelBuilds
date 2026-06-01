# Task 1 — wheel-size.com Sandbox Validation: Findings & Decision

**Date:** 2026-06-01
**Decision:** ✅ **GO** — parity holds; no `STANDARD_PCDS` change; no Meilisearch re-index.
**API version:** v2 (`https://api.wheel-size.com/v2`). Key present as `WHEEL_SIZE_API_KEY` in `backend/.env` (gitignored).

Validated against the **live** API. Real responses recorded as test fixtures at `backend/src/modules/wheel-size/__tests__/__fixtures__/by-model-*.json` (sanitized — they contain no key).

**Cross-checked against the authoritative OpenAPI v2 spec** (`https://api.wheel-size.com/v2/swagger/?format=openapi`), which confirms every reconciliation below: `by_model` requires `make`+`model` (then ≥1 of `modification`/`region`, and ≥1 of `year`/`generation` when no `modification`); `technical.centre_bore` is a **string** (can be `"N/A"`), `pcd` a nullable number, `stud_holes` a nullable integer, `bolt_pattern` a string (can be `"N/A"`); `wheels[].{front,rear}.{rim_diameter,rim_width}` are inches and `rim_offset` is mm, all `number | null` — matching our `*_in` / `offset_mm` index fields with no unit conversion. `normalize` guards `studs != null && pcd != null` and `numLoose("N/A") → null`, so the documented null/`"N/A"` cases degrade gracefully. The spec documents no error/rate-limit codes — confirming the daily counter as the authoritative quota signal.

---

## 1. Bolt-pattern parity → GO

Re-deriving `canonicalBoltPatterns(\`${stud_holes}x${pcd}\`)` equals wheel-size's own `bolt_pattern` string in **every** vehicle tested, including the non-standard-PCD trucks:

| Vehicle | `stud_holes` | `pcd` | their `bolt_pattern` | `canon(\`${studs}x${pcd}\`)` | match |
|---|---|---|---|---|---|
| Mitsubishi Outlander 2016 | 5 | 114.3 | `"5x114.3"` | `["5x114.3"]` | ✅ |
| Ford F-150 2021 | 6 | 135 | `"6x135"` | `["6x135"]` | ✅ |
| Hummer H3 2008 | 6 | 139.7 | `"6x139.7"` | `["6x139.7"]` | ✅ |
| Chevrolet Silverado 2500HD 2020 | 8 | **180** | `"8x180"` | `["8x180"]` | ✅ |

**Why the non-standard-PCD risk did not materialize:** wheel-size returns *clean* `pcd` values (integer `180`, standard `135`/`139.7`). For an integer PCD, `canonicalBoltPatterns` emits no trailing decimal (`String(180)` → `"180"`), so `"8x180"` matches without needing `180` in `STANDARD_PCDS`. The hypothesized `6x132`/`8x180.x` inch-vs-mm divergence requires the *vendor* side to round to `.1`; for these mm-expressed truck PCDs both sides land on the same integer string. **No `STANDARD_PCDS` extension or re-index is needed.** Residual note: if a future vehicle surfaces a vendor `bolt_pattern_raw` in inches that rounds differently from wheel-size's `pcd`, add that PCD to `STANDARD_PCDS` (one place) and re-index then.

## 2. v2 JSON paths (the plan's paths were right except one type)

`by_model` → `data[]` (one entry per trim). Per entry:
- `technical.stud_holes` — **number** (`5`)
- `technical.pcd` — **number** (`114.3`)
- `technical.bolt_pattern` — **string** (`"5x114.3"`)
- `technical.centre_bore` — **STRING** (`"67.1"`) ⚠️ — this is the vehicle **hub bore**. The provisional `num()` read returned `null` for it (silently disabling the bore gate); fixed to `parseFloat` (`numLoose`).
- `wheels[]` — `{ is_stock: bool, front: {...}, rear: {...} }`; `front/rear.{rim_diameter, rim_width, rim_offset}` are numbers; **`rear` is all-null when not staggered**. `is_stock:true` = OEM, `is_stock:false` = aftermarket window. (Also `rear_axis_*` fields exist for staggered setups — not consumed this spec.)
- The modification "slug" is a hash (e.g. `"32b586f1cd"`), found at `data[].slug` and `generation.slug`.

## 3. `by_model` param contract → reconciled (was wrong in the plan)

🔴 `by_model?modification=<slug>&region=` returns **`400 VALIDATION_ERROR`** — `make` and `model` are **required**. The plan/spec assumed `by_model` keyed on the modification slug alone.

**Working contract (confirmed):** `by_model?make=<slug>&model=<slug>&modification=<slug>&region=` (precise — returns the single trim) **or** `make+model+year` (returns all trims for the year). The make/model values must be wheel-size **slugs** (from the cataloging endpoints).

**Reconciliation applied:** threaded `make+model+(modification|year)` through `client.byModel` → `WheelSizeService.getFitment` (cache key now `make|model|(modification|year)|region`) → the `/store/fitment/by-vehicle` route → the storefront `getFitmentByVehicle` → `ymm-pane` (which already holds make/model as slugs). `customer_vehicle` already stores `make/model/year/modification_slug`.

## 4. Quota vs no-data signal

- **Genuine no-data:** `200` + `{ "data": [], "meta": { "count": 0 } }` → `not_found`. ✅ (confirmed via a non-existent model slug). The classifier's "200 + empty data → not_found" is correct.
- **Bad params:** `400 VALIDATION_ERROR` with a non-empty body (a code bug, not an outage; production always sends valid params).
- **Quota exhaustion:** not triggered during validation (well under quota). Per docs it returns an empty body + non-2xx (≈`403`); the service's **own daily counter remains the authoritative outage signal**, and any non-2xx maps to the `503` outage path. Confirming the exact exhaustion status is a low-priority follow-up (the counter doesn't depend on it).

## 5. Cataloging endpoints

`/makes/`, `/models/?make=`, `/years/?make=&model=`, `/modifications/?make=&model=&year=` all return `{ data: [{ slug, name, ... }] }` (200). These back the YMM dropdowns; the selected **slug** is what flows into `by_model`. Lazy read-through cache stands.

## Still parked (not part of Task 1's API validation)

- **`actor_id` spike** — needs the dev backend running + a customer login (NOT the key). Still to do.
- **Both modules' migrations** — need a dev DB (`db:generate` ×2 + `db:migrate`).
- **Runtime/e2e verification** of the routes + storefront wiring — needs the backend running.
