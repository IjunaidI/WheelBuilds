# WB-096 Accessibility & interaction chrome — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront only. Spec: [../specs/2026-07-15-wb-096-a11y-interaction-chrome-design.md](../specs/2026-07-15-wb-096-a11y-interaction-chrome-design.md).

**Global constraints:** Storefront tests `npx vitest run <path>` (no globals — `import { describe, it, expect } from "vitest"`); tsc at/below the baseline WB-086 reported; `npx next lint`. Branch `feat/g11-wave4-cleanup`. **Runs LAST in the wave.** WB-086 deleted `/categories`+`/collections` (so they need no `loading.tsx`) and the whole `modules/store/` tree; WB-095 already edited `middleware.ts` (matcher + a region 301) — **read the current file, don't work from the audit's line numbers**. Two audit items are CLOSED and out of scope: **X10** (WB-088 shipped instance+section-scoped facet ids in both rails) and the not-found half of **X9** (WB-085 rebranded all four). Legacy Medusa-UI modules (cart/checkout/account) sit outside `.frame` — match their local style, don't WB-ify.

---

### Task 1: X4 — accessible names on the flagship controls
**Files:** `modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` (~295-385, four `<Field label=…><Select>` pairs), `modules/discovery/components/filter-rail/filter-sections.tsx` (~326-347, the price Min/Max `<Field><TextInput>` pairs), `modules/common/components/delete-button/index.tsx` (~38-44), `modules/search/components/search-drawer/header.tsx` (~97-115).
- [ ] Failing test: none practical (JSX wiring). Grep is the gate — see below.
- [ ] Implement: pass `htmlFor` + a matching `id` at all six `<Field>` call sites. **`Field` already supports `htmlFor`** ([field/index.tsx:8,36,65-66](../../../storefront/src/modules/common/components/field/index.tsx)) — it renders a real `<label htmlFor>` when passed and an unassociated `<span>` when not; it is passed at **zero call sites today**. `Select`/`TextInput` are `forwardRef` wrappers that spread `...props`, so `id` flows through with **no component changes**. Ids must be unique per instance — the YMM pane and the rail can both be mounted. `aria-label="Remove item"` on `DeleteButton`; **keep the cart-dropdown's visible `"Remove"` children** (that call site already has an accessible name — the full cart table at `cart/components/item/index.tsx:126` passes no children and is the broken one). Label the search input (visible or `sr-only` — placeholder is not a name).
- [ ] Grep: every `<Field` in the app has an `htmlFor`; the id it names exists on the control. `npx next build`; `tsc`. Commit `fix(WB-096): accessible names on YMM, price, cart delete, and search controls (X4)`.

---

### Task 2: X5 — visible focus + pressed state
**Files:** `modules/common/components/select/index.tsx` (~30 `focus:outline-none focus:ring-0`), `modules/common/components/text-input/index.tsx` (~28, same), `styles/wheel-builds.css` (zero `:focus` rules file-wide; `.field` ~310-330 is DEAD — delete it; `.vehicle-tile` ~358-382 is live), `modules/product-detail/components/hero/variant-picker.tsx` (~94-127 size cells, ~156-169 bolt cells).
- [ ] Failing test: none practical (CSS/ARIA). Grep + a keyboard smoke.
- [ ] Implement: a 2px `--orange` `focus-visible:` outline with offset on the live surfaces — the `Select`/`TextInput` components (replace their `focus:outline-none focus:ring-0`, which leaves a 1px border shift as the only cue), and in `wheel-builds.css` for `.vehicle-tile`, `.nav-link`, `.product-card`, `.style-tile`, `.brand-chip`. **Do NOT add a rule for `.field`** — it is dead CSS (no JSX consumes it; the audit named it, the re-verification disproved it). Delete `.field` instead. `focus-visible`, not `focus`, so a mouse click doesn't ring. Match shadcn `<Button>`'s shipped `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` shape — it's already correct, don't re-solve it. Add `aria-pressed` to the wheel PDP's size + bolt cells, copying the two shipped references: `hero/gallery.tsx:54-60` and `tire/hero/size-picker.tsx:69,125` (the tire PDP already has it — the wheel picker is the last surface missing it).
- [ ] Grep: no `focus:outline-none` without a `focus-visible:` companion. Keyboard smoke: Tab through the YMM pane, the price inputs, the vehicle tiles, and the PDP pickers — every stop visibly rings. `npx next build`; `tsc`. Commit `fix(WB-096): visible focus-visible rings + aria-pressed on the wheel PDP pickers (X5)`.

