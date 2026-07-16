# WB-095 SEO & shareability — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront only. Spec: [../specs/2026-07-15-wb-095-seo-shareability-design.md](../specs/2026-07-15-wb-095-seo-shareability-design.md).

**Global constraints:** Storefront tests `npx vitest run <path>` (no globals — `import { describe, it, expect } from "vitest"`); tsc at/below the baseline WB-086 reported. `npx next build` is the gate for the ImageResponse routes and the `"use server"` rule. Branch `feat/g11-wave4-cleanup`. **WB-086 (already on this branch) deleted `/categories` + `/collections`** — do NOT re-fix their titles or canonical, they're gone; if a task's grep still finds them, stop and say so. **WB-096 edits `middleware.ts` after this chunk** — leave the file coherent.

---

### Task 1: X1 — real share images + favicon, and the routes they create
**Files:** delete `app/opengraph-image.jpg`, `app/twitter-image.jpg`, `public/favicon.ico`. New: `app/opengraph-image.tsx`, `app/twitter-image.tsx`, `app/icon.tsx`. Edit `src/middleware.ts` (~199-201 matcher).
- [ ] Failing test: none (visual/route). The build + a route smoke is the gate.
- [ ] Implement: `ImageResponse` (from `next/og`) at 1200×630 for opengraph + twitter — dark ground, "WHEEL/BUILDS" wordmark, orange rule; read the values from DESIGN.md §2 rather than hardcoding new hexes. `app/icon.tsx` for the favicon (32×32). Delete the three boilerplate binaries — a static and a dynamic file in the same segment conflict, and `public/favicon.ico` would otherwise keep winning the browser's default `/favicon.ico` request.
- [ ] **Matcher (load-bearing — the feature is broken without it):** the current matcher excludes `favicon.ico` + `.png`/`.jpg` literals but nothing matching `/opengraph-image`, `/twitter-image`, `/icon`. Without an exclusion those routes 307 to `/us/icon` → 404. Add all three to the negative lookahead.
- [ ] `npx next build` exit 0. Smoke: all three routes 200 (not 307). Commit `feat(WB-095): generated OG/twitter/favicon + middleware matcher for the metadata routes (X1)`.

---

### Task 2: X1 — title template + PDP share images
**Files:** `app/layout.tsx` (~29-31 — `metadata` is `metadataBase` only, no title), `app/[countryCode]/(main)/products/[handle]/page.tsx` (~27-40 `generateMetadata` — title only, no `openGraph`).
- [ ] Failing test: none (metadata config). Grep + build.
- [ ] Implement: root `metadata.title = { template: "%s | Wheel Builds", default: "Wheel Builds — Wheels & Tires With Live Fitment" }`. The PDP currently hand-rolls `` `${brand} ${name} | Wheel Builds` `` (~line 37) — strip the suffix so the template applies once, not twice. Add `openGraph: { images: [product.thumbnail], title, description }` + the matching `twitter` block (the vendor CDN image — no art needed).
- [ ] Grep: no `| Medusa Store` **titles** anywhere (WB-086 deleted the only two; body copy in account/register/side-menu is out of scope — do not touch it). `npx next build`; `tsc`. Commit `feat(WB-095): title template + per-product OG images (X1)`.

---

### Task 3: X2 — canonicals on every indexable page
**Files:** new `lib/util/canonical.ts` + test; `app/[countryCode]/(main)/page.tsx` (~17), `store/page.tsx` (~13), `tires/page.tsx` (~10), `products/[handle]/page.tsx` (~27-40).
- [ ] Failing test: a pure `canonicalUrl(path)` → an **absolute** URL on the `DEFAULT_REGION` prefix (`https://<base>/us/store`), regardless of the country code the page was requested under; no double slashes; the bare path `/` → `https://<base>/us`.
- [ ] RED → implement: `alternates: { canonical: canonicalUrl(...) }` on home, `/store`, `/tires`, and the PDP. Always pin `DEFAULT_REGION` (`us`) per WB-071 F-D's single-region lock. **Absolute, never the bare-relative form** — WB-086 documented exactly why: a bare `"wheels"` resolves against `metadataBase`'s origin root and produced a permanent 404 canonical.
- [ ] GREEN vitest; `npx next build`; `tsc`. Commit `feat(WB-095): absolute us-pinned canonicals on the indexable pages (X2)`.

---

