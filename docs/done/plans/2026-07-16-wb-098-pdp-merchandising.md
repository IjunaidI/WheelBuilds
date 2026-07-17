# WB-098 PDP merchandising completeness — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Storefront only, no backend.** Spec: [../specs/2026-07-16-wb-098-pdp-merchandising-design.md](../specs/2026-07-16-wb-098-pdp-merchandising-design.md).

**Global constraints:** Storefront tests `npx vitest run <path>` (no globals — `import { describe, it, expect } from "vitest"`); tsc **2-error baseline** (`lib/data/onboarding.ts(6,13)`, `product-onboarding-cta(5,34)` — don't fix, don't regress); `npx next build` gates the `"use server"` async-export rule (pure helpers go in PLAIN modules); `npx next lint`. `next build` needs the backend on port 9000 — one may be running; if not, `cd backend && npx medusa develop`. Branch `feat/g12-wave-a-discovery-merch`. Every gap here is surfacing data that already exists — no vendor-sync/backend/migration. Wheel PDP = `modules/product-detail/components/hero/`; tire PDP = `modules/product-detail/components/tire/hero/`.

---

### Task 1: backspacing — fill the blank field
**Files:** new `modules/product-detail/data/backspacing.ts` + test; `modules/product-detail/data/group-sizes.ts` (~163 `backspaceIn: ""`).
- [ ] Failing test: pure `deriveBackspacing(widthIn, offsetMm)` → `(widthIn/2) + 0.5 + (offsetMm/25.4)` formatted `X.XX"`. Vectors: 9"×+15mm → `5.59"`; 8"×−12mm → `(4)+0.5+(−0.47)` = `4.03"`; a null/NaN width or offset → `""` (don't render a bogus value).
- [ ] RED → implement: replace `group-sizes.ts:163`'s hardcoded `backspaceIn: ""` with `deriveBackspacing(diameter?…, offset)` from the variant's width + offset-mm (read the surrounding `groupVariantsIntoSizes` to get the right width/offset locals). The two existing consumers (`auto-fitment-card.tsx:61`, `advanced-fitment-panel.tsx:174`) activate with no change. Leave `lipDepthIn`/`hubToLockIn` as-is (no source).
- [ ] GREEN vitest; `tsc`. Commit `feat(WB-098): derive backspacing to fill the existing PDP field`.

---

### Task 2: set-price "per set" row
**Files:** new `modules/product-detail/data/set-price.ts` + test; `modules/product-detail/components/hero/purchase-panel.tsx` (~193-213 price row, ~101 `lineTotalCents`); `modules/product-detail/components/tire/hero/purchase-panel.tsx` (the tire twin).
- [ ] Failing test: pure `setPriceLine(unitCents, qty)` → `{ show, text }` where `show` is `qty > 1 && unitCents != null`; text = `"$X × N = $Y per set"` using the app's `formatCentsUsd`. qty 1 → `show:false`; null price → `show:false`; qty 4 @ $369.99 → `"$369.99 × 4 = $1,479.96 per set"`.
- [ ] RED → implement: render the row under the "PER WHEEL"/"PER TIRE" price in both purchase panels, from the already-computed `unitPriceCents`/`quantity`. Copy template lives in `pdp-config.ts` (a `SET_PRICE_TEMPLATE` or just the "per set"/"per wheel" nouns) so wheel vs tire wording is configurable.
- [ ] GREEN vitest; `tsc`; `next build`. Commit `feat(WB-098): set-total "$X × N = $Y per set" row on both PDPs`.

---

### Task 3: copyable SKU + real JSON-LD sku
**Files:** `lib/data/products.ts` (~49-50 fields — add `+variants.sku`); `modules/product-detail/data/types.ts` (`OffsetVariant`, `TireSizeOption` — add `sku?: string`); `group-sizes.ts` + `data/tire/tire-size-options.ts` (extract `v.sku`); a small `CopySku` client component near the CTA in both purchase panels; `modules/product-detail/components/structured-data/json-ld.ts` (~135 — feed the real leaf `sku`, drop the `variantId` fake).
- [ ] Failing test: `tsc` + a render/unit is thin here (mostly wiring) — instead unit-test that `productJsonLd` emits `offers`/`sku` from a leaf carrying a real `sku` (extend the existing json-ld test), and that a leaf without a sku omits it.
- [ ] RED → implement: add `+variants.sku` to the fields string (same class as the existing `+variants.weight`); thread `sku` onto the variant/size; a click-to-copy row (`navigator.clipboard.writeText(sku)` + a sonner "Copied" toast) — a `"use client"` component, label "SKU". JSON-LD `sku` now = the rendered leaf's real sku (was the internal variantId).
- [ ] GREEN vitest; `tsc`; `next build` (the fields-string change must not break the PDP query). Live: a PDP renders + copies the part number. Commit `feat(WB-098): copyable SKU row + real JSON-LD sku (was the variant id)`.

---

### Task 4: lead-time + special-order at the CTA, tire load/speed legend
**Files:** `modules/product-detail/data/pdp-config.ts` (new SO + lead-time-at-CTA copy consts); `types.ts` (`isSpecialOrder?: boolean` on variant/size); `group-sizes.ts` + `tire-size-options.ts` (read `m.vendor_inv_order_type === "SO"`); both `purchase-panel.tsx` (render lead-time + SO at the CTA); `modules/product-detail/components/tire/hero/size-picker.tsx` (~168-186 load/speed legend copy).
- [ ] Failing test: pure `isSpecialOrder(invOrderType)` → `"SO"`→true, `"ST"`/`"N2"`/undefined→false; and a pure `leadTimeLine(availability, isSpecialOrder)` → the SO "special order — extended lead time" copy when SO, the normal `SHIP_LEAD_TIME` line when in_stock, nothing when out_of_stock.
- [ ] RED → implement: extract `vendor_inv_order_type` from the variant metadata (already arriving — sibling keys like `load_rating_lb` are already read from the same blob) into `isSpecialOrder`; render the lead-time line in the purchase panel keyed to the SELECTED variant's availability + SO flag (out of the hover tooltip). Add a static load/speed legend beside the tire "Load index 118S" stat ("118 = load index, S = speed rating"). Copy in `pdp-config.ts`.
- [ ] GREEN vitest; `tsc`; `next build`; `next lint`. Live: the CTA area shows lead time on touch (not just hover); an `SO` variant shows the special-order warning; the tire legend renders. Commit `feat(WB-098): lead-time + special-order signal at the CTA, tire load/speed legend`.

---

### Task 5: chunk review
- [ ] `scripts/review-package <base> HEAD` → a **sonnet** reviewer (mechanical surfacing chunk). Focus: (a) the backspacing formula + its rounding are correct and the two consumers now render it; (b) set-price shows only at qty>1 and never on a price-less variant; (c) `+variants.sku` didn't break the PDP query and the JSON-LD sku is the real one not the variantId; (d) `isSpecialOrder` only fires on `SO`; the lead-time line is keyed to the SELECTED variant's availability (not stale); (e) tire twins actually got each change (not wheel-only); (f) all new pure helpers are in plain modules (not `"use server"`), tsc at/below baseline.
