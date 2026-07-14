# WB-085 Site Chrome — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront-only; rebuild to deploy.
> Spec: [../specs/2026-07-14-wb-085-site-chrome-design.md](../specs/2026-07-14-wb-085-site-chrome-design.md).

**Goal:** Every chrome link resolves, no fabricated content, WB-branded not-found, retired-route redirects.

**Global constraints:** No `wb-` prefix on identifiers. WB primitives inside `.frame` (Display/Label/LocalizedClientLink). Server components by default; `"use client"` only for state/handlers. Storefront tests = `cd storefront && npx vitest run <path>` (Vitest); typecheck `npx tsc --noEmit` (5-error baseline, no new). `getHomeCatalog()` is `react.cache`+`unstable_cache`(60s) — reuse it, don't add new Meili calls.

---

### Task 1: Shared NAV_ITEMS + repoint + nav polish

**Files:** Create `storefront/src/modules/layout/components/nav-items.ts`; modify `nav/index.tsx` (remove local `NAV_ITEMS`, import; remove the heart "Saved" `LocalizedClientLink` at lines 59-66); modify `mobile-menu/index.tsx` (remove local `NAV_ITEMS`, import; drop the "Saved" entry from `ACCOUNT_ITEMS`; add a `<GaragePill/>` vehicle row at the top of the drawer nav that also closes the drawer on click). Test: `nav-items.test.ts`.

- [ ] **Step 1 — failing test** `storefront/src/modules/layout/components/nav-items.test.ts`:
```ts
import { NAV_ITEMS } from "./nav-items"
describe("NAV_ITEMS (WB-085)", () => {
  it("has no dead links (# or legacy /collections|/categories)", () => {
    for (const it of NAV_ITEMS) {
      expect(it.href).not.toBe("#")
      expect(it.href).not.toMatch(/^\/(collections|categories)\b/)
    }
  })
  it("drops Build Gallery + Deals; Support → /contact", () => {
    const labels = NAV_ITEMS.map((i) => i.label)
    expect(labels).not.toContain("Build Gallery")
    expect(labels).not.toContain("Deals")
    expect(NAV_ITEMS.find((i) => i.label === "Support")?.href).toBe("/contact")
  })
})
```
- [ ] **Step 2 — run RED** `cd storefront && npx vitest run src/modules/layout/components/nav-items.test.ts` → fails (module missing).
- [ ] **Step 3 — implement** `nav-items.ts`:
```ts
/** Shared primary-nav items (single source for desktop nav + mobile drawer). */
export const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Wheels", href: "/store" },
  { label: "Tires", href: "/tires" },
  // Interim: /collections + /categories 404 today. WB-099 adds dedicated
  // /brands + /styles landing pages; until then these open discovery.
  { label: "Brands", href: "/store" },
  { label: "Style", href: "/store" },
  { label: "Support", href: "/contact" },
]
```
Then: in `nav/index.tsx` delete the local `const NAV_ITEMS = [...]` (12-20), `import { NAV_ITEMS } from "@modules/layout/components/nav-items"`, and DELETE the second `<LocalizedClientLink href="/account" aria-label="Saved">…heart…</LocalizedClientLink>` block (59-66). In `mobile-menu/index.tsx` delete its local `NAV_ITEMS` (18-26) + import the shared one; remove `{ label: "Saved", href: "/account", icon: "heart" }` from `ACCOUNT_ITEMS`; and add a vehicle row above the `SHOP` label inside the `<nav>` — a `<GaragePill/>` (import from `@modules/layout/components/garage-pill`) wrapped so a tap closes the drawer, e.g. `<div className="mb-6" onClick={() => setOpen(false)}><GaragePill /></div>`.
- [ ] **Step 4 — run GREEN** same vitest → pass. `npx tsc --noEmit` no new errors.
- [ ] **Step 5 — commit** `git add` the 3 files + test; `feat(WB-085): shared NAV_ITEMS, repoint dead nav links, mobile vehicle row (N1/N2/N9/N10)` + Co-Authored-By trailer.

---

### Task 2: Footer real links + live brand count

**Files:** modify `footer/index.tsx`. Test: `footer.test.ts` (pure helper).

Footer is an `async` server component mounted in `(main)/layout.tsx` (every route). Reuse `getHomeCatalog()` (`@modules/home/data/get-home-catalog`) — shared cache hit.

