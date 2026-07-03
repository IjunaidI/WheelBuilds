# Home Tire Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one home-page section — a live "Shop Tires" rail of the newest 6 tires, placed right after "New This Week" — so the landing page signals that Wheel Builds sells tires.

**Architecture:** A thin throw-safe data helper (`getHomeTires`) wraps the existing live tire adapter `getTireDiscoveryProducts`; a server-component section (`ShopTiresRow`) mirrors the wheels rail `new-drops-row` and renders the existing `TireProductCard`; the home page imports it and renders it after `<NewDropsRow />`. No new client boundary, no new tests (no branching logic), no backend change.

**Tech Stack:** Next.js 15 (App Router, React 19) storefront, TypeScript, the `modules/tire-discovery` Meilisearch surface (WB-005) + its WB-063 `TireFitBadge`.

## Global Constraints

- No `wb-` / `WB` / `wheelbuilds-` prefix on any dir, file, export, or CSS class (Wheel Builds is implied). New identifiers: dir `shop-tires-row/`, helper `get-home-tires.ts`, export `getHomeTires`, component `ShopTiresRow`.
- Storefront default = **server components**; promote to `"use client"` only for local state / browser APIs / event handlers / client-store subscriptions. `ShopTiresRow` needs none → server component.
- Reuse the existing tire surface — do NOT add a new Meili facet, query path, or card. Consume `getTireDiscoveryProducts`, `EMPTY_TIRE_FILTERS`, and `TireProductCard` as-is.
- Section visual parity with `new-drops-row`: same section padding `px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-[120px] small:pb-20` and same grid `grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4`.
- Degrade-to-null: the section renders `null` when there are no tires (never an empty shell) — mirrors every other home section.
- Storefront build ignores TS/lint errors (`next.config.js`), so the gate is `npx tsc --noEmit` (no NEW errors beyond the ~14-error storefront baseline) + `next build` compiling `/`. Aliases: `@modules/*`, `@lib/*` (NOT `@/`) for these files.
- Commit trailer, own line at end of each commit message: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Shop Tires home rail (data helper + section + wire-in)

**Files:**
- Create: `storefront/src/modules/home/data/get-home-tires.ts`
- Create: `storefront/src/modules/home/components/shop-tires-row/index.tsx`
- Modify: `storefront/src/app/[countryCode]/(main)/page.tsx`

**Interfaces:**
- Consumes (all existing, verified):
  - `getTireDiscoveryProducts(query: TireDiscoveryQuery): Promise<TireDiscoveryResult>` from `@modules/tire-discovery/data/get-tire-products` — throw-safe (returns an empty result on Meilisearch failure). `TireDiscoveryResult` has `products: TireDiscoveryProduct[]`.
  - `TireDiscoveryQuery = { filters: TireDiscoveryFilters; sort: SortOption; page: number; q?: string; vehicleTireSizes?: string[] }`; `SortOption` includes `"newest"`.
  - `EMPTY_TIRE_FILTERS: TireDiscoveryFilters` and type `TireDiscoveryProduct` from `@modules/tire-discovery/data/types`.
  - `TireProductCard` (default export) from `@modules/tire-discovery/components/grid/tire-product-card` — props `{ product: TireDiscoveryProduct }`; it is a server component that internally renders the client `TireFitBadge` island.
  - `SectionHeader` (default, `@modules/common/components/section-header`) props include `counter`, `title`, `description`, `action`; `MicroLink` (default, `@modules/common/components/micro-link`) props include `href`.
- Produces: `getHomeTires(limit?: number): Promise<TireDiscoveryProduct[]>`; default-export `ShopTiresRow` (async server component).

- [ ] **Step 1: Create the data helper**

`storefront/src/modules/home/data/get-home-tires.ts`:

```ts
import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { EMPTY_TIRE_FILTERS } from "@modules/tire-discovery/data/types"
import type { TireDiscoveryProduct } from "@modules/tire-discovery/data/types"

/**
 * The newest N tires for the home "Shop Tires" rail. Throw-safe: the tire
 * adapter swallows Meilisearch failures and returns an empty result, so this
 * degrades to [] and the rail renders nothing.
 */
export async function getHomeTires(limit = 6): Promise<TireDiscoveryProduct[]> {
  const { products } = await getTireDiscoveryProducts({
    filters: EMPTY_TIRE_FILTERS,
    sort: "newest",
    page: 1,
  })
  return products.slice(0, limit)
}
```

- [ ] **Step 2: Create the section component**