---

### Task 3: X6 — contrast tokens
**Files:** `styles/wheel-builds.css` (~4 `.frame` token block), `modules/common/components/label/index.tsx` (~13-17,53-64), `modules/common/components/micro-link/index.tsx` (~30,38,45), the small-text `text-[var(--orange)]` call sites, `storefront/DESIGN.md` §2.
- [ ] Failing test: a pure `contrastRatio(fg, bg)` helper + assertions that `--orange-deep` on `#FAFAF8` ≥ 4.5:1 and the new `--ink-soft` on `#FAFAF8` ≥ 4.5:1 — pin the token values so a future edit can't silently regress them.
- [ ] RED → implement: **add `--orange-deep` (≈`#D14A00`); do NOT touch `--orange`.** Of its 83 `.tsx` + 11 CSS usages only ~27 are small text; the rest are backgrounds/borders/glows (`btn-primary`, `tag-new`, `fits-chip`, `wheel-glow`, `brand-mark .dot`) carrying **white-on-orange** — a different pair that is currently fine and would degrade if the value moved. Repoint only the sub-18px accent text (label, micro-link, and the grepped small-text usages) to `--orange-deep`. **`--ink-soft` darkens in place** `#8A8A8E` → `#6E6E73`: DESIGN.md §2 scopes it to tertiary text / mono labels / disabled — **grep all 77 usages FIRST and confirm every one is a text role**; if any border/background usage exists, leave that call site on the old value explicitly rather than riding the token.
- [ ] Docs: DESIGN.md §2 gains `--orange-deep`, the new `--ink-soft` value, and a contrast rule — §2 has **no** mention of contrast/AA today, which is why this drifted.
- [ ] GREEN vitest; visual check: `btn-primary` / `tag-new` / `fits-chip` still render the original bright `--orange`. `npx next build`; `tsc`. Commit `fix(WB-096): --orange-deep for small text, darker --ink-soft, DESIGN.md contrast rule (X6)`.

---

### Task 4: X8 — middleware edges
**Files:** `src/middleware.ts` — **read it fresh; WB-095 already edited the matcher and added a region 301, so the audit's line numbers (67, 94/154, 160-185, 199-201) have moved.** Test: pure decision functions.
- [ ] Failing test: three pure helpers — (a) a cookieless `?cart_id=X&step=payment` request yields "set the cookie, do NOT redirect" (never a redirect whose target equals the current URL); (b) `/US/store` → `/us/store`, **not** `/us/US/store`; (c) zero regions → passthrough, no throw.
- [ ] RED → implement, all three root-caused: **(a)** the self-redirect loop — a `?cart_id` link with no `_medusa_cart_id` cookie fails the third gate on the early `next()`, sets `redirectUrl` to the *current* href, and never reaches the only cookie-setting branch (gated on `cartId && !checkoutStep`), so it 307s to itself forever; set the cookie regardless of `checkoutStep`, and never redirect when the target equals the current URL. **(b)** the case mismatch — `getCountryCode` lowercases the segment, but `urlHasCountryCode` compares the **raw** segment against that lowercased value, so a valid uppercase prefix reads as code-less and gets `/us` prepended; compare lowercased on both sides. **(c)** replace `notFound()` (unsupported in Edge Middleware — there's no boundary to catch it) with a logged passthrough. **Also (X7, note-only in the spec but free while we're here):** add `_next/image` to the matcher's negative lookahead with a comment tying it to `images.unoptimized: true` — latent today, a trap for whoever flips the optimizer.
- [ ] GREEN vitest. Smoke: `/US/store` → `/us/store`; a `?cart_id` deep link lands once. `npx next build`. Commit `fix(WB-096): middleware self-redirect loop, uppercase prefix, notFound(), _next/image matcher (X8/X7)`.

