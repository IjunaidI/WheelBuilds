# Wheel Builds — a fitment-aware wheels & tires commerce platform

> A production-grade headless commerce build: **MedusaJS 2.0** backend + **Next.js 15** storefront, extended with a live distributor-inventory pipeline, a vehicle-fitment engine, and a faceted product-discovery surface. Deployed as separate services on **Railway**.

<p align="left">
  <img alt="MedusaJS" src="https://img.shields.io/badge/Medusa-2.13.6-7C53FF?logo=medusa&logoColor=white">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-MikroORM-4169E1?logo=postgresql&logoColor=white">
  <img alt="Meilisearch" src="https://img.shields.io/badge/Meilisearch-faceted%20search-FF5CAA?logo=meilisearch&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-events%20%2B%20workflows-DC382D?logo=redis&logoColor=white">
  <img alt="Railway" src="https://img.shields.io/badge/Railway-deploy-0B0D0E?logo=railway&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-3.x-06B6D4?logo=tailwindcss&logoColor=white">
</p>

---

## What this is

**Wheel Builds** is a domain-specific e-commerce application for selling automotive wheels and tires. It started from the open-source [`medusajs-2.0-for-railway-boilerplate`](#credits) and was extended into a full product with three custom backend subsystems and a from-scratch storefront design.

The hard problem in this domain isn't the storefront — it's the data. Wheel catalogs arrive as messy distributor feeds, "will this wheel fit my car?" is a non-trivial join, and price/stock have to stay live while search stays fast. This project solves all three:

- **Live inventory, not a static seed.** A `vendor-sync` pipeline pulls CSV feeds from the WheelPros distributor over **SFTP**, diffs them against the last-applied state, and writes products + per-warehouse stock into Medusa on a 12-hour cron — with delta detection that no-ops on unchanged feeds.
- **Fitment as a first-class feature.** A `wheel-size` module + customer **garage** lets a shopper pick a Year/Make/Model and have the catalog filter to wheels that actually bolt up, using a canonical bolt-pattern join key shared byte-for-byte between the index and the resolver.
- **Two purpose-built read surfaces.** Faceted **discovery** is served from Meilisearch (fast, disjunctive facets); the **product detail page** reads live from the Medusa Store API so price and stock are never stale.

The result is a build that looks like a real storefront on the surface and reads like a real platform underneath.

---

## Why it's interesting (the engineering)

| Theme | What was built |
|---|---|
| **Distributor inventory pipeline** | Four MikroORM staging tables, a `fetch → stage → diff → apply` flow with a **dry-run / apply** split, per-product-group transactional isolation, an idempotent cron with an in-progress guard, and SFTP delta detection via `source_modify_time`. |
| **Domain data modeling** | Multiple CSV rows collapse into one product with N variants keyed on `Brand + Style + Finish`; variant axes are Bolt Pattern × Diameter × Width × Offset. Bolt patterns snap to canonical PCD values to form a stable fitment join key. |
| **Dual read-surface design** | A deliberate **dollars-in-the-catalog / integer-cents-in-the-index** unit convention, with lockstep normalizers (finish, bolt-pattern) guarded against drift by shared golden-fixture tests. |
| **Conditional, env-driven modules** | Storage (MinIO/local), event bus + workflow engine (Redis/in-memory), payments (Stripe), email (Resend/SendGrid), search (Meilisearch), and the vendor pipeline all register **conditionally** based on which env vars are present — one config file, many deployment shapes. |
| **Bespoke design system** | A custom "garage / blueprint" storefront aesthetic layered on **shadcn/ui headless primitives** (Radix + Vaul + cmdk) for accessibility and motion, skinned to a scoped token palette. |
| **Discipline** | Plan-driven development, a multi-agent pre-deploy audit, and a green test suite (**178 backend + 25 storefront** unit tests at last count) across two independent test runners. |

### Architecture at a glance

```
  WheelPros distributor                 BACKEND — MedusaJS 2.0  (port 9000, admin at /app)
  ──────── SFTP / CSV ────────▶  ┌────────────────────────────────────────────────┐
                                 │  vendor-sync:  fetch → stage → diff → apply      │
                                 │       │                            │             │
  wheel-size.com (fitment API) ─▶│  wheel-size ──┐                    ▼             │
                                 │  customer-     ├─ fitment join → Medusa catalog  │
                                 │  vehicle       │                    │  (Postgres)│
                                 │  (garage)  ◀───┘                    ▼            │
                                 └─────────────────────────────── Meilisearch index ┘
                                                                       │
                                 STOREFRONT — Next.js 15 (port 8000)   │
                                 ┌─────────────────────────────────────┴──────────┐
                                 │  Discovery  ◀── Meilisearch (faceted, fast)      │
                                 │  PDP        ◀── Medusa Store API (live price/stk) │
                                 │  Garage     ◀── fitment constraint join          │
                                 └──────────────────────────────────────────────────┘
```

---

## Tech stack

**Backend** (`backend/` — MedusaJS 2.13.6, Node 22, pnpm)
- TypeScript · PostgreSQL via **MikroORM** · **Redis** (event bus + workflow engine) · **Meilisearch** (faceted search index)
- **MinIO** / S3-compatible object storage · **Stripe** payments · **Resend** + react-email + **SendGrid** notifications
- `papaparse` (CSV) · `ssh2-sftp-client` (SFTP feed pulls) · `zod` (validation) · `ulid`
- **Jest** (`@swc/jest`) for unit tests; file-based API routing; scheduled cron jobs; worker-mode split

**Storefront** (`storefront/` — Next.js 15, React 19)
- App Router + React Server Components · **TypeScript** · **Tailwind CSS 3** · **shadcn/ui** (Radix UI, Vaul, cmdk)
- `meilisearch` JS client (server-only discovery adapter) · **Medusa JS SDK** (live PDP) · Stripe.js / PayPal
- `next/font` (Antonio, JetBrains Mono, Inter) · **Playwright** (e2e) · **Vitest** (unit)

**Platform**
- **Railway** (backend, storefront, and optional worker as separate services) · two-app monorepo (no workspace tool — independent `package.json` + lockfile per app)

---

## Roadmap & future goals

The next milestone is the **combined live smoke test**: run the catalog-writing `apply` once to populate the production catalog, then verify the full loop end to end — *pick a vehicle → catalog filters to fitting wheels → FITS badges on matching cards → freshly imported stock*.

Beyond that, the deferred roadmap ("Plan 4+"):

- **Admin dashboard UI for vendor-sync** — runs are API/CLI-only today; surface list/approve/cancel/replay in the Medusa admin, and make the manual trigger asynchronous.
- **PDP reverse-fitment** — populate the "N confirmed models fit this wheel" list (needs a reverse-fitment dataset).
- **Durable feed archiving** — persist pulled feeds to object storage instead of ephemeral local disk.
- **Catalog cache warming / TTL** — read `fetched_at` for expiry so the first storefront visitor isn't the canary for a fitment-API outage.
- **Tire grouping** — tires are one-product-per-row today; apply the wheel-style N-variant grouping.
- **Checkout** — wire the checkout flow (currently out of scope) plus PDP add-to-cart / wishlist server actions.
- **Real product photography** — every photographic element is a placeholder today.

---

## Task list

Completed work and what's still open:

**Foundation**
- [x] Two-app Medusa 2.0 + Next.js monorepo, Railway-deployable
- [x] Conditional module loading (storage, events/workflows, payments, email, search, vendor-sync)
- [x] Resend + react-email notification provider; MinIO file provider

**Vendor inventory pipeline (`vendor-sync`)**
- [x] CSV ingest → staging tables → diff → apply into the Medusa catalog
- [x] Dry-run / apply split with re-computed diff and per-group transactional isolation
- [x] Wheels grouping (N variants per product) on Brand + Style + Finish
- [x] 12-hour idempotent cron with per-vendor in-progress guard
- [x] **Live SFTP feed** — pull newest remote file, delta-detect, skip unchanged *(dry-run verified)*
- [ ] First catalog-writing `apply` against production (not yet run end-to-end)
- [ ] Tire grouping (currently one-product-per-row)
- [ ] Admin dashboard UI for runs (API/CLI only today)

**Fitment & garage**
- [x] `wheel-size` module + canonical bolt-pattern join key (golden-fixture drift guards)
- [x] Customer **garage** — guest + logged-in, DB-enforced single-active vehicle, no duplicate rows on login
- [x] Vehicle → catalog filtering with per-card FITS badges (response-envelope bug fixed)
- [ ] PDP reverse-fitment "confirmed models" list

**Storefront**
- [x] Custom "garage / blueprint" design system on shadcn headless primitives
- [x] Home, nav, footer, search drawer (Cmd/Ctrl+K), fully responsive
- [x] **Discovery** `/store` — live faceted Meilisearch with disjunctive facet counts
- [x] **PDP** `/products/[handle]` — live from Medusa Store API (price + stock authoritative)
- [ ] Checkout flow + PDP add-to-cart / wishlist server actions
- [ ] Real product photography

**Quality**
- [x] 178 backend + 25 storefront unit tests green (Jest + Vitest); Playwright e2e scaffold
- [ ] Pre-deploy hardening pass (multi-agent audit findings) before first production deploy

---

## Quick start

Node 22.x / pnpm 9.10. The two apps install and run independently — there is **no root `package.json`**, so always `cd` into an app first.

### 1. Backend

```bash
cd backend
pnpm install
cp .env.template .env          # set DATABASE_URL, JWT_SECRET, COOKIE_SECRET (required)

pnpm ib                        # init backend: run migrations + seed system data (run once on a fresh DB)
pnpm dev                       # starts server + admin dashboard at http://localhost:9000/app
```

**Required env:** `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET` (the server crashes on startup if missing). Everything else — Redis, MinIO, Stripe, Resend/SendGrid, Meilisearch, the vendor pipeline, wheel-size — is **optional** and self-registers only when its env vars are present.

### 2. Storefront

```bash
cd storefront
pnpm install
cp .env.local.template .env.local

pnpm dev                       # waits for the backend on :9000, then serves http://localhost:8000
```

> The storefront `dev` script blocks until the backend answers on port 9000. For storefront-only iteration without a backend, use `pnpm build:next`.

### 3. (Optional) Run the inventory pipeline

```bash
cd backend
# enable a vendor in .env: VENDOR_WHEELPROS_WHEELS_ENABLED=true
pnpm vendor-sync:dry-run wheelpros-wheels    # fetch + stage + diff, no Medusa writes → prints a run id
pnpm vendor-sync:apply <run-id>              # apply a staged run into the catalog
```

⚠️ `apply` writes real products, collections, categories, and stock into whatever DB `DATABASE_URL` points at. Confirm your `.env` target first.

### Handy commands

| App | Command | Does |
|---|---|---|
| backend | `pnpm dev` | server + admin in dev mode |
| backend | `pnpm ib` | migrate + seed a fresh database (run once) |
| backend | `pnpm seed` | re-run the seed only |
| backend | `pnpm build && pnpm start` | production build + run from compiled source |
| backend | `pnpm test:sync` / `pnpm test:fitment` | vendor-sync / fitment unit tests |
| backend | `pnpm email:dev` | react-email template preview on :3002 |
| storefront | `pnpm dev` | storefront (waits for backend) |
| storefront | `pnpm lint` · `pnpm test-e2e` · `pnpm test:unit` | lint · Playwright · Vitest |

### One-click Railway deploy

The base boilerplate ships a one-click Railway template that provisions Postgres, Redis, MinIO, and Meilisearch automatically:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/medusajs-2136-storefront-new)

