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
- `pnpm test:sync` — jest unit tests for `src/modules/vendor-sync` (~4s, no DB). The only test script wired up; no top-level `test` or `lint`.

#### Vendor-sync scripts (manual control over the inventory pipeline)
- `pnpm vendor-sync:dry-run <vendor>` — fetch + stage + diff for `wheelpros-wheels` or `wheelpros-tires`. No Medusa mutations. Prints a summary and a run id.
- `pnpm vendor-sync:apply <run-id>` — apply a previously dry-run-staged run to Medusa. Re-computes the diff against current state first.
- `pnpm exec medusa exec ./src/scripts/vendor-sync-cleanup.ts` — release a stuck in-progress run guard by marking non-terminal runs as `failed`.
- `pnpm exec medusa exec ./src/scripts/vendor-sync-backfill-inventory.ts` — one-shot recovery for products created before the `inventory_item_id` extraction fix; re-applies stock for affected SKUs. See [`vendor-sync-implementation`](docs/reference/vendor-sync-implementation.md).
- `pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts` — dev-only reset for vendor-sync state (clears `vendor_feed_run`, `vendor_feed_staging`, `vendor_stock_staging`, `vendor_product_current` for both vendors). Refuses to act without `-- --confirm-host=<DATABASE_URL host>` so a copy-paste from history cannot run it against the wrong DB. Does NOT delete Medusa products.

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
- **Plugins** — Meilisearch plugin (`@rokmohar/medusa-plugin-meilisearch`) added only if `MEILISEARCH_HOST` + `MEILISEARCH_ADMIN_KEY` are set. The `products` index `settings` block is wired inline with: a `transformer` (`buildSearchDocument` from `src/modules/vendor-sync/search/`), widened `fields` (variants.sku, variants.metadata, variants.prices.*, metadata, created_at) so the transformer sees what it needs, plus `filterableAttributes` / `sortableAttributes` / `searchableAttributes` / `displayedAttributes` tuned for the faceted wheel discovery surface. The transformer falls back to a minimal `{ id, product_type: "non-wheel" }` doc rather than returning null, because the plugin coalesces a falsy transformer result to its own default transformer (`?? defaultTransformer`) which would otherwise silently mis-index non-wheels.
- **Vendor sync** — `src/modules/vendor-sync/` loads only if `VENDOR_WHEELPROS_WHEELS_ENABLED=true` OR `VENDOR_WHEELPROS_TIRES_ENABLED=true`. Registers two adapter instances (one per feed). The `vendors` option block in `medusa-config.js` is the source of truth for which adapters are wired and where their feed files live.

When debugging "why isn't X working in production but works locally" issues, check whether the env vars to activate that module are actually set in the target environment.

### Custom modules
- `src/modules/email-notifications/` — Resend-backed notification provider that renders react-email templates. To add a new template: create the component under `templates/`, add its key to the `EmailTemplates` enum, and add a case to `generateEmailTemplate`. See the module README for the full four-step recipe.
- `src/modules/minio-file/` — File provider for MinIO. Auto-creates the bucket (`medusa-media` by default) and sets public-read policy on startup. Files are stored under ULID-generated names.
- `src/modules/vendor-sync/` — Inventory sync pipeline that pulls CSV feeds from the WheelPros distributor, diffs against the last applied state, and writes products + per-warehouse inventory levels into Medusa. Two adapter instances ship today: `wheelpros-wheels` and `wheelpros-tires`. Architecture: four MikroORM tables (`vendor_feed_run`, `vendor_feed_staging`, `vendor_stock_staging`, `vendor_product_current`), a `VendorAdapter` interface with discriminated-union `NormalizedRecord` (wheel | tire), a sequential per-process apply loop wrapped in try/catch **per product group** (not per part_number — see grouping note below), and Medusa 2.0 core flows for every catalog mutation. Runs every 12 hours via the cron at `src/jobs/vendor-sync-tick.ts`. Image-less rows are filtered at staging (vendor CDN images pass through to `thumbnail`). For the full picture, read [`vendor-sync-implementation`](docs/reference/vendor-sync-implementation.md).
  - **Grouping (wheels only).** Multiple CSV rows that share `Brand + DisplayStyleNo + Finish` collapse into ONE Medusa product with N variants, where the variant axes are Bolt Pattern, Diameter, Width, and Offset. The `group_key` column on `vendor_feed_staging` and `vendor_product_current` is what carries this relationship. Rows with empty `DisplayStyleNo` fall back to a per-SKU key (`sku:<partNumber>`) so unrelated rows from the same brand never merge. Tires keep one-product-per-row until a tire grouping rule is defined; the `productType === 'wheel'` discriminator routes records to the grouping path.
  - **Bugs found during initial verification** are in the git log: `inventory_item_id` extraction, discontinue metadata read, cooperative cancellation, axis-collision handling — those are the regression classes the integration-test scaffold targets.
  - **Search subdir (`src/modules/vendor-sync/search/`).** Home of the Meilisearch transformer for wheels: `bolt-pattern-canonical.ts` (pure `canonicalBoltPatterns(input)` → `["{count}x{pcd_mm}"]`, snaps to nearest standard PCD — this is the fitment join key with wheel-size.com), `normalize-finish.ts` (pure `normalizeFinish(raw)` → `"black"|"bronze"|"silver"`, precedence: bronze > black-dominance > silver > black default), and `build-search-document.ts` (`buildSearchDocument(product)` → flat indexed `WheelSearchDocument` or `null` for non-wheels; `price_min`/`price_max` are INTEGER CENTS via `Math.round(major*100)`). `medusa-config.js` calls `buildSearchDocument` from the plugin `transformer`. NOTE: `normalize-finish.ts` has a byte-equivalent twin on the storefront PDP (`storefront/src/modules/product-detail/data/get-product.ts`) — keep them in lockstep.

