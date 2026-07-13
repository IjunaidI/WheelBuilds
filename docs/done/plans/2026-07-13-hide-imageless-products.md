# Hide products with no image, everywhere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A product with no image (`thumbnail` null/empty/whitespace) is invisible on every storefront surface — Discovery, home blocks, related rows, and its own PDP (which 404s).

**Architecture:** Enforce at the source. The backend Meilisearch transformer skips image-less products so they never enter the index (Discovery / tire discovery / all Meili-backed home sections drop them with exact facet counts + pagination); `medusa-config.js`'s stub fallback is hardened so a skipped product can't reappear as a matching `product_type` stub; a one-time re-index purges any already-indexed image-less docs. The three Store-API-fed surfaces the index doesn't cover (PDP, related products, curated Featured Blocks) get one-line `hasImage` guards.

**Tech Stack:** MedusaJS 2.13.6 backend (jest via `pnpm test:sync`), Next.js 15 storefront (vitest via `pnpm test:unit`), `@rokmohar/medusa-plugin-meilisearch`.

## Global Constraints

- **Definition of "no image":** `hasImage(thumbnail)` = `typeof thumbnail === "string" && thumbnail.trim().length > 0`. `thumbnail` is the sole signal (not the `images[]` gallery).
- **Twin predicate:** `hasImage` exists once per app (`backend/.../search/has-image.ts` and `storefront/src/lib/util/has-image.ts`); they must stay logically identical. Each carries a one-line comment pointing at the other.
- **No `wb-` prefix** on any identifier, file, or class (project rule).
- **Non-destructive:** no product is deleted or unpublished in Medusa. This is a read/display-visibility change only.
- **Price-unit convention unchanged:** dollars in Medusa, integer cents in the Meili index — do not touch price fields.
- **Path aliases:** backend uses bare `src/*` (`import x from "lib/..."`), storefront uses `@lib/*` / `@modules/*`. Don't use `@/` in the backend.

---

### Task 1: Backend `hasImage` predicate + transformer image gate + stub-fallback hardening

**Files:**
- Create: `backend/src/modules/vendor-sync/search/has-image.ts`
- Modify: `backend/src/modules/vendor-sync/search/build-search-document.ts` (add import + guard at top of `buildSearchDocument`)
- Modify: `backend/medusa-config.js` (transformer coalesce fallback → always `product_type: 'non-wheel'`)
- Test: `backend/src/modules/vendor-sync/__tests__/has-image.test.ts` (new)
- Test: `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts` (add cases + repair 3 thumbnail-less fixtures)

**Interfaces:**
- Produces: `hasImage(thumbnail?: string | null): boolean` (exported from `search/has-image.ts`).
- Consumes: existing `buildSearchDocument(product: IndexableProduct)` — `IndexableProduct` already declares `thumbnail?: string | null`.

- [ ] **Step 1: Write the failing `hasImage` test**

Create `backend/src/modules/vendor-sync/__tests__/has-image.test.ts`:

```ts
import { hasImage } from "../search/has-image"

describe("hasImage", () => {
  it("is false for null / undefined / empty / whitespace", () => {
    expect(hasImage(null)).toBe(false)
    expect(hasImage(undefined)).toBe(false)
    expect(hasImage("")).toBe(false)
    expect(hasImage("   ")).toBe(false)
  })
  it("is true for a real url", () => {
    expect(hasImage("https://cdn.example.com/x.jpg")).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd backend && pnpm exec jest src/modules/vendor-sync/__tests__/has-image.test.ts`
Expected: FAIL — cannot find module `../search/has-image`.

- [ ] **Step 3: Implement `has-image.ts`**

Create `backend/src/modules/vendor-sync/search/has-image.ts`:

