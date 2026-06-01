# Master Plan — Wheels & Tires Store: Fitment + Garage + Live Import

> **For agentic workers:** This is an INDEX plan. It sequences three self-contained sub-plans, each of which produces working, testable software on its own. Execute them in the recommended order below. Each sub-plan carries its own task-by-task checklist; use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans per sub-plan.

**Goal:** Take the project from "garage works, but the headline fitment feature is dead-on-arrival and CSV import is a local-sample demo" to "import live vendor inventory over SFTP, build a garage, and have the catalog filter to the selected vehicle" — end to end, backend to frontend. (Checkout remains out of scope.)

**Why these three, in this order:** A 2026-06-01 multi-agent audit of `main` found the `feat/wheel-size-fitment-garage` work merged (commit `b9b2067`) with all three pillars coded but at very different maturity. The single highest-leverage fix is a one-line response-envelope bug that silently starves the entire fitment chain — so fitment goes first. Garage hardening is independent and low-risk. The live SFTP importer is the largest, net-new piece and depends on nothing else, so it goes last.

---

## The three sub-plans

| # | Plan | File | What it fixes | Pillar after |
|---|---|---|---|---|
| 1 | **Fitment end-to-end** | [`2026-06-01-plan-1-fitment-end-to-end.md`](./2026-06-01-plan-1-fitment-end-to-end.md) | The response-envelope bug that kills vehicle→catalog filtering; 500s when wheel-size is unconfigured; undocumented env; dead FITS badge | Fitment: **dead → working** |
| 2 | **Garage hardening** | [`2026-06-01-plan-2-garage-hardening.md`](./2026-06-01-plan-2-garage-hardening.md) | DB-level single-active; create-invariant + body validation; merge-on-login duplicate-row race | Garage: **~88% → solid** |
| 3 | **Live vendor SFTP feed** | [`2026-06-01-plan-3-live-vendor-sftp-feed.md`](./2026-06-01-plan-3-live-vendor-sftp-feed.md) | No remote retrieval (reads a committed sample CSV); dead `feedPath` knob; no delta detection | CSV import: **sample demo → live feed** |

### Recommended execution order

1. **Plan 1 first.** It is the highest ROI in the codebase — one line reanimates an otherwise fully-wired, unit-tested chain — and it unblocks meaningful end-to-end testing of the whole product. Its Task 5 smoke test exercises the catalog (which Plan 3 later feeds), so doing it first surfaces any data/index gaps early.
2. **Plan 2 second.** Independent of the others; ships garage correctness. Can also be done in parallel with Plan 1 by a separate worker (no shared files).
3. **Plan 3 last.** Largest and net-new. It changes only the *source* of the CSV; everything it feeds (`stage → diff → apply → index`) is already covered, and Plan 1 will have validated that downstream path.

### Dependencies between plans

- **None are hard-blocking.** The three touch disjoint files (Plan 1: fitment route + discovery + data layer; Plan 2: customer-vehicle + garage providers; Plan 3: vendor-sync feed-source). They can be branched independently.
- **Soft dependency:** a *complete* manual end-to-end demo (pick a vehicle → see filtered, freshly-imported wheels) needs Plan 1 (the fix) **and** real data in the catalog (Plan 3, or a one-off `vendor-sync:apply` against the existing sample CSV). Plan 1's Task 5 documents how to seed the sample CSV without Plan 3.

---

## Shared context every sub-plan assumes

These facts come from the audit and the code; each sub-plan relies on them.