- [ ] **Step 1 — failing test** for a pure `footerBrandLinks(brandFacet)` helper you'll add + export from `footer/index.tsx` (or a colocated `footer-links.ts`):
```ts
import { footerBrandLinks } from "./footer-links"
describe("footerBrandLinks (WB-085 N1/N8)", () => {
  it("returns top-N brands by count, as /store?brands= links, no fixtures", () => {
    const links = footerBrandLinks({ FUEL: 40, XD: 30, KMC: 10, PETROL: 5 }, 3)
    expect(links.map((l) => l.label)).toEqual(["FUEL", "XD", "KMC"])
    expect(links[0].href).toBe("/store?brands=FUEL")
  })
})
```
- [ ] **Step 2 — RED** `npx vitest run src/modules/layout/templates/footer/footer-links.test.ts`.
- [ ] **Step 3 — implement** create `footer/footer-links.ts` exporting `footerBrandLinks(brands: Record<string, number>, n = 5): {label:string; href:string}[]` (sort by count desc, take n, `href: \`/store?brands=${encodeURIComponent(label)}\``). In `footer/index.tsx`: (a) `const { facets } = await getHomeCatalog()`; (b) Shop column → real facet URLs: "All Wheels"→`/store`, "All Tires"→`/tires`, and the style presets from `shop-by-style/style-map` (`STYLE_DEFS`/`styleTiles(facets)`) for Off-Road/Luxury/Street/Truck (drop the `/collections`,`/categories` hrefs); (c) Brands column → `footerBrandLinks(facets.brands)` + an "All Brands"→`/store` entry (drop the 4 "…Type" fixtures); (d) replace the hardcoded "40+ premium aftermarket wheel brands" with the live count: `Authorized dealer for ${Object.keys(facets.brands).length}+ premium aftermarket wheel brands.`
- [ ] **Step 4 — GREEN** vitest pass; `tsc` clean; grep confirms no `Forgiato Type|Vossen Type|Method Type|Fuel Type` and no `/collections|/categories` in `footer/index.tsx`.
- [ ] **Step 5 — commit** `feat(WB-085): footer real facet+brand links, live brand count (N1/N8)`.

---

### Task 3: Real Trending + honest home sections

**Files:** modify `search/components/search-drawer/trending.tsx` (make it data-driven), its parent (pass real products), `home/components/catalog-wall/index.tsx`, `home/components/new-drops-row/index.tsx`. Test: `trending-data.test.ts` if a pure mapper is extracted; `catalog-wall` slice covered by a small pure test.

- [ ] **Step 1 — failing test** for the catalog-wall de-dupe slice — extract a pure `catalogWallTiles(newest, newDropsCount, spans)`:
```ts
import { catalogWallTiles } from "./tiles"
describe("catalogWallTiles (WB-085 N6)", () => {
  it("excludes the first newDropsCount products (no repeat with New Arrivals)", () => {
    const newest = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }) as any)
    const tiles = catalogWallTiles(newest, 6, 8)
    expect(tiles[0].id).toBe("p6")
    expect(tiles).toHaveLength(8)
  })
  it("degrades gracefully when catalog is short", () => {
    expect(catalogWallTiles(Array.from({length:9},(_,i)=>({id:`p${i}`}) as any), 6, 8)).toHaveLength(3)
  })
})
```
- [ ] **Step 2 — RED.**
- [ ] **Step 3 — implement** create `catalog-wall/tiles.ts` (`catalogWallTiles = (newest, newDropsCount, spans) => newest.slice(newDropsCount).slice(0, spans)`); wire `catalog-wall/index.tsx` to use it with `NEW_DROPS_COUNT = 6` (match `new-drops-row`'s `.slice(0,6)`) and `SPANS.length`. Rename the `new-drops-row` heading "New This Week" → "New Arrivals" (find the heading string). Rewrite `trending.tsx` to accept `products: {handle,brand,name,priceCents,finish?}[]` and render real tiles linking to `/products/<handle>`; delete the hardcoded `TRENDING` array; its parent passes `getHomeCatalog().newestProducts.slice(0,3)` mapped to the props (or the drawer fetches via a server boundary — match the existing search-drawer data pattern); render nothing when empty.
- [ ] **Step 4 — GREEN** vitest pass; grep: no `BLACKLINE|VANGUARD|ATLAS` in `search/`, no "New This Week" remaining.
- [ ] **Step 5 — commit** `feat(WB-085): real search-drawer trending + de-duped catalog wall + honest 'New Arrivals' (N3/N6/N11)`.

---

### Task 4: Not-found rebrand + retired-route redirects

**Files:** modify `app/not-found.tsx`, `app/[countryCode]/(main)/not-found.tsx`, `(main)/cart/not-found.tsx`, `(checkout)/not-found.tsx`; modify `next.config.js`. No unit test (routing/JSX) — verify by build + manual.

- [ ] **Step 1 — rebrand the 4 not-found pages** to WB primitives (`Display`/`Label` + `LocalizedClientLink`), replacing `@medusajs/ui`/`InteractiveLink`. The `(main)` one renders a search CTA + a `/store` link and (being inside the `(main)` group) already gets Nav/Footer chrome. Keep copy honest ("This page doesn't exist" / "Let's get you back to the build."). Match the WB visual (inside `.frame`).
- [ ] **Step 2 — redirects** in `next.config.js` add a `redirects()`:
```js
async redirects() {
  return [
    { source: "/:cc/results/:query*", destination: "/:cc/store?q=:query", permanent: true },
    { source: "/:cc/search", destination: "/:cc/store", permanent: true },
  ]
},
```
(Confirm `next.config.js` has no existing `redirects()`; if it does, merge.)
- [ ] **Step 3 — verify** `cd storefront && npx next build` (or `pnpm build:next`) exits 0; `npx tsc --noEmit` no new errors. Manually confirm the redirect rules parse (build validates them).
- [ ] **Step 4 — commit** `feat(WB-085): WB-branded not-found (4 pages) + retired-route redirects (X9)`.