`storefront/src/modules/home/components/shop-tires-row/index.tsx`:

```tsx
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import TireProductCard from "@modules/tire-discovery/components/grid/tire-product-card"
import { getHomeTires } from "@modules/home/data/get-home-tires"

const ShopTiresRow = async () => {
  const tires = await getHomeTires(6)
  if (tires.length === 0) return null

  return (
    <section className="px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-[120px] small:pb-20">
      <SectionHeader
        counter="09"
        title="Shop Tires"
        description="Grip that matches the build — tires for every fitment."
        action={<MicroLink href="/tires">View all tires</MicroLink>}
      />
      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
        {tires.map((t) => (
          <TireProductCard key={t.id} product={t} />
        ))}
      </div>
    </section>
  )
}

export default ShopTiresRow
```

Notes for the implementer:
- `counter="09"` is a decorative section number (the wheels rail uses `"08"`); it is NOT a computed index — hardcode it.
- `MicroLink` prepends the country code via `LocalizedClientLink` internally, so pass the bare path `/tires` (no `${countryCode}`).
- Do not add `"use client"` — this is an async server component.

- [ ] **Step 3: Wire the section into the home page**

Modify `storefront/src/app/[countryCode]/(main)/page.tsx`: add the import alongside the other section imports, and render `<ShopTiresRow />` immediately after `<NewDropsRow />`.

Import to add (place next to `import NewDropsRow ...`):

```tsx
import ShopTiresRow from "@modules/home/components/shop-tires-row"
```

In the returned JSX, the section list becomes (only the one new line is added — everything else unchanged):

```tsx
      <Hero brandCount={brandCount} />
      <NewDropsRow />
      <ShopTiresRow />
      <ShopByStyle />
      <FeaturedBlocks />
      <ShopByBrand />
      <CatalogWall />
      <TrustStrip brandCount={brandCount} />
      <Newsletter />
```

Do NOT touch `generateMetadata`, `getHomeCatalog`, or any other section.

- [ ] **Step 4: Type-check**

Run: `cd storefront && npx tsc --noEmit 2>&1 | grep -iE "shop-tires-row|get-home-tires|\(main\)/page" || echo "no new errors in the touched files"`
Expected: `no new errors in the touched files`. (The storefront has a ~14-error pre-existing baseline in `lib/data/*` and a couple of `modules/*` files — those are unrelated SDK drift; only NEW errors in the three touched files are a failure.)

- [ ] **Step 5: Verify the home route compiles**

Run: `cd storefront && npx next build 2>&1 | grep -E "^\s*(✓|ƒ|○).*\s/\b|Compiled|Failed to compile" | head -20`
Expected: the build compiles the app; `/` is emitted. (NOTE: a full `next build` in this repo can be env-blocked by a PRE-EXISTING backend-dependent `generateStaticParams` in `collections/[handle]` + `categories/[...category]` — that is NOT a regression from this task. If the build fails ONLY there, confirm via `git stash` A/B that `/` and the home sections compile, and record that in the report. If the build reaches the "Collecting page data"/"Generating static pages" phase without a NEW error mentioning `home`, `shop-tires-row`, or `/` [the home route], the task's surface is good.)

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/home/data/get-home-tires.ts storefront/src/modules/home/components/shop-tires-row/index.tsx "storefront/src/app/[countryCode]/(main)/page.tsx"
git commit -m "feat(home): live Shop Tires rail after New This Week (WB-064)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** the spec's three changes map 1:1 to Task 1's three files — data helper (§Architecture 1), section (§Architecture 2), wire-in (§Architecture 3). Degrade-to-null (§Error handling) is the `if (tires.length === 0) return null` guard. No-test decision (§Testing) is honored — the gate is tsc + build, no unit test.
- **Type consistency:** `getHomeTires(limit = 6)` is called as `getHomeTires(6)`; `TireProductCard` prop is `product: TireDiscoveryProduct` (verified in source); `getTireDiscoveryProducts` returns `{ products: TireDiscoveryProduct[] }` (verified); `sort: "newest"` is a valid `SortOption` (verified). All consumed names exist today.
- **Out of scope (spec):** no promo banner, no fit-filtering the rail, no hero/trust/metadata copy change, no curated tire-handles env list.
- **Docs after execution:** add WB-064 to `docs/future/BACKLOG.md` (status done) and note the new Home section in `docs/STATUS.md`'s Home pillar + "Last verified" date; move this plan + the spec from `docs/in-progress/` → `docs/done/`; run `/doc-review`. (Fold into the task's commit or a follow-up docs commit.)
