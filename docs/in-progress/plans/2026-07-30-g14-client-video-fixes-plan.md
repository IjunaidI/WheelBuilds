# G14 · Client video reports — plan (2026-07-30)

Three reports from client videos against the live site, all reproduced and root-caused
before planning. Backlog: **WB-124**, **WB-125**, **WB-126**.

---

## WB-124 · "In stock only" shows products whose sizes are out of stock

### Root cause — semantics, not stale data

`computeInStock` (backend) sets `in_stock = true` iff **at least one non-discontinued
variant** has `stocked − reserved > 0`. The shopper reads the filter as "the size I want
is available". Measured live 2026-07-30:

| Product | Buyable variants | In the filtered grid |
|---|---|---|
| `falken-sincera-sn250` (tyre) | **2 of 62 (3%)** | yes |
| `toyo-extensa-hp2` (tyre) | 10 of 62 (16%) | yes |
| `toyo-proxes-r888r` (tyre) | 8 of 55 (15%) | yes |
| `black-rhino-hard-alloys-utv-pkb` (wheel) | 1 of 21 (5%) | yes |

Worst on tyres, where **picking a size IS the interaction**. The PDP already defaults to a
purchasable variant, which is why it looks correct on landing and only fails when the
shopper selects the size they actually came for.

### Design (client's, 2026-07-30) — carry the filter into the PDP

Rather than change what `in_stock` means in the index, **carry the shopper's intent
through to the PDP and filter the variants there**, exactly as WB-060 already does for
fitment. This is the right call for three reasons:

1. **No re-index.** The PDP reads live per-variant stock from the Medusa Store API, so
   nothing about the search index changes — no backend deploy, no reconcile.
2. **It makes the grid honest retroactively.** "This product has something in stock" stops
   being a half-truth once clicking it lands you in a view showing *only* those variants.
3. **It composes with fitment for free.** A shopper with a vehicle who also wants in-stock
   gets "fits your car AND is in stock" — the client asked for exactly this.

### Existing machinery to reuse — do NOT build a parallel path

| Piece | Where | Reuse as |
|---|---|---|
| `?fit=1` on the grid link | `discovery/components/grid/product-card.tsx:53` | add `in_stock=1` alongside |
| `buildFitView(product, vehicle)` → trimmed `finishOptions`/`boltPatterns` | `product-detail/data/fit-view.ts:138` | a sibling stock trim, same shape |
| `useFilter = fitActive && !showAll` | `product-detail/components/hero/index.tsx:70-92` | extend the composition |
| `FitBanner` + "Show all" | `product-detail/components/hero/fit-banner.tsx` | the model for the stock banner |

`availability: "in_stock" | "low_stock" | "out_of_stock"` already exists on both
`sizeOptions` and `offsetVariants` (`product-detail/data/types.ts:32,60`) — the data
needed is present.

### Tasks

1. **Pure `trimToInStock(finishOptions)`** in `product-detail/data/stock-view.ts` — drops
   `out_of_stock` offset variants, then sizes left with none, then finishes left with no
   sizes. Returns the untrimmed input if trimming would empty it (never strand a shopper
   on a PDP with no selectable size). Unit-tested with a `low_stock` case, an
   all-out-of-stock case, and a mixed case.
2. **Compose in the hero.** Apply after the fit trim so both can be active:
   `fit → stock`. `showAll` clears both. Wheel and tyre heroes both.
3. **Banner copy** driven by which filters are on — one pure helper, unit-tested, since
   this is a claim about the catalog:
   - stock only → *"Showing only sizes in stock."*
   - fit only → existing FitBanner copy, unchanged
   - both → *"Showing only sizes that fit your {vehicle} and are in stock."*
   Each with a "Show all" escape, mirroring FitBanner.
4. **Grid link carries the intent** — `?in_stock=1` when the discovery in-stock toggle is
   on, combined with `fit=1` when both.
5. **Tyre PDP** gets the same treatment (its size list is the acute case).

### Explicitly NOT doing

- Changing `computeInStock` or the index. The grid filter's meaning stays "has ≥1 buyable
  variant" — which becomes honest once the PDP filters to those variants.
- A `low_stock` exclusion: low stock IS buyable, so it stays.

---

## WB-126 · Search cannot reach tyres

### Root cause — one line, two symptoms

`search-drawer/header.tsx:51` (and `recent-searches.tsx:39`) hard-code
`router.push(/${countryCode}/store?…)`, and `/store` is scoped to
`product_type = "wheel"` (`discovery/data/get-products.ts:60`).

Verified: **Falken is a tyre brand — 65 products, 0 wheels.** Unscoped search finds all
65; scoped to wheels it returns 0. The client is right that the product exists and search
cannot find it. The same line explains why searching from `/tires` bounces to wheels.

**Tyre discovery already reads `?q`** (`get-tire-products.ts:178`) — the capability
exists, the UI just never routes to it.

### Tasks

1. **Context-aware routing** — a pure `searchDestination(pathname, query)`: submitting
   from `/tires` (or a tyre PDP) stays on `/tires`; everywhere else goes to `/store`.
   Unit-tested.
2. **Cross-type fallback** — when the destination surface returns 0 results and the other
   type has matches, show a link: *"No wheels match 'falken' — 65 tyres do →"*. This is
   what actually rescues the reported case, since the shopper searched from the wheels
   page. Requires one extra count query for the other type, only on the zero-result path.
3. Leave relevance tuning alone (WB-122, still blocked on a repro). This is reachability,
   not ranking.

---

## WB-125 · Wishlist is fiction

### Root cause

`purchase-panel.tsx:202-207` (wheel) and `tire/hero/purchase-panel.tsx:197` (tyre):

```ts
const handleSave = () => {
  toast(`Saved ${product.name}`, { description: "Find it in your account later." })
}
```

**There is no wishlist anywhere** — no page, no route, no backend module, no account tab
(confirmed by search across both apps). So the toast is false for *logged-in* users too,
and it additionally sends guests to a login wall for a page that does not exist. The
client reported it as a guest bug; it is broader than that.

### Design (client's choice, 2026-07-30) — guest wishlist in the browser

localStorage-backed so it works with no account, mirroring `SingleVehicleGarage`
(`lib/garage/single-vehicle-garage.ts`) — an established pattern in this codebase for
exactly this problem, including its `useSyncExternalStore` hook shape
(`lib/stores/*`).

### Tasks

1. **`lib/wishlist/`** — a store over localStorage (`add`/`remove`/`toggle`/`has`/`list`),
   capped (100) and versioned, with a `useWishlist()` hook following the existing
   `lib/stores/` pattern. Pure core unit-tested; no direct `localStorage` reads elsewhere.
2. **Wire both PDPs** — the heart button toggles, reflects saved state, and the toast
   tells the truth (*"Saved to your wishlist"* / *"Removed"*), with **no claim about an
   account**.
3. **`/wishlist` page** — lists saved items, reusing `DiscoveryProductCard`, with an empty
   state. Linked from the toast and the nav.
4. **Honesty first:** even if 3 slips, the false "find it in your account later" copy must
   go in task 2 — that is the actual defect.

### Known limitation to state plainly

Browser-local: it does not follow the shopper to another device, and clearing site data
loses it. Account sync is a deliberate follow-up (**WB-127**), not a silent gap.

---

## Gate for all three

Storefront vitest green, tsc at the **2-error baseline**, `next build` clean. No backend
change, no migration, no Meilisearch reconcile for any of the three.