### Subscribers (`src/subscribers/`)
- `order-placed.ts` — sends order confirmation email via `notificationModuleService`
- `invite-created.ts` — sends invite email when a new admin user is invited

When editing email flows, the subscriber is what triggers `createNotifications`; the template key passed there must match an `EmailTemplates` enum entry.

### Scheduled jobs (`src/jobs/`)
- `vendor-sync-tick.ts` — cron `0 */12 * * *`. Iterates enabled vendor adapters (from `vendor-sync` module options) and calls `service.run(vendorCode)` for each in series with an in-progress guard per vendor. Idempotent: same feed = no-op via the RunDate short-circuit.

### API routes (`src/api/`)
Medusa 2.0 uses file-based routing. Custom routes live under `src/api/{admin,store,key-exchange}/.../route.ts`. The `key-exchange` route is a custom (non-admin, non-store) endpoint. The vendor-sync module also adds its own admin routes under `src/api/admin/vendor-sync/` (list runs, run detail, approve, cancel, replay run, replay SKU).

### Path resolution
`tsconfig.json` sets `paths: { "*": ["./src/*"] }`, so imports like `import { ... } from 'lib/constants'` resolve to `src/lib/constants.ts`. Don't use `@/` prefixes here — they won't resolve.

### Worker mode
`WORKER_MODE` env (`'server' | 'worker' | 'shared'`, default `'shared'`) controls whether this process runs HTTP, background jobs, or both. Railway can split these into separate services.

## Storefront architecture

### Routing — `[countryCode]` is mandatory
Every page lives under `src/app/[countryCode]/...`. The country code is enforced by `src/middleware.ts`, which runs on (almost) every request and redirects users without one to the appropriate region. Resolution order: Vercel IP header → `NEXT_PUBLIC_DEFAULT_REGION` → first region returned by the Medusa server.

Two route groups (do not affect the URL):
- `(checkout)` — separate layout for the checkout flow
- `(main)` — everything else (`account`, `cart`, `products`, `categories`, `collections`, `order`, `store`). The legacy `search` + `results/[query]` routes were retired once Discovery moved to Meilisearch — search-drawer entry points now route to `/<countryCode>/store?q=<query>`.

When adding a page, place it inside the right route group so it inherits the right layout. When working with `countryCode`, get it from `params` in server components or `useParams()` in client components.

### Data layer (`src/lib/data/`)
All Medusa API calls go through functions here (carts, orders, customers, regions, products, etc.). These functions are called from Server Actions inside `src/modules/*/actions.ts`. Don't call the Medusa JS SDK directly from components — go through the data layer.

### Modules vs app
- `src/app/` — routes and layouts only
- `src/modules/` — components, templates, and section-scoped Server Actions, organized by feature (cart, checkout, products, etc.)

### Discovery (Meilisearch) and PDP (Medusa Store API)
Two distinct read surfaces, by design (Spec §7 — D5 "live price/stock contract"):