---

## Repository layout

```
.
├── backend/      MedusaJS 2.0 server + admin  (custom modules: vendor-sync, wheel-size,
│                 customer-vehicle, email-notifications, minio-file)
├── storefront/   Next.js 15 storefront        (custom "Wheel Builds" design system)
├── docs/         architecture specs + plan-driven development history
├── CLAUDE.md     deep architecture notes (backend, vendor-sync, env, Railway gotchas)
└── storefront/CLAUDE.md + DESIGN.md   storefront architecture + visual contract
```

For a deeper tour, read [`CLAUDE.md`](CLAUDE.md) (backend + pipeline), [`storefront/CLAUDE.md`](storefront/CLAUDE.md) (storefront), and [`vendor-sync-implementation`](docs/reference/vendor-sync-implementation.md) (the inventory pipeline in detail).

---

## Credits

Built on top of the open-source **[medusajs-2.0-for-railway-boilerplate](https://github.com/rpuls/medusajs-2.0-for-railway-boilerplate)** by [FUNKYTON](https://funkyton.com/) — which provides the Railway-ready Medusa 2.0 + Next.js monorepo, MinIO/Resend/Stripe/Meilisearch integrations, and deploy tooling. The Wheel Builds domain layer (vendor sync, fitment + garage, discovery, and the storefront design system) is built on top of that foundation.

[Medusa](https://medusajs.com) · [Next.js](https://nextjs.org) · [Railway](https://railway.app?referralCode=-Yg50p)
