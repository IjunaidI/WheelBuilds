# DESIGN.md — Wheel Builds design system

The contract for visuals in this storefront. If you're building inside the design (home, search drawer, nav, footer, and the future Discovery / Product Detail / Mobile screens), read this first and stay inside the conventions it sets.

If you only need the architecture overview, see [CLAUDE.md](CLAUDE.md). DESIGN.md is purely about look, feel, and the building blocks.

---

## 1. Aesthetic direction

**One sentence:** A garage / blueprint aesthetic — heavy uppercase display type, monospace technical labels, surgical orange (#FF6A00) used like a highlighter, on a faint grid-pattern paper background.

Mood references built in: Antonio black for headlines (Druk Wide stand-in), Inter for body, JetBrains Mono for technical labels, restrained orange highlights, dense product cards, generous typography on the hero.

The original design canvas allowed switching between three moods (Gallery / Garage / Editorial), three accent voltages (Surgical / Confident / High), and three display cuts (Wide / Tall / Stencil). The shipped storefront bakes in: **Garage mood · High accent · Wide display**. Other combinations are not currently wired — adding them is a project of its own, not a small tweak.

## 2. Tokens

All tokens live as CSS variables on `.frame` ([storefront/src/styles/wheel-builds.css](src/styles/wheel-builds.css)). Read them as `var(--token)`, never hard-code the underlying hex elsewhere — that breaks any future theme work.

### Color

| Token | Value | Role |
|---|---|---|
| `--orange` | `#FF6A00` | Accent — CTAs, NEW tags, prices, fitment-OK chips, active states, the orange tick in trust points |
| `--orange-deep` | `#E55A00` | Hover state of orange CTAs |
| `--ink` | `#0F0F10` | Body text, display type, primary borders |
| `--graphite` | `#3A3A3D` | Secondary text, descriptions, link rest state |
| `--ink-soft` | `#8A8A8E` | Tertiary text, monospace labels, disabled. Renamed from `--muted` because shadcn's design tokens own that name. |
| `--hairline` | `#E6E6E8` | Borders, dividers |
| `--surface` | `#FFFFFF` | Card / sheet background |
| `--soft` | `#F7F7F8` | Chips, brand tiles, inset surfaces |
| Page bg | `#FAFAF8` + 80×80px grid | The faint blueprint paper set on `.frame` |

**Rule of thumb for orange:** if it doesn't communicate "do this," "this is new," or "this is for sale," it shouldn't be orange. Don't use it as a decorative color.

### Typography

| Family | Source | Used for | CSS var |
|---|---|---|---|
| Antonio (700) | next/font/google | All `.display` headlines, brand mark, big numbers, product names on cards | `--display` |
| Inter (400, 500, 600, 700) | next/font/google | Body, buttons, navigation links, form fields | `--body` |
| JetBrains Mono (400, 500, 600) | next/font/google | Labels (`.label`, `.label-muted`), counters, footnotes, kbd hints, copyright line | `--mono` |

`.frame` sets `font-variant-numeric: tabular-nums` everywhere so prices and counters align. Don't override this casually.

Display sizes used in the home (for reference, not a hard scale):

- Hero headline: 132 / 0.9
- Editorial block headline: 56 / 0.92
- Newsletter / section "Get the drops first": 56
- Section title (New This Week, Shop by Style, Trusted Brands, Build Gallery): 40
- Featured editorial sub-stats: 22
- Product card name: 17–19
- Counter ("08", "FT.01 / 06"): 88 / 10
- Search drawer title: 22

Body sizes: 18 (hero subhead), 16 (editorial blurb), 15 (search input), 14 (buttons, default body), 13 (footer links, captions), 12 (small body), 11 (mono labels), 10 (kbd, micro-labels).

### Spacing

The home and drawer use raw pixel paddings — there's no spacing scale yet. Common values to reach for:

- Section vertical padding: `120px 80px` (large sections), `80px 80px` (medium), `48px 80px` (compact)
- Section horizontal padding: `80px` left/right (matches the navigation's `40px` + inner gutter feel)
- Drawer interior padding: `24px`
- Card padding: `16px` (compact) / `20px` (default)
- Gutter between cards in a grid: `16px`
- Gap between adjacent fields/tiles: `8px`

If you find yourself reaching for a tenth value, stop and reuse one of these.

## 3. The `.frame` wrapper

Every component that uses design-system classes MUST be a descendant of `.frame`. Today that's done once in [`(main)/layout.tsx`](src/app/[countryCode]/(main)/layout.tsx). Don't add a second `.frame` inside it — nested wrappers redeclare the CSS variables for no benefit.

If a component might be reused outside `.frame` (e.g. mounted in a portal), add `className="frame"` to its own root so it can stand alone. The drawer ([search-drawer/index.tsx](src/modules/search/components/search-drawer/index.tsx)) does this defensively.

## 4. Class catalog

All classes are scoped under `.frame .foo` selectors, so the names are short. Use them by class string on the relevant element.

> **Heads-up on the typography / button / tag classes below.** Most of these are now wrapped by React primitives (§5) that bake in the right defaults — reach for `<Display>` / `<Label>` / `<Button>` / `<Chip>` first. The raw classes are still here because (a) the primitives use them internally for the bespoke parts (e.g. `<Display>` adds `className="display"`), (b) legacy Medusa-style modules outside `.frame` (cart, checkout, account) still target them directly, and (c) they're a reliable fallback when you genuinely need the visual treatment without React state.

### Typography

- **`display`** — Antonio 900, uppercase, tight letter-spacing. Use for headlines, section titles, big numbers. *Wrapped by [`<Display>`](src/modules/common/components/display/index.tsx).*
- **`label`** — Mono 600, uppercase, 11px, orange. Use for section eyebrows and emphasized small caps. *Wrapped by [`<Label>`](src/modules/common/components/label/index.tsx).*
- **`label-muted`** — Same as `label` but `--ink-soft` color. Use for column headings in the footer, secondary tags. *Wrapped by [`<Label tone="muted">`](src/modules/common/components/label/index.tsx).*

### Buttons & CTAs

The `.btn` / `.btn-primary` / `.btn-outline` classes ship in `wheel-builds.css` for backwards compatibility but **new design code should use [`<Button>`](src/components/ui/button.tsx) from `@/components/ui/button`**. It carries 6 variants (`default`, `outline`, `secondary`, `ghost`, `link`, `destructive`) × 4 sizes (`default`, `sm`, `lg`, `icon`) and gives you focus-ring + disabled handling for free.

- **`btn`** *(legacy)* — Base button shape: 48px tall, 22px horizontal padding, 4px radius.
- **`btn-primary`** *(legacy)* — Orange fill, white text, drop shadow with orange glow, uppercase. Maps to `<Button variant="default">`.
- **`btn-outline`** *(legacy)* — Transparent fill, ink border. Maps to `<Button variant="outline">`.

### Tags & badges

The `.tag-new` / `.fits-chip` / `.build-chip` classes are similarly wrapped by [`<Chip>`](src/modules/common/components/chip/index.tsx) — use the component first.

- **`tag-new`** *(legacy)* — Maps to `<Chip variant="accent" size="sm">NEW</Chip>`.
- **`fits-chip`** *(legacy)* — Maps to `<Chip variant="accent" dot>FITS YOUR F-150</Chip>`.
- **`build-chip`** *(legacy)* — White rounded pill for dark-imagery overlays. Maps to `<Chip variant="outline">`.

### Surfaces

- **`vehicle-tile`** — The mega Year/Make/Model/Trim tile in the hero. White, ink border (or hairline when inactive), 132px min-height, hover lift.
- **`product-card`** — Standard product card. Hairline border, 8px radius, hover deepens the border + lifts.
- **`style-tile`** — Shop-by-Style row tile. Same chrome as product-card but wider, includes a small wheel render on the right.
- **`brand-chip`** — Tile in the Trusted Brands grid. Soft background, hairline border, 110px tall.

### Decorations

- **`brand-mark`** — The "● WHEEL/BUILDS" logo glyph. Uses Antonio with a tiny orange dot.
- **`wheel`** — The CSS+SVG wheel render. Comes with `.bronze` and `.silver` modifier classes.
- **`wheel-glow`** — Radial orange glow behind a wheel. Position it as a sibling, behind, with `position: absolute; inset`.
- **`img-placeholder`** — Diagonal-stripe stand-in for missing imagery. Adds `.dark` for night/lifestyle photo slots.
- **`counter`** — Mono 10px overlay text for editorial counters ("FT.01 / 06").
- **`divider`** — Top hairline. Cheap separator.
- **`swatch-dot`** — 12×12 round color chip used in product-card finish previews.
- **`nav-link`** — Primary nav link with orange underline on hover/active.

### Form fields

- **`field`** — 44px tall input/select with hairline border, custom chevron for selects. Add `.input` to suppress the chevron for text inputs.

## 5. Primitives (React components)

WB primitives live under `src/modules/common/components/` and are the only sanctioned way to render their respective things. **Two tiers:**

- **Composed primitives** wrap the raw aesthetic — `<Label>`, `<Display>`, `<SectionHeader>`, `<MicroLink>`, `<Chip>`, `<VehicleTile>`. Reach for these instead of repeating `style={{ fontFamily: "var(--display)", … }}` blocks. They embed WB defaults (Antonio for display, mono for labels, orange accents) so callers stay terse and the look stays consistent.
- **Asset primitives** wrap the bespoke visuals — `<Wheel>`, `<Icon>`, `<Logo>`, `<ImgPlaceholder>`.

Below `modules/common`, shadcn primitives in `src/components/ui/*` (Drawer, Sheet, Dialog, DropdownMenu, Tooltip, Sonner, Command, Button) handle behavior/accessibility/motion. Their tokens are already mapped to the WB palette so they inherit the look automatically.

Don't hand-roll wheel SVGs, image placeholders, mono labels, or section headers anywhere else.

### `<Label tone? bar? children />`

[`src/modules/common/components/label/index.tsx`](src/modules/common/components/label/index.tsx). Mono uppercase eyebrow, 11px, 0.08em tracking. Tones: `accent` (orange, default), `muted` (`--ink-soft`), `ink`. Pass `bar` for the orange leading dash (hero / section eyebrows).

```tsx
<Label bar>FITMENT FIRST · STEP 01 OF 02</Label>
<Label tone="muted">2 saved vehicles</Label>
```

### `<Display size? tone? as? children />`

[`src/modules/common/components/display/index.tsx`](src/modules/common/components/display/index.tsx). Antonio 900 headline. `size` is pixel count (default 40 — the section-header size). `as` controls the rendered element (`h1` for hero, `h2` for sections, `span` for inline counters). Letter-spacing and line-height auto-tune based on size.

```tsx
<Display size={132} as="h1">What do you drive?</Display>
<Display size={88} tone="orange" as="span">08</Display>
<Display>Shop by Style</Display>
```

### `<SectionHeader counter? eyebrow? title description? action? />`

[`src/modules/common/components/section-header/index.tsx`](src/modules/common/components/section-header/index.tsx). The recurring section-top row (huge orange counter + display title + description + trailing action). Pass only the slots you need; omitted ones collapse.

```tsx
<SectionHeader
  counter="08"
  title="New This Week"
  description="Fresh fitments from Blackline, Vanguard, Meridian and more."
  action={<MicroLink href="/collections">View all 08</MicroLink>}
/>
```

### `<MicroLink href arrow? tone? children />`

[`src/modules/common/components/micro-link/index.tsx`](src/modules/common/components/micro-link/index.tsx). The orange mono "VIEW ALL →" / "BROWSE BRANDS →" pattern. Country-scoped via `LocalizedClientLink` under the hood. `tone="ink"` flips it to ink. Don't nest inside another `<a>` — use the inline arrow span variant instead (see `shop-by-style/index.tsx` for an example of nested-link avoidance).

### `<Chip onClick? href? variant? size? dot? children />`

[`src/modules/common/components/chip/index.tsx`](src/modules/common/components/chip/index.tsx). Pill component for popular searches, brand chips, fitment-OK tags, build chips. Variants `soft` (neutral) / `accent` (orange) / `outline`. Renders as a `<button>` by default; pass `href` to render a country-scoped link. Pass `dot` for the orange leading dot used by fitment-confirmed chips.

### `<VehicleTile idx label value? onClick size? />`

[`src/modules/common/components/vehicle-tile/index.tsx`](src/modules/common/components/vehicle-tile/index.tsx). The big YMM tile button. Hero uses `size="lg"` (default, 110px tall); inline/drawer uses `size="md"` (80px). Renders a "Pick {label}" prompt when `value` is undefined and the actual value with an orange underline when set.

### `<Wheel size={n} finish="black" | "bronze" | "silver" />`

[`src/modules/common/components/wheel/index.tsx`](src/modules/common/components/wheel/index.tsx). CSS conic gradient + SVG spoke overlay. Default 320px square. The size scales the SVG viewport; lug nuts and hub stay proportional. Pass `style` for positioning. Comes with a built-in soft shadow — don't add your own shadow stacking.

Use sizes that are common in the design (140, 200, 320, 620). Going below 56 makes the spoke pattern muddy.

### `<Icon name="…" size={n} color="…" strokeWidth={n} />`

[`src/modules/common/components/icon/index.tsx`](src/modules/common/components/icon/index.tsx). Inline SVG icon set. Available names: `search`, `user`, `heart`, `bag`, `garage`, `arrow-right`, `check`, `shipping`, `shield`, `badge`, `return`, `x`, `chevron-down`, `filter`, `grid`, `sort`, `instagram`, `youtube`, `tiktok`, `facebook`.

Don't reach for `@medusajs/icons` or `react-icons` inside `.frame`. If you need a new icon, add it to `Icon` so it stays in the same stroke-width family.

Default stroke is 1.5px. Use 2.5 for the orange "✓" check on trust points and fitment chips. Default size 18.

### `<Logo size={n} />`

[`src/modules/common/components/logo/index.tsx`](src/modules/common/components/logo/index.tsx). The "● WHEEL/BUILDS" wordmark. Use 16 in the utility bar, 20 in the footer, 18 elsewhere.

### `<ImgPlaceholder label="…" dark? radius? style? />`

[`src/modules/common/components/img-placeholder/index.tsx`](src/modules/common/components/img-placeholder/index.tsx). The striped stand-in for "real photo coming later." Use `dark` for vehicle 3/4 angles and build-gallery tiles. The `label` is a small mono caption inside.

When real imagery lands, swap `<ImgPlaceholder>` for `next/image` directly, matching the parent's aspect ratio.

## 6. Section patterns

These are the section archetypes used on the home. Future Discovery and Product Detail pages should follow the same patterns where they overlap.

### Section header

Use the [`<SectionHeader>`](src/modules/common/components/section-header/index.tsx) primitive. It produces this layout:

```
[ counter 88 orange ]  [ display title 40 ]              [ action (right-aligned) ]
                       [ optional eyebrow ]
                       [ optional description 13 graphite ]
```

```tsx
<SectionHeader
  counter="08"
  title="New This Week"
  description="Fresh fitments from Blackline, Vanguard, Meridian and more."
  action={<MicroLink href="/collections">View all 08</MicroLink>}
/>
```

Examples in the home: New This Week, Trusted Brands, Build Gallery. Don't reinvent this layout with inline flex/grid — every duplication risks drift.

### Editorial block

Two-column 1fr/1fr grid, 64px gap, alternating sides via `direction: rtl` on the wrapper (and `direction: ltr` on each child). Used for the three "FEATURED" sections in the home. Image on one side, headline + blurb + 4-stat table + CTA on the other.

### Product card

Square wheel render area on top (180 or 220 tall), brand label, name, swatch row, hairline divider, "FROM $price" footer, optional `fits-chip` below. Hover deepens the border and lifts.

### Vehicle hero tile

Mega button, 132px min height, big Antonio value (current selection) above an orange tick, with a small mono "STEP 0n · LABEL" eyebrow. Inactive state grays the value, swaps "Pick year" prompts, hides the tick.

### Side drawer

480px wide, slides in from the right, 24px header padding, 24px body padding, scrollable body. Apply `.frame` on the root so CSS variables work even when mounted via portal.

## 7. Motion baseline

What's wired today:

- **Search drawer** uses [Vaul](https://github.com/emilkowalski/vaul) (`direction="right"`) — JS-driven slide with drag-to-dismiss, momentum easing, and graceful exit. Underlying primitive: [`<Drawer>`](src/components/ui/drawer.tsx).
- **Dialog / Sheet / DropdownMenu / Tooltip / Popover** use [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate) keyframes — `data-[state=open]:animate-in`, `slide-in-from-*`, `fade-in-0`, `zoom-in-95`. All driven by data-attributes on the open/close state, so animations stay in sync with the primitives' own state machines.
- **Sonner toasts** are wired via [`<Toaster position="bottom-right">`](src/app/[countryCode]/(main)/layout.tsx) — call `toast.success(...)` / `toast.error(...)` from any client component.
- **Button focus rings** come for free from `<Button>`'s `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. The orange `--ring` token makes them WB-orange.
- **Hover lifts / color transitions** on cards and CTAs are CSS-only — `transition` on `transform`, `opacity`, `border-color`.

Still on the polish list:

- Scroll-linked reveals on home sections (consider [Motion](https://motion.dev) — successor to framer-motion — if/when needed)
- Skeleton loaders for the catalog / search results / PDP
- Mobile breakpoints (the home is desktop-only today)
- Hero entry stagger

Rule of thumb: **use the primitives' built-in motion before adding any of your own**. If you need custom motion that isn't one of `transform` / `opacity` / `border-color` on a CSS transition, reach for Vaul/tailwindcss-animate utilities; only escalate to a JS animation lib (Motion) when scroll/gesture/spring physics genuinely matter.

## 8. Anti-patterns (don't do these)

- **Inline hex colors.** Use `var(--orange)` etc. The exception is the watermark wheel's internal gradients in `wheel-builds.css`, which are hard-coded by necessity.
- **`wb-` / `WB` prefixes.** See [CLAUDE.md → Naming convention](CLAUDE.md#naming-convention--no-wb--prefix) and `feedback_no_wb_prefix.md`.
- **Hand-rolled section headers, eyebrow labels, display headlines, pills, or YMM tiles.** These are all composed primitives (§5) — use `<SectionHeader>` / `<Label>` / `<Display>` / `<Chip>` / `<VehicleTile>`. Duplicating the inline styling is how the system drifts.
- **Tailwind utility classes on raw `div`s inside `.frame` when a primitive exists.** Tailwind inside primitives is fine (Button, Chip, Sheet, Drawer, etc. all use it because shadcn does). Tailwind on top-level page markup that should be using `<Display>` / `<SectionHeader>` / etc. is duplication. Inline `style={...}` is OK for genuinely one-off layout values (specific `gap`, `maxWidth`, `gridTemplateColumns`).
- **A second `.frame` wrapper.** Once per page tree, mounted in the layout. Nested wrappers redeclare variables for nothing.
- **Big multi-line comments in components.** One short line max — the design's *what* should be obvious from the markup; the *why* belongs in this file or in PR descriptions.
- **Generic class names that leak.** `.btn` is fine because it only matches `.frame .btn`. Don't write `.card`, `.title`, `.row` etc. without scoping under `.frame`.
- **Adding a new color.** Add a new token to `wheel-builds.css` if you absolutely have to. Don't sprinkle ad-hoc hexes through inline styles.
- **`@medusajs/icons` inside the design.** Use the `Icon` primitive. Add new icons to it.
- **New display fonts.** Antonio / Inter / JetBrains Mono are the type system. If you need stencil or compressed cuts (Bebas Neue, Big Shoulders Stencil), those are out of scope until the mood/display tweaks land properly.
- **Hard-coding the active vehicle anywhere.** The Garage pill, hero tiles, and drawer all read from `useGarage()`. New consumers should too.

## 9. Adding a new component to the design

The three-tier rule: shadcn for **behavior**, WB composed primitives for **visual patterns**, feature/section files for **page-specific composition**.

1. **Pick the right home.**
   - Pure interactive primitive someone else built (dialog, popover, command palette, accordion, …) → `npx shadcn@2.1.8 add <name>` lands it in `src/components/ui/<name>.tsx`. **Don't hand-edit afterward.**
   - A visual pattern that repeats in 2+ places → `src/modules/common/components/<name>/index.tsx`. Build it on top of shadcn + the WB tokens. Document it in §5.
   - A composition that only one page section uses → `src/modules/<feature>/components/<name>/`.
2. **Use the existing primitives** (`<Display>`, `<Label>`, `<SectionHeader>`, `<MicroLink>`, `<Chip>`, `<VehicleTile>`, `<Wheel>`, `<Icon>`, `<Logo>`, `<ImgPlaceholder>`, plus the shadcn primitives) before inventing new ones.
3. **Use the existing tokens** (`var(--orange)`, `var(--ink)`, `var(--ink-soft)`, `var(--hairline)`, `var(--soft)`, `var(--surface)`, `var(--display)`, `var(--mono)`, …) and the shadcn token aliases (`bg-primary`, `text-foreground`, `border-border`, …) before adding new ones.
4. **If you have to add a new CSS class**: add it to `wheel-builds.css` under `.frame .my-class { ... }`. Role-based name. Document it in §4.
5. **If you have to add a new CSS variable**: add it to the `.frame { ... }` block in `wheel-builds.css`. Document it in §2. **Grep `globals.css` for collisions first** — shadcn owns names like `--muted`, `--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`. We've already had to rename WB's `--muted` to `--ink-soft` for this reason.
6. **If you have to add a new font weight**: load it via `next/font/google` in `app/layout.tsx`. Don't add a separate `<link>` tag.
7. **No emojis in the design.** All icons go through [`<Icon>`](src/modules/common/components/icon/index.tsx).
8. **If the new component is portaled** (drawer, dialog, popover, dropdown, tooltip, toast — anything that ends up at body root): its content className must include `frame ` so WB tokens resolve.

## 10. Open questions for future work

These don't change the design contract above, but they're tracked so the next iteration knows the gaps.

- **Consistency sweep.** Hero, NewDropsRow, ShopByStyle are on the new primitives. `featured-blocks`, `shop-by-brand`, `build-gallery`, `trust-strip`, `newsletter`, the footer, the GaragePill, and the search drawer internals (`header`, `popular-searches`, `recent-searches`, `find-by-vehicle/*`) still hand-roll their headers, labels, and chips. Same primitives, no new shapes — straight find/replace pass.
- **Cart dropdown.** Still HeadlessUI Popover. Migrate to shadcn `<DropdownMenu>` — it's already wired and themed.
- **Form primitives.** `<Field>` / `<Input>` / `<Select>` for the newsletter input, drawer search box, YMM selects. Right now each of those is a one-off inline-styled input.
- **Toasts.** `<Toaster>` is mounted but unused. Cart-add, cart-remove, fitment-saved, copy-to-clipboard, form-error are the obvious first callers.
- **Mobile.** The home is desktop-only (fixed 80px paddings, `repeat(6, 1fr)` grids). The original design canvas had a mobile home + filter bottom sheet; that's still to be ported. Vaul's `direction="bottom"` is the natural fit for the mobile filter sheet.
- **Discovery (catalog) page.** Designed but not built. Filter rail + 4-up product grid + active-filter chips.
- **Product Detail.** Designed but not built. Fitment matrix, offset diagrams, stance previews — the most complex screen.
- **Mood/Accent/Display tweaks.** Three orthogonal axes were designed; only one combination ships. Adding the other modes is a separate, fully scoped piece of work (Tweaks panel + state plumbing + CSS variants).
- **Imagery.** Every photographic element is currently an `ImgPlaceholder`. When real photography lands, swap to `next/image`, set explicit aspect ratios, and decide on a CDN strategy.
- **Skeleton loading.** No skeletons yet. The Discovery/Product Detail pages will need them. `shadcn add skeleton` is the next add when we get there.
- **Motion polish.** Hero entry stagger, scroll-linked reveals, fine-grained hover micro-interactions. Drawer slide-in is now handled by Vaul — strike from the list.
