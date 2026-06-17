# PDP Add to Cart + Buy Now (WB-001) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PDP transact — Add to Cart creates a real Medusa cart line item for the selected variant, and Buy Now adds it then routes into checkout.

**Architecture:** Carry the Medusa `variant.id` (+ per-offset availability) onto `OffsetVariant`, resolve the selected variant in the hero via a small pure helper, and rewire the purchase panel's two commerce handlers to the existing `addToCart` server action. No new backend, no new dependency.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript, Medusa JS SDK (`@medusajs/types`), `sonner` toasts, Vitest.

**Spec:** [`docs/in-progress/specs/2026-06-17-pdp-add-to-cart-design.md`](../specs/2026-06-17-pdp-add-to-cart-design.md)

## Global Constraints

- **Branch:** all work on `feat/pdp-add-to-cart` (already checked out off `main`).
- **No `wb-` prefix** on any identifier, file, export, or class (project rule).
- **Price convention untouched:** add-to-cart sends `variant_id` only; no price math here. Dollars-in-Medusa / cents-in-index stays as-is.
- **Out of scope (do not touch):** bolt-pattern grid axis (WB-003), checkout step machine (WB-033), wishlist (`handleSave` stays toast), qty/low-stock de-hardcoding (WB-029).
- **Storefront has pre-existing `tsc` errors** in `lib/data/{customer,collections,onboarding,orders}.ts` and a few `modules/*` files (see `storefront/CLAUDE.md`). `npx tsc --noEmit` is NOT expected to be clean repo-wide — only assert the files this plan touches introduce no new errors.
- **Tests:** Vitest (`cd storefront && npx vitest run`). Colocated `*.test.ts` next to source (matches `modules/discovery/data/*.test.ts`).
- **Commit trailer:** every commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Shell:** POSIX sh (Git Bash tool), forward slashes.

---

### Task 1: Carry `variant.id` through the data model + a tested resolver

**Files:**
- Modify: `storefront/src/modules/product-detail/data/types.ts` (`OffsetVariant`)
- Create: `storefront/src/modules/product-detail/data/resolve-variant.ts`
- Create (test): `storefront/src/modules/product-detail/data/resolve-variant.test.ts`
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (`toSizeOptions`)

**Interfaces:**
- Produces: `OffsetVariant` now has `variantId: string` and `availability: "in_stock" | "low_stock" | "out_of_stock"`.
- Produces: `resolveSelectedVariant(size: SizeOption, offsetMm: number): OffsetVariant | null` — Task 2's hero consumes this.

- [ ] **Step 1: Confirm `OffsetVariant` has exactly one constructor**

Run: `cd e:/medusajs-2.0-for-railway-boilerplate && grep -rn "offsetVariants" storefront/src --include=*.ts --include=*.tsx | grep -v "\.test\."`
Expected: the only place that *builds* `OffsetVariant` objects is `get-product.ts → toSizeOptions` (two branches). Other hits only *read* `offsetVariants` (hero, advanced-fitment-panel). If any other constructor exists, it must also be updated in Step 6.

- [ ] **Step 2: Add `variantId` + `availability` to `OffsetVariant`**

In `storefront/src/modules/product-detail/data/types.ts`, extend the `OffsetVariant` type (add the two fields after `priceCents`):

```ts
  /** This offset's own price in cents. The hero shows this for the selected ET; falls back to the size-level price when absent. */
  priceCents?: number
  /** Medusa variant id for this exact size × offset. Drives the cart line item. */
  variantId: string
  /** Per-offset stock state — checked before add-to-cart so an out-of-stock ET hiding under an in-stock size cell can't be purchased. */
  availability: "in_stock" | "low_stock" | "out_of_stock"
```

- [ ] **Step 3: Write the failing test for `resolveSelectedVariant`**