- **Branch state:** the fitment/garage work is on `main` (`b9b2067`). Start each sub-plan from a fresh branch off `main`.
- **Two apps, two installs, two test runners.** Backend: Jest (`@swc/jest`) — run a file with `npx jest <path>` from `backend/`; the wired scripts are `pnpm test:sync` (vendor-sync) and `pnpm test:fitment` (wheel-size + customer-vehicle). Storefront: Vitest — `npx vitest run <path>` from `storefront/`; wired as `pnpm test:unit`. `zod` is already a backend dependency.
- **The price-unit convention is settled** (fixed in `4d281d3`): Medusa catalog stores **dollars**, the Meilisearch index stores **integer cents**. Do not reintroduce a `×100` at the catalog source. (The old "100× too high" bug is gone.)
- **The fitment join key is correct and shared.** `canonicalBoltPatterns` is imported by BOTH the index transformer (`build-search-document.ts`) and the resolve-side normalizer (`wheel-size/normalize.ts`) — they cannot drift. The index field `bolt_patterns_canonical` is already `displayed` + `filterable` in `medusa-config.js`. The break was never the key; it was the response envelope (Plan 1, Task 1).
- **Three subsystems gate a working fitment demo:** Meilisearch (`MEILISEARCH_HOST` + `MEILISEARCH_ADMIN_KEY`), vendor-sync (`VENDOR_WHEELPROS_WHEELS_ENABLED` + an apply), and wheel-size (`WHEEL_SIZE_API_KEY`). Plan 1 Task 3 + Plan 3 Task 9 document them in `.env.template`.
- **Stale-config trap:** after changing `medusa-config.js` or env, `rm -rf backend/.medusa/server` before restarting.
- **`MedusaService` update takes a single object:** `update...({ id, ...fields })`, never `(selector, update)`.

---

## Combined "definition of done"

After all three sub-plans, a fresh deploy with the three subsystems configured should let a user:

1. **Import** — the 12-hour cron pulls the newest CSV from the vendor SFTP server, skips it if unchanged, and applies new/changed/discontinued wheels into the catalog (Plan 3).
2. **Build a garage** — guest or logged-in, with persistence, single active vehicle (DB-enforced), and no duplicate rows on login (Plan 2).
3. **Filter by vehicle** — picking a vehicle resolves its bolt patterns and filters the catalog to fitting wheels, with per-card FITS badges (Plan 1).

**Final combined smoke** (run after all three): follow Plan 1 Task 5, but in Step 1 configure the SFTP source from Plan 3 instead of the sample CSV. Confirm: live file fetched → wheels in catalog → pick a vehicle → `?fit=` set → grid filtered → FITS badges on matching cards.

---

## Explicitly deferred (candidate "Plan 4+", NOT in scope here)

The audit surfaced these; they are real but lower priority and intentionally left out so the three plans stay shippable:

- **Admin dashboard UI for vendor-sync** — runs are API/CLI-only today (`backend/src/admin/` has only boilerplate). A widget to list/approve/cancel/replay runs, and making the manual trigger endpoint asynchronous (it currently runs synchronously in the request and would time out on a large feed).
- **PDP "N confirmed models" list + per-size fit badging** — `product.fitment` is hardcoded `[]`; populating it needs a reverse-fitment dataset (which vehicles fit this wheel) we do not have cheaply. The PDP active-vehicle *status band* already works and is untouched.
- **Durable feed archiving** — `archiveFeed` writes to local `static/vendor-feeds` (ephemeral on Railway); the configured `archiveBucket` (object storage) is unused.
- **Catalog cache warming / TTL** — the first storefront user is the canary for any wheel-size outage; `fetched_at` is stored but never read for expiry.
- **Tire grouping** — tires remain one-product-per-row; wheels group into N-variant products. Most sample tire rows are also image-less and filtered at staging.
- **wheel-size live-slug verification** — everything is validated against local fixtures; no test proves the catalog dropdown slugs resolve against the live `by_model` endpoint.

---

## How to execute

Pick a sub-plan, create a branch, and drive it task-by-task. For each:

**Option 1 — Subagent-Driven (recommended):** dispatch a fresh subagent per task, review between tasks (`superpowers:subagent-driven-development`).

**Option 2 — Inline:** execute tasks in-session with checkpoints (`superpowers:executing-plans`).

Suggested branches: `fix/fitment-end-to-end` (Plan 1), `fix/garage-hardening` (Plan 2), `feat/vendor-sftp-feed` (Plan 3).
