# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

A two-app monorepo (no workspaces tool — each app has its own `package.json` and `pnpm-lock.yaml`):

- `backend/` — MedusaJS 2.13.6 server + admin dashboard (port 9000, admin at `/app`)
- `storefront/` — Next.js 15 storefront (port 8000, App Router + React 19)

The two apps are deployed as separate Railway services. Always `cd` into the relevant app before running scripts — there is no root `package.json`.

Node 22.x / pnpm 9.10 (declared in `backend/package.json`). Storefront has no engines pin but is developed against the same.

## Common commands

### Backend (`cd backend/`)
- `pnpm dev` — start backend + admin in dev mode (`medusa develop`)
- `pnpm ib` — **i**nit **b**ackend: runs migrations and seeds required system data. Run this once against a fresh database before `dev` will work. Wraps `medusajs-launch-utils`' `init-backend` binary.
- `pnpm seed` — re-runs `src/scripts/seed.ts` only (no migrations). The seed creates default region, sales channel, stock location, demo products, etc. — edit this file to change initial data.
- `pnpm build` — `medusa build` then `node src/scripts/postBuild.js` (postBuild copies `package.json` and `pnpm-lock.yaml` into `.medusa/server` so the built server can install its own deps).
- `pnpm start` — runs `init-backend` then `cd .medusa/server && medusa start`. Used in production; reproduces Railway behavior locally.
- `pnpm email:dev` — react-email preview server on port 3002 for `src/modules/email-notifications/templates`.
- No `lint` or `test` script is wired up here, despite `jest` + `@medusajs/test-utils` being in devDependencies.

### Storefront (`cd storefront/`)
- `pnpm dev` — `await-backend` (polls backend until reachable) then `launch-storefront dev`. Both wrappers come from `medusajs-launch-utils`; storefront will block until the backend is up.
- `pnpm build:next` — raw `next build`, bypassing the `await-backend` wait. Use when iterating on storefront-only build issues without a running backend.
- `pnpm build` — production build with backend wait
- `pnpm lint` — `next lint` (eslint 9)
- `pnpm test-e2e` — Playwright tests in `e2e/`; config in `playwright.config.ts`
- `pnpm analyze` — `ANALYZE=true next build` for bundle analyzer

There is no unit-test runner in either app — `test-e2e` (Playwright) is the only test script.

## Environment

Both apps require env files copied from templates before they will run:
- `backend/.env.template` → `backend/.env`
- `storefront/.env.local.template` → `storefront/.env.local`

Backend reads env via `src/lib/constants.ts`. **Required:** `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET` (the file calls `assertValue` and will crash on startup if missing). Everything else (Redis, MinIO, Stripe, Resend, SendGrid, Meilisearch) is optional and triggers conditional module registration.

`BACKEND_URL` falls back through `BACKEND_PUBLIC_URL` → `RAILWAY_PUBLIC_DOMAIN_VALUE` → `http://localhost:9000`. Railway sets `RAILWAY_PUBLIC_DOMAIN_VALUE` automatically.

Storefront env vars are validated at build/start by `storefront/check-env-variables.js`, invoked from `next.config.js`.

## Backend architecture

### Conditional module loading (`backend/medusa-config.js`)
This is the load-bearing file. It registers Medusa modules **conditionally** based on which env vars are set:

- **File storage** — MinIO if `MINIO_ENDPOINT` + `MINIO_ACCESS_KEY` + `MINIO_SECRET_KEY` are set, otherwise `@medusajs/file-local` writing to `static/`. MinIO module lives at `src/modules/minio-file/`.
- **Event Bus + Workflow Engine** — Redis-backed if `REDIS_URL` is set, otherwise Medusa's simulated in-memory versions (development only — Railway always sets Redis).
- **Notifications** — Sendgrid and/or Resend providers are added only if their `*_API_KEY` and `*_FROM_EMAIL` are both set. The Resend provider is custom-built at `src/modules/email-notifications/`.
- **Payments** — Stripe provider added only if `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET` are set.
- **Plugins** — Meilisearch plugin (`@rokmohar/medusa-plugin-meilisearch`) added only if `MEILISEARCH_HOST` + `MEILISEARCH_ADMIN_KEY` are set; product index settings are configured inline.