Create `storefront/src/modules/product-detail/data/resolve-variant.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { resolveSelectedVariant } from "./resolve-variant"
import { SizeOption } from "./types"

const size: SizeOption = {
  diameter: 20,
  width: 9,
  offsetMm: 18,
  oemOffsetMm: 18,
  weightLb: 28,
  availability: "in_stock",
  offsetVariants: [
    { value: 18, backspaceIn: "", variantId: "var_oem", availability: "in_stock" },
    { value: 35, backspaceIn: "", variantId: "var_plus", availability: "low_stock" },
  ],
}

describe("resolveSelectedVariant", () => {
  it("returns the offset variant matching the selected ET", () => {
    expect(resolveSelectedVariant(size, 18)?.variantId).toBe("var_oem")
  })
  it("picks the correct sibling among multiple offsets", () => {
    expect(resolveSelectedVariant(size, 35)?.variantId).toBe("var_plus")
  })
  it("returns null when no offset matches", () => {
    expect(resolveSelectedVariant(size, 99)).toBeNull()
  })
  it("returns null when the size has no offsetVariants", () => {
    expect(resolveSelectedVariant({ ...size, offsetVariants: undefined }, 18)).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd e:/medusajs-2.0-for-railway-boilerplate/storefront && npx vitest run src/modules/product-detail/data/resolve-variant.test.ts`
Expected: FAIL — cannot resolve `./resolve-variant` (module does not exist yet).

- [ ] **Step 5: Implement `resolveSelectedVariant`**

Create `storefront/src/modules/product-detail/data/resolve-variant.ts`:

```ts
import { OffsetVariant, SizeOption } from "./types"

/**
 * Resolve the exact OffsetVariant the user has selected (size × offset).
 * Mirrors the match the hero uses for pricing; the returned variant's
 * `variantId` is what add-to-cart sends to Medusa. Returns null when the
 * size has no offsets or none match the selected ET.
 */
export function resolveSelectedVariant(
  size: SizeOption,
  offsetMm: number
): OffsetVariant | null {
  return size.offsetVariants?.find((o) => o.value === offsetMm) ?? null
}
```

- [ ] **Step 6: Populate `variantId` + `availability` in `toSizeOptions`**

In `storefront/src/modules/product-detail/data/get-product.ts`, the `toSizeOptions` loop builds `OffsetVariant`s in two branches. Add `variantId` + `availability` to both.

Existing-size branch — replace the `existing.offsetVariants = [...]` push:

```ts
      existing.offsetVariants = [
        ...(existing.offsetVariants ?? []),
        {
          value: offsetMm,
          backspaceIn: "",
          priceCents: priceCents > 0 ? priceCents : undefined,
          variantId: v.id,
          availability: availabilityOf(qty),
        },
      ]
```

New-size branch — replace the `offsetVariants: [...]` initializer:

```ts
        offsetVariants: [
          {
            value: offsetMm,
            backspaceIn: "",
            priceCents: priceCents > 0 ? priceCents : undefined,
            variantId: v.id,
            availability: availabilityOf(qty),
          },
        ],
```

(`v.id` is `string` on `HttpTypes.StoreProductVariant`; `qty` and `priceCents` are already computed just above in the loop.)

- [ ] **Step 7: Run the resolver test + full suite**

Run: `cd e:/medusajs-2.0-for-railway-boilerplate/storefront && npx vitest run`
Expected: PASS — 35 tests (31 prior + 4 new), all green.

- [ ] **Step 8: Commit**