### Task 4: X2 — 301 non-default region prefixes
**Files:** `src/middleware.ts` (fail-open block ~131-149; the `urlHasCountryCode` branch ~153-163). Test: the pure decision function.
- [ ] Failing test: a pure `regionRedirectTarget(pathname, search, defaultRegion)` → `/us/store?q=x` for `/de/store?q=x`; `null` for `/us/store` (no redirect); `null` for a path with no 2-letter prefix (the existing 307 handles it); preserves the query string and deep paths (`/de/products/abc` → `/us/products/abc`). **The regression this whole finding turns on:** the function must NOT consult a region map — assert that a map *containing* `de` still yields a redirect.
- [ ] RED → implement: place the rule **after** the fail-open block (do not fold it into that branch — during a backend outage `/de/...` keeps passing through untouched; WB-081's behavior is preserved deliberately). 301 (`permanent`), not 307. **Gate on `code !== DEFAULT_REGION`, NEVER on `regionMap.has(code)`** — `seed.ts:139-151` seeds a real EUR region covering `gb,de,dk,se,fr,es,it`, so `regionMap.has("de")` is **true** and a `has()`-gated rule would never fire. That's the entire bug: `/de/products/<handle>` serves a live, indexable, EUR-priced duplicate today.
- [ ] GREEN vitest; `npx next build`. Smoke: `/de/store` → 301 `/us/store`; `/us/store` → 200 untouched; `/store` → the existing 307. Commit `fix(WB-095): 301 non-default region prefixes into /us (X2)`.

---

### Task 5: Product + BreadcrumbList JSON-LD on the PDP
**Files:** new `modules/product-detail/components/structured-data/` + test; `modules/product-detail/templates/index.tsx`.
- [ ] Failing test: a pure `productJsonLd(product)` → `@type: "Product"` with name/brand/image and `offers` carrying `priceCurrency: "USD"`, price as **major units** (`priceCents / 100` — the dollars-in-Medusa / cents-in-the-index split is a documented trap), and availability mapped from the existing stock state; `breadcrumbJsonLd(...)` emits positions starting at a synthesized **Home** crumb.
- [ ] RED → implement: render both as `<script type="application/ld+json">` in the PDP template. Both breadcrumb components (wheel + tire) omit a Home root, so synthesize it rather than reusing their segment arrays verbatim. PDP only.
- [ ] GREEN vitest; `npx next build`. Smoke: a PDP's `<head>` carries valid `Product` + `BreadcrumbList`. Commit `feat(WB-095): Product + BreadcrumbList JSON-LD on the PDP`.

---

### Task 6: X3 — env guards + honest sitemap
**Files:** `check-env-variables.js` (~3-10 — `requiredEnvs` is one element), `app/sitemap.ts`, `app/robots.ts`, `lib/util/env.ts` (~1-3).
- [ ] Failing test: a pure `isFallbackBaseUrl(url)` → true for the `https://localhost:8000` fallback.
- [ ] RED → implement: `requiredEnvs` gains `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_SEARCH_ENDPOINT`, `NEXT_PUBLIC_SEARCH_API_KEY`. Belt and braces: `sitemap.ts` + `robots.ts` detect the fallback base URL, `console.error` loudly, and emit **statics-only** rather than publish loopback URLs. `sitemap.ts` gains `lastModified` from the indexed `created_at` **only if the returned doc carries one — otherwise OMIT the field**; never stamp `new Date()`, which would tell crawlers every URL changed on every deploy. If `created_at` isn't in the Meili `displayedAttributes`, omit and say so in the commit body — a settings change needs a backend restart and is out of scope here.
- [ ] GREEN vitest; `npx next build` with the env present (exit 0) **and** a scratch run with `NEXT_PUBLIC_BASE_URL` unset → fails with a named error. Commit `feat(WB-095): require the four load-bearing env vars, statics-only sitemap on a fallback base URL (X3)`.

---

### Task 7: Chunk review
- [ ] `scripts/review-package <base> HEAD` → an **opus** reviewer (SEO mistakes are silently permanent — a wrong canonical or a redirect loop is discovered by Google, not by us). Focus: (a) **the region 301 — is it truly independent of `regionMap`, and can it loop** (a `/de` → `/us` rule that fires on `/us` is an infinite redirect); (b) do the three metadata routes actually survive the matcher — verify against the regex, don't take the diff's word; (c) is any canonical relative, or pinned to the *request's* country code instead of `us`; (d) JSON-LD price units (cents vs dollars) and availability honesty; (e) does the env check break `build:next`; (f) is `lastModified` fabricated anywhere.
