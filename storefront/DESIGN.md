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

### Typography

- **`display`** — Antonio 900, uppercase, tight letter-spacing. Use for headlines, section titles, big numbers.
- **`label`** — Mono 600, uppercase, 11px, orange. Use for section eyebrows and emphasized small caps.
- **`label-muted`** — Same as `label` but `--ink-soft` color. Use for column headings in the footer, secondary tags.

### Buttons & CTAs

- **`btn`** — Base button shape: 48px tall, 22px horizontal padding, 4px radius. Adds `btn-primary` or `btn-outline` for fill.
- **`btn-primary`** — Orange fill, white text, drop shadow with orange glow, uppercase, 0.06em tracking.
- **`btn-outline`** — Transparent fill, ink border, inverts on hover.

Sizing variants: override `height` + `padding` inline. Hero CTA is 64px tall; newsletter is 56px; in-card CTAs stick to 48px.

### Tags & badges

- **`tag-new`** — Orange pill, uppercase white text, 26px tall. Use for "NEW" markers on product cards.
- **`fits-chip`** — Solid orange chip with white text, "FITS YOUR F-150" style. Use anywhere a vehicle-OK signal needs to live.
- **`build-chip`** — White rounded pill (12px radius) for overlay tags on dark imagery (build gallery, etc.).

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

The four shared primitives all live under `src/modules/common/components/` and are the only sanctioned way to render their respective things. Don't hand-roll wheel SVGs or image placeholders elsewhere.

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

```
[ display title 40 ]                          [ "View all 08 →" link in orange ]
[ optional eyebrow label · orange, mono ]
[ optional subhead 13 in --graphite ]
```

Examples: New This Week, Trusted Brands, Build Gallery.

### Editorial block

Two-column 1fr/1fr grid, 64px gap, alternating sides via `direction: rtl` on the wrapper (and `direction: ltr` on each child). Used for the three "FEATURED" sections in the home. Image on one side, headline + blurb + 4-stat table + CTA on the other.

### Product card

Square wheel render area on top (180 or 220 tall), brand label, name, swatch row, hairline divider, "FROM $price" footer, optional `fits-chip` below. Hover deepens the border and lifts.

### Vehicle hero tile

Mega button, 132px min height, big Antonio value (current selection) above an orange tick, with a small mono "STEP 0n · LABEL" eyebrow. Inactive state grays the value, swaps "Pick year" prompts, hides the tick.

### Side drawer

480px wide, slides in from the right, 24px header padding, 24px body padding, scrollable body. Apply `.frame` on the root so CSS variables work even when mounted via portal.

## 7. Iconography / motion baseline

What's shipped today is mostly static — hover lifts on cards, color transitions on buttons. We have not yet:

- Animated the drawer slide-in (it appears instantly)
- Used scroll-linked reveals on the home sections
- Added a focus-ring style for the orange CTA
- Built skeleton loaders for the catalog / search results

Those land in the polish pass. For now: don't introduce JS-driven animation libraries (framer-motion, etc.). Stick to CSS transitions on `transform`, `opacity`, and `border-color`. If you need slide-in, do it with `transform: translateX` and a 200–280ms ease curve.

## 8. Anti-patterns (don't do these)

- **Inline hex colors.** Use `var(--orange)` etc. The exception is the watermark wheel's internal gradients in `wheel-builds.css`, which are hard-coded by necessity.
- **`wb-` / `WB` prefixes.** See [CLAUDE.md → Naming convention](CLAUDE.md#naming-convention--no-wb--prefix) and `feedback_no_wb_prefix.md`.
- **Tailwind classes inside `.frame`.** Mixing the two is fine in legacy modules (cart, checkout, account), but new design-system markup should use the scoped CSS classes plus inline styles for layout-specific values. The reason: design tokens live as CSS variables, not as Tailwind theme entries.
- **A second `.frame` wrapper.** Once per page tree, mounted in the layout. Nested wrappers redeclare variables for nothing.
- **Big multi-line comments in components.** One short line max — the design's *what* should be obvious from the markup; the *why* belongs in this file or in PR descriptions.
- **Generic class names that leak.** `.btn` is fine because it only matches `.frame .btn`. Don't write `.card`, `.title`, `.row` etc. without scoping under `.frame`.
- **Adding a new color.** Add a new token to `wheel-builds.css` if you absolutely have to. Don't sprinkle ad-hoc hexes through inline styles.
- **`@medusajs/icons` inside the design.** Use the `Icon` primitive. Add new icons to it.
- **New display fonts.** Antonio / Inter / JetBrains Mono are the type system. If you need stencil or compressed cuts (Bebas Neue, Big Shoulders Stencil), those are out of scope until the mood/display tweaks land properly.
- **Hard-coding the active vehicle anywhere.** The Garage pill, hero tiles, and drawer all read from `useGarage()`. New consumers should too.

## 9. Adding a new component to the design

1. **Pick the right home.** Shared primitives → `src/modules/common/components/<name>/`. Section components → `src/modules/<feature>/components/<name>/`. Drawer-internal pieces → nested inside the drawer.
2. **Use the existing primitives** (`Wheel`, `Icon`, `Logo`, `ImgPlaceholder`) before inventing new ones.
3. **Use the existing classes** (`display`, `label`, `btn`, `tag-new`, …) before adding new ones.
4. **If you have to add a class**: add it to `wheel-builds.css` under a `.frame .my-class { ... }` selector. Use a descriptive role-based name. Document it in the Class catalog (§4) of this file.
5. **If you have to add a CSS variable**: add it to the `.frame { ... }` block at the top of `wheel-builds.css`. Document it in Tokens (§2).
6. **If you have to add a new font weight**: load it via `next/font/google` in `app/layout.tsx`. Don't add a separate `<link>` tag.
7. **No emojis in the design.** All icons go through `Icon`.

## 10. Open questions for future work

These don't change the design contract above, but they're tracked so the next iteration knows the gaps.

- **Mobile.** The home is desktop-only today. The original design canvas had a mobile home + filter bottom sheet; that's still to be ported.
- **Discovery (catalog) page.** Designed but not built. Filter rail + 4-up product grid + active-filter chips.
- **Product Detail.** Designed but not built. Fitment matrix, offset diagrams, stance previews — the most complex screen.
- **Mood/Accent/Display tweaks.** Three orthogonal axes were designed; only one combination ships. Adding the other modes is a separate, fully scoped piece of work (Tweaks panel + state plumbing + CSS variants).
- **Imagery.** Every photographic element is currently an `ImgPlaceholder`. When real photography lands, swap to `next/image`, set explicit aspect ratios, and decide on a CDN strategy.
- **Skeleton loading.** No skeletons yet. The Discovery/Product Detail pages will need them.
- **Motion.** Drawer slide-in, hero entry stagger, scroll-linked reveals. The polish pass owns this.