```bash
cd e:/medusajs-2.0-for-railway-boilerplate
git add storefront/src/modules/product-detail/data/types.ts \
        storefront/src/modules/product-detail/data/resolve-variant.ts \
        storefront/src/modules/product-detail/data/resolve-variant.test.ts \
        storefront/src/modules/product-detail/data/get-product.ts
git commit -m "$(cat <<'EOF'
feat(pdp): carry Medusa variant.id + per-offset availability onto OffsetVariant (WB-001)

Adds variantId + availability to OffsetVariant, populates them in toSizeOptions,
and a tested pure resolveSelectedVariant(size, offsetMm) helper. No behavior change
yet — Task 2 wires the purchase panel to it.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire the hero + purchase panel to `addToCart` / Buy Now

**Files:**
- Modify: `storefront/src/modules/product-detail/components/hero/index.tsx`
- Modify: `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`

**Interfaces:**
- Consumes: `resolveSelectedVariant` (Task 1); `addToCart({ variantId, quantity, countryCode })` from `@lib/data/cart` (existing `"use server"` action).
- Produces: `<PurchasePanel>` gains a `selectedVariant: OffsetVariant | null` prop.

- [ ] **Step 1: Resolve the selected variant in the hero via the helper (DRY) and pass it down**

In `storefront/src/modules/product-detail/components/hero/index.tsx`:

Add the import (next to the existing type import):

```ts
import { ProductDetail, SizeOption } from "../../data/types"
import { resolveSelectedVariant } from "../../data/resolve-variant"
```

Replace the inline `currentOffset` line:

```ts
  const currentOffset =
    offsetVariants.find((o) => o.value === selectedOffsetMm) ?? null
```

with the helper call:

```ts
  const currentOffset = resolveSelectedVariant(selectedSize, selectedOffsetMm)
```

Pass it into `<PurchasePanel>` (add the prop):

```tsx
        <PurchasePanel
          product={product}
          selectedSize={selectedSize}
          unitPriceCents={unitPriceCents}
          selectedVariant={currentOffset}
        />