When debugging "why isn't X working in production but works locally" issues, check whether the env vars to activate that module are actually set in the target environment.

### Custom modules
- `src/modules/email-notifications/` — Resend-backed notification provider that renders react-email templates. To add a new template: create the component under `templates/`, add its key to the `EmailTemplates` enum, and add a case to `generateEmailTemplate`. See the module README for the full four-step recipe.
- `src/modules/minio-file/` — File provider for MinIO. Auto-creates the bucket (`medusa-media` by default) and sets public-read policy on startup. Files are stored under ULID-generated names.

### Subscribers (`src/subscribers/`)
- `order-placed.ts` — sends order confirmation email via `notificationModuleService`
- `invite-created.ts` — sends invite email when a new admin user is invited

When editing email flows, the subscriber is what triggers `createNotifications`; the template key passed there must match an `EmailTemplates` enum entry.

### API routes (`src/api/`)
Medusa 2.0 uses file-based routing. Custom routes live under `src/api/{admin,store,key-exchange}/.../route.ts`. The `key-exchange` route is a custom (non-admin, non-store) endpoint.

### Path resolution
`tsconfig.json` sets `paths: { "*": ["./src/*"] }`, so imports like `import { ... } from 'lib/constants'` resolve to `src/lib/constants.ts`. Don't use `@/` prefixes here — they won't resolve.

### Worker mode
`WORKER_MODE` env (`'server' | 'worker' | 'shared'`, default `'shared'`) controls whether this process runs HTTP, background jobs, or both. Railway can split these into separate services.

## Storefront architecture

### Routing — `[countryCode]` is mandatory
Every page lives under `src/app/[countryCode]/...`. The country code is enforced by `src/middleware.ts`, which runs on (almost) every request and redirects users without one to the appropriate region. Resolution order: Vercel IP header → `NEXT_PUBLIC_DEFAULT_REGION` → first region returned by the Medusa server.

Two route groups (do not affect the URL):
- `(checkout)` — separate layout for the checkout flow
- `(main)` — everything else (`account`, `cart`, `products`, `categories`, `collections`, `order`, `search`, `store`, `results`)

When adding a page, place it inside the right route group so it inherits the right layout. When working with `countryCode`, get it from `params` in server components or `useParams()` in client components.

### Data layer (`src/lib/data/`)
All Medusa API calls go through functions here (carts, orders, customers, regions, products, etc.). These functions are called from Server Actions inside `src/modules/*/actions.ts`. Don't call the Medusa JS SDK directly from components — go through the data layer.

### Modules vs app
- `src/app/` — routes and layouts only
- `src/modules/` — components, templates, and section-scoped Server Actions, organized by feature (cart, checkout, products, etc.)

### Search
`src/lib/search-client.ts` is wired to MeiliSearch by default but uses Algolia's `react-instantsearch-hooks-web`, so swapping providers means only changing the client. Search backend matches whatever the backend's Meilisearch plugin indexes — see `backend/medusa-config.js` plugin block for the `products` index schema.

### Build pragmatics
`next.config.js` sets `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true`. Type/lint errors will **not** fail the build — run `pnpm lint` and `tsc` separately if you want to catch them. `images.unoptimized: true` is set; remote patterns are dynamically built from `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, and `NEXT_PUBLIC_MINIO_ENDPOINT`.

## Gotchas

- **`.medusa/server` is a stale-config trap.** Medusa caches built config and env there. After changing `medusa-config.js` or env vars (especially bucket name, module options), `rm -rf backend/.medusa/server` before restarting or production behavior will diverge from your changes. The minio-file README explicitly calls this out.
- **Backend must run before storefront dev works** — `await-backend` in the storefront's `dev` script will block indefinitely until the backend responds on port 9000.
- **Seed runs only via `pnpm seed` or as part of `pnpm ib`.** `pnpm dev` does not seed. A fresh DB without `ib` will start but have no regions/sales-channels/products.
- **Two separate `pnpm install`s.** No root workspace — `pnpm install` at the repo root does nothing. Install per app.
- **Storefront uses React 19, backend admin uses React 18.** Don't try to share components between them.