```ts
/**
 * True when a Medusa product carries a usable image (thumbnail). The storefront
 * twin lives at storefront/src/lib/util/has-image.ts — keep them equivalent.
 */
export function hasImage(thumbnail?: string | null): boolean {
  return typeof thumbnail === "string" && thumbnail.trim().length > 0
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd backend && pnpm exec jest src/modules/vendor-sync/__tests__/has-image.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add transformer image-gate cases AND repair the 3 thumbnail-less fixtures**

In `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`:

(a) Add a `thumbnail` to the THREE fixtures that currently omit it (otherwise the new gate makes them return `null` and their existing assertions break — these tests are about variant metadata / fit_specs / finish union, NOT the image gate):
- the `prod_t2` tire fixture in *"emits per-variant fit_specs…"* → add `thumbnail: "https://cdn.example.com/t2.jpg",`
- the `sparse` fixture in *"survives missing variant metadata…"* → add `thumbnail: "https://cdn.example.com/sparse.jpg",`
- the inline product in *"emits the normalized union of variant finishes"* → add `thumbnail: "https://cdn.example.com/p.jpg",`

(b) Add these new cases inside the top-level `describe("buildSearchDocument", …)`:

```ts
it("returns null (hidden) for an image-less WHEEL", () => {
  expect(buildSearchDocument({ ...product, thumbnail: null } as any)).toBeNull()
  expect(buildSearchDocument({ ...product, thumbnail: "" } as any)).toBeNull()
  expect(buildSearchDocument({ ...product, thumbnail: "   " } as any)).toBeNull()
})

it("returns null (hidden) for an image-less TIRE", () => {
  const tire = {
    id: "t", handle: "t", title: "t",
    metadata: { product_type: "tire", brand: "Falken" },
    variants: [{ sku: "s", prices: [], metadata: { canonical_size: "305/45R22" } }],
  }
  expect(buildSearchDocument({ ...tire, thumbnail: null } as any)).toBeNull()
})

it("still indexes a wheel that HAS a thumbnail", () => {
  expect(buildSearchDocument(product as any)).not.toBeNull()
})
```

- [ ] **Step 6: Run the transformer test — verify the new cases fail (gate not built yet)**

Run: `cd backend && pnpm exec jest src/modules/vendor-sync/__tests__/build-search-document.test.ts`
Expected: FAIL — the two "returns null" cases still get a full doc; the 3 repaired fixtures pass again.

- [ ] **Step 7: Add the gate to `build-search-document.ts`**

Add the import near the top (with the other relative imports):

```ts
import { hasImage } from "./has-image"
```

Add the guard as the FIRST line of `buildSearchDocument` (before reading `meta` / dispatching):

```ts
export function buildSearchDocument(product: IndexableProduct) {
  // No image → not shown anywhere. Returning null routes through the
  // medusa-config stub fallback (forced to product_type:'non-wheel'), so it
  // matches no wheel/tire discovery filter. (WB-084)
  if (!hasImage(product.thumbnail)) return null
  const meta = product.metadata ?? {}
  if (meta.product_type === "wheel") return buildWheelDocument(product, meta)
  if (meta.product_type === "tire") return buildTireDocument(product, meta)
  return null
}
```

- [ ] **Step 8: Run the transformer test — verify all pass**

Run: `cd backend && pnpm exec jest src/modules/vendor-sync/__tests__/build-search-document.test.ts`
Expected: PASS (all cases, incl. the 3 repaired fixtures + 3 new).

- [ ] **Step 9: Harden the `medusa-config.js` stub fallback**

An image-less **wheel** has `metadata.product_type === "wheel"`, so the current fallback `product?.metadata?.product_type || 'non-wheel'` would re-index it as a *matching* `{id, product_type:"wheel"}` stub — defeating the gate. Force the stub to a non-matching constant.

In `backend/medusa-config.js`, change the transformer from:

```js
            transformer: (product) =>
              buildSearchDocument(product) ?? {
                id: product.id,
                product_type: product?.metadata?.product_type || 'non-wheel',
              },
```

to:

```js
            // Anything buildSearchDocument skips (non-wheel/tire OR image-less —
            // WB-084) becomes a minimal stub whose product_type matches NO
            // discovery filter, so it is excluded from wheel + tire discovery.
            // Forced constant (not metadata.product_type) so an image-less WHEEL
            // can't slip back in as a product_type:"wheel" stub.
            transformer: (product) =>
              buildSearchDocument(product) ?? {
                id: product.id,
                product_type: 'non-wheel',
              },
```

(Config wiring isn't unit-tested; correctness is verified by Task 4's re-index + a manual Discovery check. Meili's `addDocuments` replaces by primary key, so a re-indexed image-less product's old wheel fields are fully overwritten by this stub.)

- [ ] **Step 10: Run the whole vendor-sync suite — verify green**

Run: `cd backend && pnpm test:sync`
Expected: PASS (no regressions).

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/vendor-sync/search/has-image.ts \
        backend/src/modules/vendor-sync/search/build-search-document.ts \
        backend/medusa-config.js \
        backend/src/modules/vendor-sync/__tests__/has-image.test.ts \
        backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts
git commit -m "feat(WB-084): skip image-less products in the Meili transformer + harden stub fallback"
```