```

- [ ] **Step 2: Add the prop + import to the purchase panel**

In `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`, update imports and the props type:

```ts
import { addToCart } from "@lib/data/cart"
import { OffsetVariant, ProductDetail, SizeOption } from "../../data/types"
```

```ts
type PurchasePanelProps = {
  product: ProductDetail
  selectedSize: SizeOption
  /**
   * Computed unit price for the current (size) variant in cents. Falls back
   * to `product.priceCents` when no override on the size.
   */
  unitPriceCents: number
  /** The exact Medusa variant resolved from size × offset; null if unresolved. */
  selectedVariant: OffsetVariant | null
}
```

Destructure the new prop in the component signature:

```ts
const PurchasePanel = ({
  product,
  selectedSize,
  unitPriceCents,
  selectedVariant,
}: PurchasePanelProps) => {
```

- [ ] **Step 3: Replace the three toast-only handlers**

Still in `purchase-panel.tsx`, replace `handleAddToCart`, `handleBuyNow`, and `handleSave` (current lines 43-68) with:

```ts
  const canPurchase =
    !!selectedVariant && selectedVariant.availability !== "out_of_stock"

  const handleAddToCart = async () => {
    if (!selectedVariant) return
    setBuying(true)
    try {
      await addToCart({
        variantId: selectedVariant.variantId,
        quantity,
        countryCode,
      })
      toast.success("Added to cart", {
        description: `${quantity} × ${product.name} (${selectedSize.diameter}×${selectedSize.width})`,
      })
    } catch {
      toast.error("Couldn't add to cart", {
        description: "Please try again in a moment.",
      })
    } finally {
      setBuying(false)
    }
  }

  const handleBuyNow = async () => {
    if (!selectedVariant) return
    setBuying(true)
    try {
      await addToCart({
        variantId: selectedVariant.variantId,
        quantity,
        countryCode,
      })
      router.push(`/${countryCode}/checkout?step=address`)
      // Leave `buying` true through the navigation transition.
    } catch {
      toast.error("Couldn't start checkout", {
        description: "Please try again in a moment.",
      })
      setBuying(false)
    }
  }

  const handleSave = () => {
    // No wishlist backend yet (out of scope for WB-001). Keep the toast.
    toast(`Saved ${product.name}`, {
      description: "Find it in your account later.",
    })
  }
```

- [ ] **Step 4: Update the Add + Buy buttons to use `canPurchase`**

In the same file, the Add-to-cart `<Button>` currently keys its disabled/label off `selectedSize.availability === "out_of_stock"`. Replace those three references:

Add-to-cart button:

```tsx
        <Button
          onClick={handleAddToCart}
          disabled={!canPurchase || buying}
          className="flex-1"
          style={{ height: 56, fontSize: 14 }}
        >
          {!canPurchase
            ? "Out of stock"
            : `Add to cart · ${formatUsd(unitPriceCents * quantity)}`}
          {canPurchase && (
            <Icon name="arrow-right" size={16} color="white" />
          )}
        </Button>
```

Buy-now button:

```tsx
      <Button
        onClick={handleBuyNow}
        disabled={!canPurchase || buying}
        className="mt-3 w-full bg-[var(--ink)] text-white hover:bg-[var(--ink)]/90"
        style={{ height: 56, fontSize: 14 }}
      >
        Buy now · {formatUsd(unitPriceCents * quantity)}
        <Icon name="arrow-right" size={16} color="white" />
      </Button>
```

- [ ] **Step 5: Verify no regressions + no new type errors**

Run: `cd e:/medusajs-2.0-for-railway-boilerplate/storefront && npx vitest run`
Expected: PASS — 35 tests, green (no test depends on the panel; this confirms nothing broke).

Run: `cd e:/medusajs-2.0-for-railway-boilerplate/storefront && npx tsc --noEmit 2>&1 | grep -E "product-detail/(components/hero/(index|purchase-panel)|data/)" ; echo "exit:$?"`
Expected: `exit:1` (no matches) — the files this task touched produce no type errors. (Repo-wide pre-existing errors in `lib/data/*` etc. are expected and ignored.)

- [ ] **Step 6: Manual verification (storefront against the backend)**

Bring up the stack per [`RUN_LOCAL.md`](../../../RUN_LOCAL.md) (backend on :9000, then `cd storefront && pnpm dev`). Then:
1. Open a wheel PDP (e.g. from `/us/store`). Pick a size + offset.
2. Click **Add to cart** → success toast; the nav cart-count badge increments; `/us/cart` lists the line item with the right product + quantity.
3. Click **Buy now** → lands on `/us/checkout?step=address` with the item present (no empty-cart state).
4. Pick an out-of-stock size → Add + Buy are disabled and show "Out of stock".

Record the result (pass/fail per step) in the task notes.

- [ ] **Step 7: Commit**

```bash
cd e:/medusajs-2.0-for-railway-boilerplate
git add storefront/src/modules/product-detail/components/hero/index.tsx \
        storefront/src/modules/product-detail/components/hero/purchase-panel.tsx
git commit -m "$(cat <<'EOF'
feat(pdp): wire Add to Cart + Buy Now to the cart server action (WB-001)

PurchasePanel now calls addToCart({variantId, quantity, countryCode}) for the
resolved size × offset variant; Buy Now adds then routes to checkout?step=address.
Errors toast; out-of-stock / unresolved selections disable the buttons. Save stays
toast-only (no wishlist backend). Closes the toast-only commerce path.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Sync docs (WB-001 → done, STATUS, storefront CLAUDE.md)

**Files:**
- Modify: `docs/future/BACKLOG.md` (WB-001)
- Modify: `docs/STATUS.md` (PDP row + Last verified)
- Modify: `storefront/CLAUDE.md` (follow-up notes that say add-to-cart is toast-only)

**Interfaces:** none (docs only). Do this only after Task 2's manual verification passes.

- [ ] **Step 1: Flip WB-001 to done in the backlog**

In `docs/future/BACKLOG.md`, in the `### WB-001 · …` block, change:
- `- status: todo` → `- status: done`
- `- refs: —` → `- refs: done/specs/2026-06-17-pdp-add-to-cart-design.md · done/plans/2026-06-17-pdp-add-to-cart.md`

(The spec/plan land in `done/` when this branch merges; the link targets their post-merge home.)

- [ ] **Step 2: Update the STATUS PDP row + Last verified date**

In `docs/STATUS.md`:
- Bump the header `Last verified: 2026-06-17` to today's date (verified during execution).
- In the PDP pillar row, change the State cell from
  `Live price/stock, variant grid, vehicle band. Add-to-cart is toast-only; grid collapses bolt patterns; fitment=[].`
  to
  `Live price/stock, variant grid, vehicle band. Add-to-cart + Buy Now wired (WB-001 done); grid collapses bolt patterns; fitment=[].`
- In that row's "Open backlog" cell, drop `WB-001` from the list (leave WB-003, WB-009, WB-029, WB-030).
- Update the "Active work" / "Next up" line to point at the next backlog item (WB-002, authed-garage 404) rather than WB-001.

- [ ] **Step 3: Update storefront/CLAUDE.md stale "toast only" notes**

In `storefront/CLAUDE.md`:
- The "Engineering follow-up" bullet `Cart server-action wiring on PDP add-to-cart and wishlist (currently toast only).` → `Wishlist save on PDP is still toast-only (no backend); PDP add-to-cart + Buy Now are wired to the cart server action (WB-001).`
- In the PDP section's `TODO(integration) anchors` list, remove the `purchase-panel.tsx Add-to-cart → wire lib/data/cart.ts → addToCart` line (now done); keep the wishlist + fitment anchors.

- [ ] **Step 4: Run the doc-review fast checks**

Run:
```bash
cd e:/medusajs-2.0-for-railway-boilerplate
grep -rniE --exclude='*docs-reorg-and-drift-guard*' --exclude=STATUS.md --exclude=BACKLOG.md "teraflex|msrpUsd \* 100|VENDOR_WHEELPROS_(WHEELS|TIRES)_FEED_PATH" docs/ CLAUDE.md README.md ; echo "banned exit:$? (1=clean, or only annotated historical Teraflex-Nomad fixture)"
grep -n "WB-001" docs/future/BACKLOG.md docs/STATUS.md
```
Expected: banned-token scan clean except the known annotated `Teraflex Nomad` fixture mention; WB-001 shows `status: done` in BACKLOG and no longer in the STATUS PDP open-backlog cell.

- [ ] **Step 5: Commit**

```bash
cd e:/medusajs-2.0-for-railway-boilerplate
git add docs/future/BACKLOG.md docs/STATUS.md storefront/CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: close WB-001 (PDP add-to-cart wired) — backlog, STATUS, storefront CLAUDE.md

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Notes for the merge (handled by superpowers:finishing-a-development-branch)

- Move `docs/in-progress/specs/2026-06-17-pdp-add-to-cart-design.md` and
  `docs/in-progress/plans/2026-06-17-pdp-add-to-cart.md` → `docs/done/{specs,plans}/`
  (`git mv`) when the branch merges. Re-add `.gitkeep` to emptied `in-progress/` dirs.
- Do NOT move them mid-branch — they describe work in progress.

## Self-review (completed during planning)

- **Spec coverage:** data model (T1 S2), mapping (T1 S6), resolver + test (T1 S3-5),
  hero threading (T2 S1), panel rewire incl. Buy Now `?step=address` + error/disable
  handling (T2 S2-4), testing (T1 S7 unit + T2 S6 manual), docs sync incl. WB-001 →
  done (T3). Every spec goal + acceptance criterion maps to a step.
- **Placeholders:** none — every code step shows the exact code; every run step shows
  the exact command + expected result.
- **Type/name consistency:** `OffsetVariant.variantId`/`.availability`,
  `resolveSelectedVariant(size, offsetMm)`, the `selectedVariant` prop, and
  `addToCart({variantId, quantity, countryCode})` are spelled identically across
  T1 and T2.
