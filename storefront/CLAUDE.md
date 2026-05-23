# CLAUDE.md — Storefront

Storefront-scoped guide. The repo-wide CLAUDE.md at the root covers backend, vendor-sync, env, and Railway specifics — read it for anything outside `storefront/`.

For visual / design rules, the canonical reference is [`DESIGN.md`](DESIGN.md). Read it before touching JSX, CSS, or any component that renders inside the design system.

## What this storefront is

A MedusaJS 2.x Next.js 15 (App Router, React 19) storefront for **Wheel Builds** — a wheels + tires e-commerce site. The current visual layer is a custom design (garage / blueprint aesthetic, surgical orange #FF6A00, Antonio display type) ported from a Claude Design handoff. The Medusa data layer underneath is unchanged from the boilerplate.

## Layout

```
storefront/src/
├── app/[countryCode]/
│   ├── (main)/           # everything except checkout — Nav, Footer, SearchMount, TooltipProvider, Toaster wrap children
│   │   ├── layout.tsx    # the single .frame wrapper + global providers live here
│   │   ├── page.tsx      # Home — composes the design's home sections
│   │   ├── store/        # catalog
│   │   ├── products/[handle]/
│   │   ├── categories/, collections/, cart/, account/, order/
│   │   └── results/[query]/  # search results route
│   └── (checkout)/       # separate layout for the checkout flow
├── components/ui/        # shadcn primitives (drawer, sheet, dialog, dropdown-menu, tooltip, sonner, command, button)
├── lib/
│   ├── garage/           # vehicle garage abstraction (swap-ready for Phase 2.2)
│   ├── stores/           # tiny client-side stores (search-open, recent-searches)
│   ├── data/             # Medusa API calls (cart, customer, orders, regions, products…)
│   ├── search-client.ts  # Meilisearch wrapper
│   ├── utils.ts          # cn() helper for shadcn / WB primitives
│   └── util/             # legacy util/ dir — env, money, etc.
├── modules/
│   ├── common/components/    # WB composed primitives: Label, Display, SectionHeader, MicroLink, Chip, VehicleTile,
│   │                         # Wheel, Icon, Logo, ImgPlaceholder, LocalizedClientLink
│   ├── home/components/      # home page sections
│   ├── layout/               # nav, footer, cart-button, cart-dropdown, garage-pill, side-menu (orphaned)
│   ├── search/               # search-drawer, search-mount, search-trigger, actions, results template
│   ├── products/, cart/, checkout/, account/, order/, categories/, collections/, store/
│   └── skeletons/
└── styles/
    ├── globals.css       # tailwind layer + shadcn token overrides (mapped to WB palette)
    └── wheel-builds.css  # design tokens + scoped utility classes (see DESIGN.md)
```

## The `.frame` wrapper rule

The new design uses a single root class `.frame` that scopes its CSS variables (`--orange`, `--ink`, `--hairline`, …) and class selectors (`.display`, `.label`, `.btn`, `.wheel`, …). It's applied **once** at [`app/[countryCode]/(main)/layout.tsx`](src/app/[countryCode]/(main)/layout.tsx). Do not re-apply `.frame` on children — they're already inside it.

`(checkout)` routes are intentionally outside `.frame`. If you ever need design tokens in checkout, either wrap that layout in `.frame` too, or hoist `.frame` to the top-level `app/layout.tsx`.

## Naming convention — no `wb-` prefix

The project name (Wheel Builds) is implied. **Never** use `wb-`, `WB`, or `wheelbuilds-` prefixes on component dirs, files, exports, or CSS classes. If a new identifier would collide with a generic name elsewhere (e.g. an existing `icon`), pick a more specific name (`inline-icon`, `product-icon`) — don't reintroduce the prefix.

Detail and examples: [memory/feedback_no_wb_prefix.md](../.claude/projects/e--medusajs-2-0-for-railway-boilerplate/memory/feedback_no_wb_prefix.md).

## Server vs client components

Default to **server components** for layouts, page templates, and anything that fetches Medusa data. Promote to `"use client"` only when you need:

- Local UI state (`useState`, `useReducer`, `useEffect`)
- Browser APIs (localStorage, window, document)
- Event handlers attached to DOM (`onClick`, `onChange`, …) on intrinsic elements
- A subscription to one of the client stores (`useGarage`, `useSearchOpen`, `useRecentSearches`)

Patterns established by this work:

- Server components compose pages and inject client "islands" where interaction is needed (e.g. [`Nav`](src/modules/layout/templates/nav/index.tsx) is a server component, but it includes [`<GaragePill />`](src/modules/layout/components/garage-pill/index.tsx) and [`<SearchTrigger />`](src/modules/search/components/search-trigger/index.tsx) which are client components).
- The home [`Hero`](src/modules/home/components/hero/index.tsx) is a client component because the vehicle tiles read from `useGarage()`; the other home sections are server components.
- Don't pass server data into a client component by serializing it through props if you can avoid it — fetch in the server parent and pass primitives.

## Data fetching

All Medusa API calls go through `lib/data/*`. Server components call those directly (they're async). Client components call them through Server Actions in `modules/<feature>/actions.ts`. Don't import the Medusa SDK directly from a component.

## Garage abstraction

`lib/garage/` defines a `GarageProvider` interface ([provider.ts](src/lib/garage/provider.ts)) and exports a singleton `garage` ([index.ts](src/lib/garage/index.ts)). Today the singleton is a `LocalStorageGarage` ([local-storage-garage.ts](src/lib/garage/local-storage-garage.ts)); when Phase 2.2 (customer-vehicle backend) lands, swap that one line to a `MedusaGarage` implementation. The `Vehicle` type already carries optional fitment fields so the type doesn't shift on swap.

Components read via the `useGarage()` hook ([use-garage.ts](src/lib/garage/use-garage.ts)). Don't read `localStorage` directly anywhere else.

The static Year/Make/Model lookup data is at [`vehicle-data.ts`](src/lib/garage/vehicle-data.ts) and gets replaced by the wheel-size.com dataset when Phase 2.1 lands.

## Client stores

Two tiny `useSyncExternalStore`-based stores live at `lib/stores/`:

- [`search-store.ts`](src/lib/stores/search-store.ts) — drawer open/closed. `openSearch()`, `closeSearch()`, `toggleSearch()`, `useSearchOpen()`.
- [`recent-searches.ts`](src/lib/stores/recent-searches.ts) — most-recent text queries (cap 10). `addRecentSearch(q)`, `clearRecentSearches()`, `useRecentSearches()`.

Same pattern (module-level state + emitter set + `useSyncExternalStore`). If you add another global piece of client UI state, follow this pattern rather than reaching for Context or Zustand — it stays zero-dependency.

## Search

- The drawer is mounted once in `(main)/layout.tsx` via [`<SearchMount />`](src/modules/search/components/search-mount/index.tsx). It wraps a [Vaul `<Drawer direction="right">`](src/components/ui/drawer.tsx) which owns Esc/overlay-click/drag-to-dismiss/scroll-lock/focus-trap/slide-animation. The only custom behavior left in SearchMount is the global `Cmd/Ctrl+K` opener.
- Triggers: the nav search icon ([`SearchTrigger`](src/modules/search/components/search-trigger/index.tsx)), the [`GaragePill`](src/modules/layout/components/garage-pill/index.tsx) in the nav, and the hero's vehicle tiles + "USE MY GARAGE" button.
- Submit → `/<countryCode>/results/<encoded query>` via the existing [`search()`](src/modules/search/actions.ts) Server Action and [`SearchResultsTemplate`](src/modules/search/templates/search-results-template/).
- The Year/Make/Model pane writes the new vehicle to the garage, sets it active, then routes to `/store`. Once Phase 2.1 lands, the destination becomes a fitment-filtered URL — change that one route in [`ymm-pane.tsx`](src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx) and [`garage-pane.tsx`](src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx).

## Fonts

Loaded via `next/font/google` in [`app/layout.tsx`](src/app/layout.tsx): Antonio (display), JetBrains Mono (technical labels), Inter (body). Each one exposes a CSS variable (`--font-antonio`, `--font-mono`, `--font-inter`) consumed by `wheel-builds.css`. Don't reach for raw Google Fonts `<link>` tags — go through `next/font` to avoid layout shift and to keep them self-hosted in build output.

## Routing — `[countryCode]` is mandatory

`src/middleware.ts` enforces a country code on every URL. Resolution order: Vercel IP header → `NEXT_PUBLIC_DEFAULT_REGION` → first region returned by the backend. In components:

- Server: get it from `params` (`{ params: Promise<{ countryCode: string }> }` in Next 15).
- Client: `const { countryCode } = useParams() as { countryCode: string }`.
- For links, use [`LocalizedClientLink`](src/modules/common/components/localized-client-link/index.tsx) — it prepends the country code automatically.
- For imperative `router.push(...)`, prepend it yourself: `router.push(`/${countryCode}/results/${encodeURIComponent(q)}`)`.

## Build + verification

- `next.config.js` has `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true`. Type and lint errors will **not** fail the build.
- Run `pnpm lint` and `npx tsc --noEmit` separately to catch them.
- Pre-existing TS errors live in `lib/data/customer.ts`, `lib/data/collections.ts`, `lib/data/onboarding.ts`, `lib/data/orders.ts`, `modules/order/templates/order-completed-template.tsx`, `modules/products/components/product-onboarding-cta/index.tsx`, `modules/products/components/related-products/index.tsx`. They're Medusa SDK type drift — don't try to "fix" them as part of unrelated work.
- A pre-existing eslint warning lives in `modules/checkout/components/shipping-address/index.tsx`. Same advice.
- Backend must be running for `pnpm dev` to unblock (the `await-backend` shim polls port 9000). For storefront-only iteration, use `pnpm build:next` to skip the wait.

## Tailwind

Three flavors of styling coexist now; pick by where you are:

- **Legacy Medusa modules** (cart, checkout, account, products, side-menu) use Tailwind utilities exclusively. Keep using them when extending those files — don't mix in WB classes.
- **shadcn primitives** in [src/components/ui/](src/components/ui) use Tailwind utilities that resolve to the WB palette via the shadcn token aliases in `tailwind.config.js` (`bg-primary`, `text-foreground`, `border-border`, …). Don't hand-edit these files.
- **WB composed primitives** ([src/modules/common/components/](src/modules/common/components/)) and **page sections** inside `.frame` should reach for:
  1. A WB composed primitive first (`<Display>`, `<Label>`, `<SectionHeader>`, `<MicroLink>`, `<Chip>`, `<VehicleTile>`).
  2. A shadcn primitive for behavior (`<Button>`, `<Drawer>`, `<Dialog>`, `<DropdownMenu>`, `<Tooltip>`, …).
  3. The scoped CSS classes in [wheel-builds.css](src/styles/wheel-builds.css) (`.frame .display`, `.frame .vehicle-tile`, `.frame .product-card`, …) for design tokens already named there.
  4. Inline `style={...}` or Tailwind utilities for genuinely one-off layout values (specific `gap`/`padding`/`maxWidth`).

The general direction: as the codebase converges on the primitives, inline-styled sections shrink and `wheel-builds.css` becomes the foundation rather than the surface. DESIGN.md owns the visual contract that these layers all implement.

## shadcn/ui primitives

shadcn is integrated as a **headless behavior layer** — we use Radix/Vaul/cmdk-based primitives (Drawer, Dialog, DropdownMenu, Tooltip, Sonner, Command, Sheet, Button) for accessibility, focus management, and motion, then skin them with the Wheel Builds palette so they read as part of the same design system.

- **Components dir:** [src/components/ui/](src/components/ui). Pulled in via `npx shadcn@2.1.8 add <component>`. We pin to 2.1.8 because newer shadcn defaults to Tailwind v4 which conflicts with our v3 + `@medusajs/ui-preset` setup.
- **Don't hand-edit `components/ui/*`** — they're meant to stay close to the canonical shadcn source so they can be re-pulled or upgraded. If something needs WB-specific behavior, build a wrapper in [modules/common/components/](src/modules/common/components/) (see next section) rather than editing the primitive in place.
- **What's wired today** (Jan 2026): Drawer (Vaul, owns the search panel), Sheet, Dialog, DropdownMenu, Tooltip, Sonner, Command, Button. Providers (`TooltipProvider`, `Toaster`) live in [(main)/layout.tsx](src/app/[countryCode]/(main)/layout.tsx).
- **Aliases:** `@/components`, `@/lib/utils`, `@/components/ui` — declared in [components.json](components.json) and resolved via the `@/*` path in [tsconfig.json](tsconfig.json). Existing `@lib/*` and `@modules/*` aliases are unchanged.
- **`cn()` helper:** [src/lib/utils.ts](src/lib/utils.ts). Imported freely from both shadcn primitives and WB composed primitives (`modules/common/components/*`).
- **Token mapping:** the shadcn CSS variables (`--background`, `--primary`, `--ring`, …) are redefined in [styles/globals.css](src/styles/globals.css) to use HSL components from the WB palette in DESIGN.md. So `bg-primary` is WB orange, `bg-secondary` is WB `--soft`, `border-border` is WB `--hairline`. Don't change shadcn token names — change the values they map to.
- **`pnpm` on Windows:** `npx shadcn add <x>` will fail at the "install deps" step because pnpm isn't on PATH. Workaround: run the dep install separately (`npx -y pnpm@9.10.0 add <radix-pkg>`) and either let `shadcn add` finish writing the component file, or write it manually.
- **`--muted` is shadcn's, `--ink-soft` is ours.** WB originally had a `--muted` token (`#8A8A8E`) but shadcn's tokens own that name. WB's was renamed to `--ink-soft` so both systems coexist inside `.frame`. If you're adding a new WB token, grep `globals.css` first for collisions.
- **Portals and `.frame`:** shadcn primitives that use a portal (Drawer, Sheet, Dialog, DropdownMenu, Tooltip, …) render at the body root, escaping the single `.frame` wrapper in `(main)/layout.tsx`. Their content classes already include `frame ` so WB tokens resolve. If you author a new portaled primitive in `components/ui/`, **add `frame` to the portal content's className** — DropdownMenu and Tooltip in this repo are the references.

## WB composed primitives

Sitting one layer above shadcn — and one layer below the page sections — are the WB-specific primitives in [src/modules/common/components/](src/modules/common/components/). They exist to keep recurring patterns from drifting apart visually, and to keep section files small. **If you find yourself writing the same `style={{ fontFamily: "var(--display)", fontSize: X, ... }}` block twice, the pattern probably belongs here.**

Current set:

- **[`Label`](src/modules/common/components/label/index.tsx)** — mono uppercase eyebrow text. Tones: `accent` (orange, default), `muted`, `ink`. Pass `bar` for an orange leading bar (hero / section eyebrows). Replaces ad-hoc `.label` / `.label-muted` plus inline mono/uppercase styles.
- **[`Display`](src/modules/common/components/display/index.tsx)** — Antonio display headline with `size` in pixels and tones `ink` / `orange` / `graphite` / `inherit`. Render-as via `as` (`h1`/`h2`/`span`/…). Replaces inline `<span className="display" style={{ fontSize: X, color: Y }}>`.
- **[`SectionHeader`](src/modules/common/components/section-header/index.tsx)** — the recurring "counter + title + description + action" row at the top of every home section. Pass only the slots you need; omitted ones collapse.
- **[`MicroLink`](src/modules/common/components/micro-link/index.tsx)** — the orange mono "VIEW ALL 08 →" / "BROWSE BRANDS →" link that ends sections. Country-scoped via `LocalizedClientLink` under the hood.
- **[`Chip`](src/modules/common/components/chip/index.tsx)** — the small pill used for popular searches, brand chips, build chips, fitment-OK tags. Variants `soft` / `accent` / `outline`. Renders as a button by default; pass `href` to render a country-scoped link instead.
- **[`VehicleTile`](src/modules/common/components/vehicle-tile/index.tsx)** — the big YMM tile used in the hero and the drawer's YMM pane. Sizes `lg` (hero, 110px tall) and `md` (drawer-inline).

Plus the existing [`Wheel`](src/modules/common/components/wheel/index.tsx), [`Icon`](src/modules/common/components/icon/index.tsx), [`Logo`](src/modules/common/components/logo/index.tsx), [`ImgPlaceholder`](src/modules/common/components/img-placeholder/index.tsx).

The pattern when extending: if a section needs interactive behavior (drawer, dropdown, popover, toast, modal) → reach into `@/components/ui/*`. If a section needs a visual pattern that more than one place uses (eyebrow label, display heading, section header, chip) → reach into `@modules/common/components/*`. Don't bake either layer into page-section code with inline styles unless the pattern is genuinely one-off.

## Gotchas

- **`SideMenu`** ([modules/layout/components/side-menu](src/modules/layout/components/side-menu/index.tsx)) is orphaned — the new nav doesn't import it. It still references `/search` which no longer exists. Harmless dead code. Don't extend it; either delete it or replace it with a new wheel-builds-styled mobile menu.
- **Cart dropdown's popover** still uses Headless UI inline-portal (not React Portal), so its contents stay inside `.frame` and the design CSS variables resolve. Replacement path when it's time: swap it for shadcn [`<DropdownMenu>`](src/components/ui/dropdown-menu.tsx) — that primitive's content className already includes `frame ` so it works inside a true portal. The HeadlessUI dropdown is still here only because no one has touched it yet.
- **Featured-products module** ([modules/home/components/featured-products](src/modules/home/components/featured-products)) is dead code (no longer imported by the home page). Delete it during a cleanup pass, not as part of feature work.
- **`(main)` layout's `.frame` applies to every page in the group**, including `/store`, `/cart`, `/products/[handle]`, etc. Those pages don't use the design classes, but they inherit `.frame`'s background (faint grid pattern on `#FAFAF8`) and base font size. If a future page needs a different chrome (e.g. a fully bleached PDP), wrap that page in a counter-class or move `.frame` to a per-page wrapper.
- **No mobile breakpoints on the home page yet** — sections use fixed pixel paddings (`80px 80px`) and grid template columns like `repeat(6, 1fr)`. The home is desktop-only until the next polish pass adds responsive rules.

## Adding new pages or sections

For a new home section:

1. Create `src/modules/home/components/<section-name>/index.tsx`.
2. Start with `<SectionHeader>` for the top row, then `<Display>` / `<Label>` / `<MicroLink>` / `<Chip>` for the inside. Reach for [`Wheel`](src/modules/common/components/wheel/index.tsx) / [`Icon`](src/modules/common/components/icon/index.tsx) / [`ImgPlaceholder`](src/modules/common/components/img-placeholder/index.tsx) for visuals.
3. Server component by default. Promote to `"use client"` only if the section reads from a client store (`useGarage`, `useSearchOpen`, …) or attaches event handlers.
4. Import it into [`app/[countryCode]/(main)/page.tsx`](src/app/[countryCode]/(main)/page.tsx) in the right order.

For a new top-level route inside the design:

1. Add the file under `src/app/[countryCode]/(main)/<route>/page.tsx`.
2. Server component; fetch from `lib/data/...`.
3. Render design-system markup from `src/modules/<feature>/components/...`, built from the primitives in `modules/common/components/`.
4. Section padding follows `DESIGN.md` conventions.

For a new interactive primitive (dialog / dropdown / popover / toast / etc.):

1. Check [`src/components/ui/`](src/components/ui) first — if shadcn already ships it, pull via `npx shadcn@2.1.8 add <name>` (or write the file directly using the canonical shadcn 2.x source if `pnpm` isn't on PATH).
2. The tokens map already gives you the WB palette for free. Don't theme the primitive in place; if you need WB-specific defaults, wrap it in `modules/common/components/<name>/`.
3. If the primitive renders into a portal, ensure its content className includes `frame ` so WB tokens resolve.

For a new visual pattern that appears in 2+ places:

1. Build it in `src/modules/common/components/<name>/`. Use the existing primitives as building blocks.
2. Embed sane WB defaults (font family, spacing, color) so callers stay terse.
3. Document it in DESIGN.md §5 (Primitives) with a usage example.

For a new design-time CSS class:

1. Only add a class if the pattern truly belongs in `wheel-builds.css` rather than a React component (rare now).
2. Scope it under a `.frame .my-class { ... }` selector — never global.
3. Document it in DESIGN.md §4 (Class catalog).
4. Use a name that describes the role, not the look. `style-tile` ✓, `big-orange-box` ✗.