---

### Task 2: Storefront `hasImage` twin util

**Files:**
- Create: `storefront/src/lib/util/has-image.ts`
- Test: `storefront/src/lib/util/has-image.test.ts` (new, vitest)

**Interfaces:**
- Produces: `hasImage(thumbnail?: string | null): boolean` (exported from `@lib/util/has-image`).

- [ ] **Step 1: Write the failing test**

Create `storefront/src/lib/util/has-image.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { hasImage } from "./has-image"

describe("hasImage", () => {
  it("is false for null / undefined / empty / whitespace", () => {
    expect(hasImage(null)).toBe(false)
    expect(hasImage(undefined)).toBe(false)
    expect(hasImage("")).toBe(false)
    expect(hasImage("   ")).toBe(false)
  })
  it("is true for a real url", () => {
    expect(hasImage("https://cdn.example.com/x.jpg")).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd storefront && pnpm exec vitest run src/lib/util/has-image.test.ts`
Expected: FAIL — cannot resolve `./has-image`.

- [ ] **Step 3: Implement the util**

Create `storefront/src/lib/util/has-image.ts`:

```ts
/**
 * True when a product carries a usable image (thumbnail). Backend twin:
 * backend/src/modules/vendor-sync/search/has-image.ts — keep them equivalent.
 */
export function hasImage(thumbnail?: string | null): boolean {
  return typeof thumbnail === "string" && thumbnail.trim().length > 0
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd storefront && pnpm exec vitest run src/lib/util/has-image.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add storefront/src/lib/util/has-image.ts storefront/src/lib/util/has-image.test.ts
git commit -m "feat(WB-084): storefront hasImage twin predicate"
```

---

### Task 3: Storefront Store-API image guards (PDP 404 + related + featured)

**Files:**
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (import `hasImage`; PDP 404 guard in `getProductDetail`; filter in `getRelatedProducts`)
- Modify: `storefront/src/modules/home/data/get-featured.ts` (import `hasImage`; filter curated products)
- Test: `storefront/src/modules/product-detail/data/get-product.test.ts` (extend — add `getProductDetail` image-gate describe)

**Interfaces:**
- Consumes: `hasImage` from `@lib/util/has-image` (Task 2); existing `getRegion`, `getProductByHandle`, `notFound`, `getFitmentByProduct`.

- [ ] **Step 1: Write the failing `getProductDetail` 404 test**

Append to `storefront/src/modules/product-detail/data/get-product.test.ts`. Put the `vi.mock` calls at the TOP of the file (vitest hoists them), then add the new describe block:

```ts
import { vi } from "vitest"
import { getProductDetail } from "./get-product"

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))
vi.mock("@lib/data/regions", () => ({ getRegion: vi.fn(async () => ({ id: "reg_1" })) }))
vi.mock("@lib/data/products", () => ({
  getProductByHandle: vi.fn(),
  getProductsList: vi.fn(),
}))
vi.mock("@lib/data/fitment", () => ({
  getFitmentByProduct: vi.fn(async () => []),
  getFitmentByTireProduct: vi.fn(async () => []),
}))

import { getProductByHandle } from "@lib/data/products"

describe("getProductDetail — WB-084 image gate", () => {
  it("404s (notFound) a product with no thumbnail", async () => {
    ;(getProductByHandle as any).mockResolvedValueOnce({
      id: "p1", handle: "p1", title: "No Image Wheel",
      thumbnail: null, metadata: { brand: "B" }, variants: [],
    })
    await expect(getProductDetail("p1", "us")).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("does NOT 404 a product that has a thumbnail", async () => {
    ;(getProductByHandle as any).mockResolvedValueOnce({
      id: "p2", handle: "p2", title: "Real Wheel",
      thumbnail: "https://cdn.example.com/x.jpg", metadata: { brand: "B" }, variants: [],
    })
    await expect(getProductDetail("p2", "us")).resolves.toMatchObject({ id: "p2" })
  })
})
```

- [ ] **Step 2: Run it — verify the 404 case fails**

Run: `cd storefront && pnpm exec vitest run src/modules/product-detail/data/get-product.test.ts`
Expected: FAIL — the "404s a product with no thumbnail" case does NOT throw (guard not added yet). The existing `toRelatedProduct` tests still pass.