---

### Task 5: X9-residual + X11 — loading coverage + funnel events
**Files:** new `app/[countryCode]/(main)/loading.tsx` + `app/[countryCode]/(checkout)/loading.tsx`; new `lib/analytics/track.ts` + test; `modules/product-detail/components/hero/purchase-panel.tsx`, the checkout entry, the order-confirmed page.
- [ ] Failing test: `track()` no-ops (no throw) when `window.plausible` is undefined — that IS the analytics-off path.
- [ ] RED → implement: `loading.tsx` for home and the `(checkout)` group (zero today — the whole group renders blank on a slow hard load). Reuse the shadcn `Skeleton` pattern the shipped `store`/`tires`/`cart` loading files use; **categories/collections need none — WB-086 deleted them.** `lib/analytics/track.ts` exports a guarded `track(event, props?)` calling `window.plausible?.(event, {props})` — one helper, not a guard duplicated three times. Fire `add_to_cart` (PDP purchase panel), `begin_checkout`, `purchase` (order-confirmed). **No config or env var needed**: `Analytics` is already gated on `NEXT_PUBLIC_ANALYTICS_DOMAIN` and renders nothing when unset, so `window.plausible` is simply undefined and the optional call is the no-op.
- [ ] GREEN vitest; `npx next build`. Commit `feat(WB-096): home + checkout loading states, Plausible funnel events (X9/X11)`.

---

### Task 6: Cleanup — orphans + dead deps + docs
**Files:** delete `lib/search-client.ts`, `modules/layout/components/side-menu/`, `modules/layout/components/country-select/`; `package.json`; `storefront/CLAUDE.md`.
- [ ] Failing test: none (deletion). **Re-grep each symbol before deleting.**
- [ ] Implement: delete `lib/search-client.ts` (zero importers), `modules/layout/components/side-menu/` (zero importers — the nav uses `MobileMenu`; it still links the deleted `/search`), and `modules/layout/components/country-select/` (its only consumer was side-menu). **KEEP `modules/checkout/components/country-select/`** — a *different* component, live in billing-address, shipping-address, and both account address cards. The audit says "delete country-select"; it means the `layout/` copy only. Drop `@meilisearch/instant-meilisearch`, `algoliasearch`, `react-instantsearch-hooks-web`, `@types/react-instantsearch-dom` — all four are consumed only by the deleted `search-client.ts`. **KEEP `meilisearch@0.51.0`** — that's the live Discovery client (`lib/meilisearch.ts`).
- [ ] Docs: `storefront/CLAUDE.md` — remove the `search-client.ts` + side-menu lines from §Layout and the SideMenu gotcha.
- [ ] Grep: zero importers of every deleted symbol; zero references to the four dropped packages. `npx next build` exit 0; `npx tsc --noEmit` at/below baseline; `npx next lint`. Commit `chore(WB-096): delete the Algolia-era orphans + dead deps`.

---

### Task 7: Chunk review
- [ ] `scripts/review-package <base> HEAD` → an **opus** reviewer (this chunk touches shared tokens + middleware, both of which fail globally and quietly). Focus: (a) **the `--ink-soft` in-place darken — was every one of the 77 usages actually verified as a text role**, or was the grep claimed and not done; (b) does any large-element/white-on-orange surface accidentally read `--orange-deep`; (c) the middleware trio — can (a)'s fix strand a cart, and does the lowercase fix break the `/us` happy path; (d) does the dep removal drop anything transitively imported; (e) is the `(checkout)` loading state inside the group's layout correctly (it's outside `.frame` by design); (f) any `focus:` where `focus-visible:` was intended.