- **Discovery (faceted search + listing)** reads from Meilisearch server-side via `storefront/src/lib/meilisearch.ts` (`import "server-only"`, pinned to `meilisearch@0.51.0`). `storefront/src/modules/discovery/data/get-products.ts` issues a `multiSearch` with disjunctive facets — one hits query + one facet query per dimension in `FACET_FIELDS`, each counted with the OTHER filters applied — and always scopes to `product_type = "wheel"`. The adapter swallows Meilisearch failures and returns an empty `DiscoveryResult`. `DiscoveryQuery.vehicleConstraint?: string[]` is the seam Spec 2 fills with wheel-size.com fitment clauses.
- **PDP** reads live from the Medusa Store API via the storefront data layer (`storefront/src/modules/product-detail/data/get-product.ts`) so price and stock are always fresh. Variants collapse to a Diameter × Width grid; sibling offsets accumulate as `offsetVariants` and drive best-of-siblings availability + per-offset pricing. `notFound()` propagates through `generateMetadata` and the page.
- The legacy `src/lib/search-client.ts` (Algolia `react-instantsearch-hooks-web` shim) is no longer the discovery path; Discovery is server-rendered.

### Build pragmatics
`next.config.js` sets `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true`. Type/lint errors will **not** fail the build — run `pnpm lint` and `tsc` separately if you want to catch them. `images.unoptimized: true` is set; remote patterns are dynamically built from `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, and `NEXT_PUBLIC_MINIO_ENDPOINT`.

## Gotchas

- **`.medusa/server` is a stale-config trap.** Medusa caches built config and env there. After changing `medusa-config.js` or env vars (especially bucket name, module options), `rm -rf backend/.medusa/server` before restarting or production behavior will diverge from your changes. The minio-file README explicitly calls this out.
- **Backend must run before storefront dev works** — `await-backend` in the storefront's `dev` script will block indefinitely until the backend responds on port 9000.
- **Seed runs only via `pnpm seed` or as part of `pnpm ib`.** `pnpm dev` does not seed. A fresh DB without `ib` will start but have no regions/sales-channels/products.
- **Two separate `pnpm install`s.** No root workspace — `pnpm install` at the repo root does nothing. Install per app.
- **Storefront uses React 19, backend admin uses React 18.** Don't try to share components between them.
- **`pnpm` may not be on the system PATH on Windows.** When that happens, use `npx -y pnpm@9.10.0 <cmd>` for one-offs or invoke the Medusa CLI directly via `backend/node_modules/.bin/medusa.CMD`. The Medusa CLI is what wraps migrations, scripts, and the dev server.
- **`MedusaService` update/create signatures take a single object, not (selector, update).** `service.updateVendorFeedRuns({id, ...fields})`, NOT `service.updateVendorFeedRuns({id}, {fields})`. The two-arg form compiles but silently fails to persist in 2.13.6. This pattern bit the vendor-sync work; if you see "updates aren't sticking," check the call shape first.
- **`createProductsWorkflow` does NOT eagerly populate `variant.inventory_items`.** To get the `inventory_item_id` of a freshly-created variant, call `query.graph({ entity: "variant", fields: ["inventory_items.inventory_item_id"], filters: { id: [variant.id] } })`. The variant returned in the workflow result has the field but it's always `undefined`. See [`backend/src/modules/vendor-sync/pipeline/apply.ts`](backend/src/modules/vendor-sync/pipeline/apply.ts) for the working pattern.
- **MikroORM emits a `.snapshot-railway.json` (~1 MB) inside any module's `migrations/` folder on `db:migrate`.** That full-DB snapshot is gitignored in `backend/.gitignore`. Module-scoped snapshots (`.snapshot-<module-name>-module.json`) ARE tracked because they belong to this repo and gate `medusa db:generate` drift detection.
- **Vendor-sync writes to a real Medusa catalog.** It is loaded conditionally on `VENDOR_WHEELPROS_*_ENABLED` env vars, and the apply step creates products, brand collections, categories, and stock locations in whatever DB `DATABASE_URL` points at. Always verify your `.env` target before running `pnpm vendor-sync:apply`.
- **Price-unit convention — dollars in Medusa, cents in Meilisearch.** Vendor-sync writes MSRP in MAJOR UNITS (dollars, e.g. `369.99`) onto Medusa `prices.amount` — that is what Medusa v2 + cart/checkout/order-emails expect. `buildSearchDocument` then converts to INTEGER CENTS (`Math.round(major*100)`) for the index `price_min` / `price_max` — the storefront `DiscoveryProduct.priceCents` contract. PDP reads live `calculated_amount` (dollars) and multiplies by 100 to land in the same cents space; `DiscoveryProductCard` divides `priceCents` by 100 for display. If you touch prices in `vendor-sync/pipeline/apply.ts`, `build-search-document.ts`, or the PDP loader, keep this dollars-in-Medusa / cents-in-the-index split intact or the two surfaces will disagree.