- [ ] **Step 3: Add the PDP guard + related filter in `get-product.ts`**

Add the import (with the other `@lib` imports near the top):

```ts
import { hasImage } from "@lib/util/has-image"
```

In `getProductDetail`, add the guard immediately after `if (!product) notFound()` and BEFORE the tire branch:

```ts
  const product = await getProductByHandle(handle, region.id)
  if (!product) notFound()
  // No image → not shown anywhere, including a direct PDP link. Covers wheel
  // AND tire PDP (this precedes the tire branch below). (WB-084)
  if (!hasImage(product.thumbnail)) notFound()
```

In `getRelatedProducts`, add `hasImage` to the existing filter:

```ts
  return response.products
    .filter((p) => p.handle !== product.handle && hasImage(p.thumbnail))
    .slice(0, 6)
    .map(toRelatedProduct)
```

- [ ] **Step 4: Add the curated filter in `get-featured.ts`**

Add the import:

```ts
import { hasImage } from "@lib/util/has-image"
```

In `getFeaturedProducts`, tighten the curated type-guard filter:

```ts
      curated = fetched
        .filter((p): p is HttpTypes.StoreProduct => Boolean(p) && hasImage(p.thumbnail))
        .map(toFeatured)
```

(The Meili fallback path is already gated by Task 1's transformer, so no extra guard there. Related **tires** read through `getTireDiscoveryProducts` (Meili) — also already gated.)

- [ ] **Step 5: Run the test — verify all pass**

Run: `cd storefront && pnpm exec vitest run src/modules/product-detail/data/get-product.test.ts`
Expected: PASS (existing `toRelatedProduct` cases + both new `getProductDetail` cases).

> Note: the `getRelatedProducts` and `getFeaturedProducts` filters are one-line `.filter(…hasImage(p.thumbnail))` applications of the already-unit-tested `hasImage`; they are intentionally not given their own heavily-mocked tests (would require mocking `getProductsList`/`getRegion`/collection lookups for near-zero added assurance). The `hasImage` unit test (Task 2) + the PDP 404 test cover the behavior.

- [ ] **Step 6: Full storefront unit suite — verify no regressions**

Run: `cd storefront && pnpm test:unit`
Expected: PASS (same baseline as before + the new tests).

- [ ] **Step 7: Commit**

```bash
git add storefront/src/modules/product-detail/data/get-product.ts \
        storefront/src/modules/product-detail/data/get-product.test.ts \
        storefront/src/modules/home/data/get-featured.ts
git commit -m "feat(WB-084): 404 image-less PDPs; drop image-less related + featured cards"
```

---

### Task 4: One-time re-index script (purge already-indexed image-less docs)

**Files:**
- Create: `backend/src/scripts/reindex-search-products.ts`

**Interfaces:**
- Consumes: the Medusa global container (`ExecArgs`), `Modules.PRODUCT`, `Modules.EVENT_BUS`. Mirrors the `product.updated` re-index emit already used in `pipeline/apply.ts:279-283`.

- [ ] **Step 1: Write the script**

Create `backend/src/scripts/reindex-search-products.ts`:

```ts
import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * One-time (or ad-hoc) re-index: emit product.updated for every product so the
 * Meilisearch plugin re-runs the transformer. After WB-084 this re-materializes
 * any already-indexed IMAGE-LESS product as the non-matching stub, hiding it
 * from wheel + tire discovery. Safe to re-run; idempotent.
 *
 * Run: pnpm exec medusa exec ./src/scripts/reindex-search-products.ts
 */
export default async function reindexSearchProducts({ container }: ExecArgs) {
  const productModule = container.resolve(Modules.PRODUCT)
  const eventBus = container.resolve(Modules.EVENT_BUS)
  const logger = container.resolve("logger")

  const pageSize = 200
  let offset = 0
  let emitted = 0

  for (;;) {
    const [products, count] = await productModule.listAndCountProducts(
      {},
      { select: ["id"], take: pageSize, skip: offset }
    )
    if (products.length === 0) break
    for (const p of products) {
      await eventBus.emit({ name: "product.updated", data: { id: p.id } })
    }
    emitted += products.length
    offset += pageSize
    logger.info(`[reindex-search-products] emitted product.updated for ${emitted}/${count}`)
    if (offset >= count) break
  }

  logger.info(`[reindex-search-products] done — ${emitted} products re-indexed`)
}
```

- [ ] **Step 2: Verify it compiles / dry-run against a dev DB**

Run (backend, with a Meili-configured `.env`): `cd backend && pnpm exec medusa exec ./src/scripts/reindex-search-products.ts`
Expected: logs `emitted product.updated for N/N` then `done — N products re-indexed`, no throw. (If run without Meili configured, the emit is a no-op for indexing but the script still completes — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/reindex-search-products.ts
git commit -m "feat(WB-084): add reindex-search-products ops script"
```

> **Production rollout (ops, not a code step):** after the backend deploy that carries Task 1, run this script once on Railway against the prod DB, then do a storefront rebuild for Task 2/3. Because vendor-sync already filters image-less rows at staging, the practical purge set is expected to be ~0 — this is a safety pass. Verify by loading `/store` and confirming no empty/broken cards; spot-check that a known image-less product's PDP 404s.

---

### Task 5: Docs — backlog, status, spec move, plan commit

**Files:**
- Modify: `docs/future/BACKLOG.md` (add the WB-084 item)
- Modify: `docs/STATUS.md` ("Last verified" date + a one-line note)
- Move: `docs/in-progress/specs/2026-07-13-hide-imageless-products-design.md` → `docs/done/specs/` (when merged)
- Move: `docs/in-progress/plans/2026-07-13-hide-imageless-products.md` → `docs/done/plans/` (when merged)

- [ ] **Step 1: Add the WB-084 backlog item**

Append under the appropriate severity section in `docs/future/BACKLOG.md`, using the item template:

```markdown
### WB-084 · Hide products with no image everywhere   [S]
- status: done
- area: backend/vendor-sync-search + storefront/pdp + storefront/home
- evidence: backend/src/modules/vendor-sync/search/build-search-document.ts (image gate) · storefront/src/modules/product-detail/data/get-product.ts (PDP 404)
- problem: an image-less product still appeared everywhere with a <Wheel> placeholder.
- fix: transformer skips image-less products (+ forced non-wheel stub); PDP 404s; related/featured filter by hasImage; one-time re-index purges existing.
- verify: an image-less product is absent from /store + home + related, and its PDP 404s; buildSearchDocument returns null for a thumbnail-less wheel/tire (unit).
- refs: done/specs/2026-07-13-hide-imageless-products-design.md · done/plans/2026-07-13-hide-imageless-products.md
```

- [ ] **Step 2: Update STATUS.md**

Set the "Last verified" date to the merge date and add a one-line note that image-less products are hidden storefront-wide (WB-084).

- [ ] **Step 3: Run /doc-review**

Run the `doc-review` skill; resolve any drift it flags (banned/stale tokens, evidence line mismatches).

- [ ] **Step 4: Move spec + plan to done/ and commit**

```bash
git mv docs/in-progress/specs/2026-07-13-hide-imageless-products-design.md docs/done/specs/
git mv docs/in-progress/plans/2026-07-13-hide-imageless-products.md docs/done/plans/
git add docs/future/BACKLOG.md docs/STATUS.md
git commit -m "docs(WB-084): backlog + status; move spec/plan to done"
```

---

## Self-Review

**Spec coverage:**
- §3.1 shared predicate → Task 1 (backend) + Task 2 (storefront). ✓
- §3.2 primary transformer gate → Task 1 (incl. the coalesce hardening the spec's §3.2 originally understated — corrected in the spec). ✓
- §3.3 re-index → Task 4. ✓
- §3.4 Store-API guards (PDP 404, related, featured; related-tires no-op) → Task 3. ✓
- §3.5 unchanged `<Wheel>` fallback + non-destructive → respected (no card edits; no deletes). ✓
- §4 testing → hasImage units (T1/T2), transformer null cases (T1), PDP 404 (T3). ✓
- §5 rollout order → Task 4 ops note + per-task commits. ✓

**Placeholder scan:** none — every code step shows full code; the one "no dedicated test" note is a stated testing decision, not a TODO.

**Type consistency:** `hasImage(thumbnail?: string | null): boolean` identical in both apps and at every call site (`getProductDetail`, `getRelatedProducts`, `getFeaturedProducts` curated filter, transformer gate). Re-index uses `listAndCountProducts` + `eventBus.emit({ name: "product.updated", data: { id } })` — matching the established `apply.ts` pattern.
