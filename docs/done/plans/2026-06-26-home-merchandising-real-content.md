# Home & Merchandising — Real Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three fabricated home surfaces (Featured Blocks, Build Gallery, Newsletter) with real, honest content, and de-hardcode merchandising copy.

**Architecture:** Storefront sections read real catalog data (Featured = curated handles via Medusa Store API with a Meili top-priced fallback; Build Gallery → catalog-wall reusing the already-fetched home catalog). Newsletter persists to a new Medusa `newsletter` module (table + service + public `POST /store/newsletter`) called from a storefront server action. Merchandising copy moves to a config module. Logic lives in pure, unit-tested helpers; components/routes stay thin.

**Tech Stack:** MedusaJS 2.13.6 (backend module + store route, jest, zod), Next.js 15 / React 19 storefront (server components, vitest), Meilisearch (existing adapter), `@medusajs/js-sdk` (`sdk.client.fetch`).

## Global Constraints

- **No `wb-`/`WB`/`wheelbuilds-` prefix** on dirs, files, exports, or CSS classes (project naming rule).
- **Price-unit convention:** dollars in Medusa, integer cents in the index/`DiscoveryProduct.priceCents`. Display divides cents by 100. Do not change it.
- **`MedusaService` create/update take a single object**, e.g. `createNewsletterSubscriptions({ email, ... })` — never `(selector, update)`.
- **Storefront server components by default**; promote to `"use client"` only for state/handlers/browser APIs/client stores.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **`NEXT_PUBLIC_*` envs require a storefront rebuild to change** (note in `.env.local.template`; do not gate behavior on them being changeable at runtime).
- Branch: `feat/home-merchandising-real-content` (already created; spec committed there).
- Storefront tsc gate: **0 new errors** vs the 14 pre-existing on `main`. Build ignores type/lint errors, so run `npx tsc --noEmit` explicitly.
- Windows: `pnpm` may not be on PATH — use `npx -y pnpm@9.10.0 <cmd>` or `npx jest`/`npx vitest`/`npx tsc` directly.

---

## File Structure

**Backend (new):**
- `backend/src/modules/newsletter/index.ts` — module registration (`NEWSLETTER_MODULE`).
- `backend/src/modules/newsletter/models/newsletter-subscription.ts` — the table model.
- `backend/src/modules/newsletter/service.ts` — `subscribe()` (idempotent on email).
- `backend/src/modules/newsletter/lib/email.ts` — pure `normalizeEmail` / `isValidEmail`.
- `backend/src/modules/newsletter/__tests__/email.test.ts` — email-helper jest tests.
- `backend/src/modules/newsletter/__tests__/service.test.ts` — `subscribe` idempotency jest test.
- `backend/src/modules/newsletter/migrations/Migration20260626120000.ts` — hand-authored table create.
- `backend/src/api/store/newsletter/route.ts` — `POST` handler.
- `backend/src/api/store/newsletter/validators.ts` — zod body parser.

**Backend (modified):**
- `backend/medusa-config.js` — register the module.
- `backend/package.json` — add `test:newsletter` script.

**Storefront (new):**
- `storefront/src/lib/data/newsletter.ts` — `subscribeNewsletter(email)` data fn.
- `storefront/src/modules/home/actions.ts` — `newsletterSubscribe(email)` server action.
- `storefront/src/modules/home/data/select-featured.ts` — pure `selectFeatured()`.
- `storefront/src/modules/home/data/select-featured.test.ts` — vitest.
- `storefront/src/modules/home/data/get-featured.ts` — `getFeaturedProducts()` (server-only).
- `storefront/src/modules/home/data/merchandising.ts` — copy config.
- `storefront/src/modules/home/components/catalog-wall/index.tsx` — renamed from `build-gallery`.

**Storefront (modified):**
- `storefront/src/modules/home/components/featured-blocks/index.tsx` — real products.
- `storefront/src/modules/home/components/newsletter/index.tsx` — real persistence.
- `storefront/src/modules/home/components/trust-strip/index.tsx` — import config.
- `storefront/src/modules/home/components/hero/index.tsx` — import config.
- `storefront/src/app/[countryCode]/(main)/page.tsx` — `generateMetadata` + catalog-wall import.
- `storefront/.env.local.template` — document `NEXT_PUBLIC_FEATURED_HANDLES`.

**Storefront (removed):**
- `storefront/src/modules/home/components/build-gallery/` (renamed → catalog-wall).

---

## Task 1: Newsletter module (model + service + email helpers)

**Files:**
- Create: `backend/src/modules/newsletter/models/newsletter-subscription.ts`
- Create: `backend/src/modules/newsletter/index.ts`
- Create: `backend/src/modules/newsletter/service.ts`
- Create: `backend/src/modules/newsletter/lib/email.ts`
- Test: `backend/src/modules/newsletter/__tests__/email.test.ts`
- Test: `backend/src/modules/newsletter/__tests__/service.test.ts`
- Modify: `backend/package.json` (add `test:newsletter` script)

**Interfaces:**
- Produces: `NEWSLETTER_MODULE = "newsletterModuleService"`; `NewsletterService.subscribe(email: string, meta?: { country_code?: string | null; source?: string | null }): Promise<{ created: boolean }>`; `normalizeEmail(raw: string): string`; `isValidEmail(raw: string): boolean`.

- [ ] **Step 1: Write the failing email-helper test**

`backend/src/modules/newsletter/__tests__/email.test.ts`:
```ts
import { normalizeEmail, isValidEmail } from "../lib/email"

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com")
  })
})

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("a@b.co")).toBe(true)
    expect(isValidEmail("first.last@sub.domain.com")).toBe(true)
  })
  it("rejects missing @, missing dot, empty, spaces, double @", () => {
    expect(isValidEmail("no-at")).toBe(false)
    expect(isValidEmail("a@b")).toBe(false)
    expect(isValidEmail("")).toBe(false)
    expect(isValidEmail("a b@c.com")).toBe(false)
    expect(isValidEmail("a@@b.com")).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest src/modules/newsletter/__tests__/email.test.ts`
Expected: FAIL — cannot find module `../lib/email`.

- [ ] **Step 3: Implement the email helpers**

`backend/src/modules/newsletter/lib/email.ts`:
```ts
/** Pure, dependency-free email helpers for the newsletter module. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(raw: string): boolean {
  const e = raw.trim()
  if (e.length < 3 || e.length > 254) return false
  // exactly one @, non-empty local part, domain with at least one dot, no spaces
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}
```

- [ ] **Step 4: Run the email test to verify it passes**

Run: `cd backend && npx jest src/modules/newsletter/__tests__/email.test.ts`
Expected: PASS (2 suites).

- [ ] **Step 5: Create the model**

`backend/src/modules/newsletter/models/newsletter-subscription.ts`:
```ts
import { model } from "@medusajs/framework/utils"

const NewsletterSubscription = model.define("newsletter_subscription", {
  id: model.id().primaryKey(),
  email: model.text(),
  country_code: model.text().nullable(),
  source: model.text().nullable(),
}).indexes([
  { on: ["email"], unique: true },
])

export default NewsletterSubscription
```

- [ ] **Step 6: Create the service**

`backend/src/modules/newsletter/service.ts`:
```ts
import { MedusaService } from "@medusajs/framework/utils"
import NewsletterSubscription from "./models/newsletter-subscription"

class NewsletterService extends MedusaService({ NewsletterSubscription }) {
  /**
   * Idempotent subscribe keyed on the (already-normalized) email. Existing →
   * { created: false }; new → inserts and returns { created: true }. Callers
   * normalize via normalizeEmail before calling.
   */
  async subscribe(
    email: string,
    meta?: { country_code?: string | null; source?: string | null }
  ): Promise<{ created: boolean }> {
    const existing = await this.listNewsletterSubscriptions({ email })
    if (existing[0]) return { created: false }
    await this.createNewsletterSubscriptions({
      email,
      country_code: meta?.country_code ?? null,
      source: meta?.source ?? null,
    })
    return { created: true }
  }
}

export default NewsletterService
```

- [ ] **Step 7: Create the module registration**

`backend/src/modules/newsletter/index.ts`:
```ts
import { Module } from "@medusajs/framework/utils"
import NewsletterService from "./service"

export const NEWSLETTER_MODULE = "newsletterModuleService"
export default Module(NEWSLETTER_MODULE, { service: NewsletterService })
```

- [ ] **Step 8: Write the service idempotency test**

`backend/src/modules/newsletter/__tests__/service.test.ts`:
```ts
import NewsletterService from "../service"

function makeService() {
  const rows: any[] = []
  const svc = new (NewsletterService as any)({})
  svc.listNewsletterSubscriptions = async (f: any) => rows.filter((r) => r.email === f.email)
  svc.createNewsletterSubscriptions = async (data: any) => { const row = { id: `id_${rows.length}`, ...data }; rows.push(row); return row }
  return { svc, rows }
}

describe("NewsletterService.subscribe", () => {
  it("creates a new subscription", async () => {
    const { svc, rows } = makeService()
    const r = await svc.subscribe("a@b.co", { source: "home" })
    expect(r.created).toBe(true)
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({ email: "a@b.co", source: "home", country_code: null })
  })
  it("is idempotent on email (no duplicate row)", async () => {
    const { svc, rows } = makeService()
    await svc.subscribe("a@b.co")
    const again = await svc.subscribe("a@b.co")
    expect(again.created).toBe(false)
    expect(rows.length).toBe(1)
  })
})
```

- [ ] **Step 9: Add the `test:newsletter` script**

In `backend/package.json` `scripts`, after the `test:config` line, add:
```json
    "test:newsletter": "jest src/modules/newsletter",
```

- [ ] **Step 10: Run the newsletter test suite**

Run: `cd backend && npx jest src/modules/newsletter`
Expected: PASS (email.test + service.test, all green).

- [ ] **Step 11: Typecheck the new files**

Run: `cd backend && npx tsc --noEmit`
Expected: no NEW errors introduced by the newsletter files (pre-existing errors elsewhere are out of scope; the newsletter files must be clean).

- [ ] **Step 12: Commit**

```bash
git add backend/src/modules/newsletter backend/package.json
git commit -m "feat(newsletter): module — model + idempotent subscribe + email helpers (WB-023)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Newsletter store route + migration + config registration

**Files:**
- Create: `backend/src/modules/newsletter/migrations/Migration20260626120000.ts`
- Create: `backend/src/api/store/newsletter/validators.ts`
- Create: `backend/src/api/store/newsletter/route.ts`
- Modify: `backend/medusa-config.js` (register module)

**Interfaces:**
- Consumes: `NEWSLETTER_MODULE`, `normalizeEmail`, `isValidEmail` (Task 1).
- Produces: `POST /store/newsletter` → `201 { subscribed: true }` on valid email (created or already-existing); `400 { error: "invalid_email" }` otherwise. `parseNewsletterSubscribe(body): { ok: true; data } | { ok: false; error }`.

- [ ] **Step 1: Hand-author the migration**

`backend/src/modules/newsletter/migrations/Migration20260626120000.ts` (mirrors the customer-vehicle migration pattern — `id`/timestamps/soft-delete partial indexes; unique email index is partial on `deleted_at IS NULL`):
```ts
import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260626120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "newsletter_subscription" ("id" text not null, "email" text not null, "country_code" text null, "source" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "newsletter_subscription_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_newsletter_subscription_deleted_at" ON "newsletter_subscription" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_newsletter_subscription_email_unique" ON "newsletter_subscription" ("email") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "newsletter_subscription" cascade;`);
  }

}
```

- [ ] **Step 2: Create the validator**

`backend/src/api/store/newsletter/validators.ts`:
```ts
import { z } from "zod"

const NewsletterSubscribeSchema = z.object({
  email: z.string().min(1),
  country_code: z.string().nullish(),
  source: z.string().nullish(),
})

export type NewsletterSubscribeInput = z.infer<typeof NewsletterSubscribeSchema>

export type ParseResult =
  | { ok: true; data: NewsletterSubscribeInput }
  | { ok: false; error: string }

export function parseNewsletterSubscribe(body: unknown): ParseResult {
  const r = NewsletterSubscribeSchema.safeParse(body)
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  return { ok: true, data: r.data }
}
```

- [ ] **Step 3: Create the route**

`backend/src/api/store/newsletter/route.ts` (public route; the SDK supplies the publishable key. Always 201 on a valid email so membership isn't leaked):
```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { NEWSLETTER_MODULE } from "../../../modules/newsletter"
import { normalizeEmail, isValidEmail } from "../../../modules/newsletter/lib/email"
import { parseNewsletterSubscribe } from "./validators"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const parsed = parseNewsletterSubscribe(req.body)
  if (!parsed.ok) { res.status(400).json({ error: "invalid_email", details: parsed.error }); return }

  const email = normalizeEmail(parsed.data.email)
  if (!isValidEmail(email)) { res.status(400).json({ error: "invalid_email" }); return }

  const svc = req.scope.resolve(NEWSLETTER_MODULE) as any
  await svc.subscribe(email, {
    country_code: parsed.data.country_code ?? null,
    source: parsed.data.source ?? null,
  })
  res.status(201).json({ subscribed: true })
}
```

- [ ] **Step 4: Register the module in medusa-config.js**

In `backend/medusa-config.js`, in the `modules: [ ... ]` array, immediately after the line `{ resolve: './src/modules/customer-vehicle' },` add:
```js
    { resolve: './src/modules/newsletter' },
```

- [ ] **Step 5: Validate config + typecheck**

Run: `cd backend && node --check medusa-config.js`
Expected: no output (valid JS).
Run: `cd backend && npx tsc --noEmit`
Expected: no new errors from the route/validator/migration.

- [ ] **Step 6: Re-run the module tests (regression guard)**

Run: `cd backend && npx jest src/modules/newsletter`
Expected: PASS (unchanged from Task 1).

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/newsletter/migrations backend/src/api/store/newsletter backend/medusa-config.js
git commit -m "feat(newsletter): POST /store/newsletter + table migration + module registration (WB-023)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Note (deferred to pre-deploy live smoke):** with the backend running, `POST /store/newsletter` with a valid email returns 201 and inserts one row; a second POST of the same email still returns 201 with no duplicate row; an invalid email returns 400. The migration runs as part of `init-backend` / `medusa db:migrate` on deploy.

---

## Task 3: Storefront newsletter wiring (data fn + server action + component)

**Files:**
- Create: `storefront/src/lib/data/newsletter.ts`
- Create: `storefront/src/modules/home/actions.ts`
- Modify: `storefront/src/modules/home/components/newsletter/index.tsx`

**Interfaces:**
- Consumes: `POST /store/newsletter` (Task 2).
- Produces: `subscribeNewsletter(email: string): Promise<{ subscribed: boolean }>`; `newsletterSubscribe(email: string): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Create the data function**

`storefront/src/lib/data/newsletter.ts`:
```ts
import { sdk } from "@lib/config"

export const subscribeNewsletter = (email: string) =>
  sdk.client.fetch<{ subscribed: boolean }>("/store/newsletter", {
    method: "POST",
    body: { email },
  })
```

- [ ] **Step 2: Create the server action**

`storefront/src/modules/home/actions.ts`:
```ts
"use server"

import { subscribeNewsletter } from "@lib/data/newsletter"

export async function newsletterSubscribe(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim()
  if (!clean) return { ok: false, error: "Enter an email address" }
  try {
    await subscribeNewsletter(clean)
    return { ok: true }
  } catch {
    return { ok: false, error: "Couldn't subscribe — try again" }
  }
}
```

- [ ] **Step 3: Rewire the newsletter component**

In `storefront/src/modules/home/components/newsletter/index.tsx`:

Add the import (after the existing imports):
```ts
import { newsletterSubscribe } from "@modules/home/actions"
```

Replace the entire `submit` handler (the `const submit = (e: FormEvent) => { ... }` block, including the fake `setTimeout`) with:
```ts
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    const res = await newsletterSubscribe(email)
    setSubmitting(false)
    if (res.ok) {
      setEmail("")
      toast.success("Subscribed", {
        description: "You're on the list. Watch for the next drop.",
      })
    } else {
      toast.error("Subscription failed", {
        description: res.error ?? "Try again in a moment.",
      })
    }
  }
```

- [ ] **Step 4: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors vs the 14 pre-existing on `main`.

- [ ] **Step 5: Commit**

```bash
git add storefront/src/lib/data/newsletter.ts storefront/src/modules/home/actions.ts storefront/src/modules/home/components/newsletter/index.tsx
git commit -m "feat(home): newsletter signup persists via /store/newsletter (WB-023)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Note (deferred live smoke):** submitting the home newsletter form with a real email shows the success toast and the backend has a row; an invalid email is blocked by native `type=email` validation before submit.

---

## Task 4: Featured Blocks → real curated products

**Files:**
- Create: `storefront/src/modules/home/data/select-featured.ts`
- Test: `storefront/src/modules/home/data/select-featured.test.ts`
- Create: `storefront/src/modules/home/data/get-featured.ts`
- Modify: `storefront/src/modules/home/components/featured-blocks/index.tsx`
- Modify: `storefront/.env.local.template`

**Interfaces:**
- Consumes: `DiscoveryProduct` (`@modules/discovery/data/types`); `getDiscoveryProducts` (`@modules/discovery/data/get-products`); `getProductByHandle` (`@lib/data/products`); `getRegion` (`@lib/data/regions`); `num` (`@modules/product-detail/data/group-sizes`); `normalizeFinish` (`@lib/fitment/normalize-finish`); `canonicalBoltPatterns` (`@lib/fitment/canonical-bolt-pattern`).
- Produces: `selectFeatured(products: DiscoveryProduct[], curatedHandles: string[], limit: number): DiscoveryProduct[]`; `getFeaturedProducts(limit?: number): Promise<DiscoveryProduct[]>`.

- [ ] **Step 1: Write the failing `selectFeatured` test**

`storefront/src/modules/home/data/select-featured.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { selectFeatured } from "./select-featured"

const p = (id: string, handle: string) => ({ id, handle } as any)

describe("selectFeatured", () => {
  it("empty curated → first `limit` in order", () => {
    const products = [p("1", "a"), p("2", "b"), p("3", "c")]
    expect(selectFeatured(products, [], 2).map((x) => x.handle)).toEqual(["a", "b"])
  })
  it("orders curated handles first, then backfills with the rest", () => {
    const products = [p("1", "a"), p("2", "b"), p("3", "c")]
    expect(selectFeatured(products, ["c", "a"], 3).map((x) => x.handle)).toEqual(["c", "a", "b"])
  })
  it("drops curated handles not present", () => {
    const products = [p("1", "a"), p("2", "b")]
    expect(selectFeatured(products, ["zzz", "b"], 3).map((x) => x.handle)).toEqual(["b", "a"])
  })
  it("dedups by id (curated handle also in the backfill set)", () => {
    const products = [p("1", "a"), p("2", "b")]
    expect(selectFeatured(products, ["a"], 3).map((x) => x.id)).toEqual(["1", "2"])
  })
  it("caps at `limit`", () => {
    const products = [p("1", "a"), p("2", "b"), p("3", "c")]
    expect(selectFeatured(products, ["a", "b", "c"], 2).map((x) => x.handle)).toEqual(["a", "b"])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd storefront && npx vitest run src/modules/home/data/select-featured.test.ts`
Expected: FAIL — cannot resolve `./select-featured`.

- [ ] **Step 3: Implement `selectFeatured` (pure)**

`storefront/src/modules/home/data/select-featured.ts`:
```ts
import type { DiscoveryProduct } from "../../discovery/data/types"

/**
 * Pure selection for Featured Blocks. `products` is the union of the
 * curated-by-handle results and the fallback candidates. Emit the curated
 * handles first (in given order, only those actually present), then backfill
 * with the remaining products in their given order. Dedup by product id and
 * cap to `limit`. Empty `curatedHandles` → the first `limit` of `products`.
 */
export function selectFeatured(
  products: DiscoveryProduct[],
  curatedHandles: string[],
  limit: number
): DiscoveryProduct[] {
  const byHandle = new Map(products.map((p) => [p.handle, p]))
  const out: DiscoveryProduct[] = []
  const seen = new Set<string>()
  const push = (prod?: DiscoveryProduct) => {
    if (!prod || seen.has(prod.id)) return
    seen.add(prod.id)
    out.push(prod)
  }
  for (const h of curatedHandles) push(byHandle.get(h))
  for (const prod of products) push(prod)
  return out.slice(0, limit)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && npx vitest run src/modules/home/data/select-featured.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Implement `getFeaturedProducts`**

`storefront/src/modules/home/data/get-featured.ts`:
```ts
import "server-only"
import { HttpTypes } from "@medusajs/types"
import { getProductByHandle } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getDiscoveryProducts } from "@modules/discovery/data/get-products"
import { EMPTY_FILTERS, type DiscoveryProduct } from "@modules/discovery/data/types"
import { num } from "@modules/product-detail/data/group-sizes"
import { normalizeFinish } from "@lib/fitment/normalize-finish"
import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import { selectFeatured } from "./select-featured"

const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

function parseHandles(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Medusa Store API product → DiscoveryProduct (from-price = min non-zero across variants). */
function toFeatured(p: HttpTypes.StoreProduct): DiscoveryProduct {
  const variants = p.variants ?? []
  const pmeta = (p.metadata ?? {}) as Record<string, unknown>
  const rep = (variants[0]?.metadata ?? {}) as Record<string, unknown>
  const pricesCents = variants
    .map((v) => Math.round(num((v.calculated_price as any)?.calculated_amount) * 100))
    .filter((n) => n > 0)
  const boltPattern = String(rep.bolt_pattern_raw ?? "")
  return {
    id: p.id!,
    handle: p.handle!,
    brand: String(pmeta.brand ?? ""),
    name: p.title ?? "",
    priceCents: pricesCents.length ? Math.min(...pricesCents) : 0,
    thumbnail: p.thumbnail ?? null,
    finish: normalizeFinish(pmeta.finish),
    diameter: num(rep.wheel_diameter_in),
    width: num(rep.wheel_width_in),
    boltPattern,
    boltPatternsCanonical: boltPattern
      ? Array.from(new Set(canonicalBoltPatterns(boltPattern)))
      : [],
    categories: [],
  }
}

/**
 * Featured products for the home Featured Blocks. Curated via
 * NEXT_PUBLIC_FEATURED_HANDLES (CSV of handles, fetched exact via the Store
 * API); falls back to top-priced wheels from Meili when unset/short. Never
 * throws (both sources swallow failures → []).
 */
export async function getFeaturedProducts(limit = 3): Promise<DiscoveryProduct[]> {
  const handles = parseHandles(process.env.NEXT_PUBLIC_FEATURED_HANDLES)

  let curated: DiscoveryProduct[] = []
  if (handles.length) {
    const region = await getRegion(DEFAULT_COUNTRY)
    if (region) {
      const fetched = await Promise.all(
        handles.map((h) => getProductByHandle(h, region.id).catch(() => undefined))
      )
      curated = fetched
        .filter((p): p is HttpTypes.StoreProduct => Boolean(p))
        .map(toFeatured)
    }
  }

  if (curated.length >= limit) return curated.slice(0, limit)

  const { products: fallback } = await getDiscoveryProducts({
    filters: EMPTY_FILTERS,
    sort: "price-desc",
    page: 1,
  })
  return selectFeatured(curated.concat(fallback), handles, limit)
}
```

- [ ] **Step 6: Rewrite the Featured Blocks component (real products)**

Replace the entire contents of `storefront/src/modules/home/components/featured-blocks/index.tsx`:
```tsx
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Wheel from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import { getFeaturedProducts } from "@modules/home/data/get-featured"
import type { DiscoveryProduct } from "@modules/discovery/data/types"

const money = (cents: number) => Math.round(cents / 100).toLocaleString()

const Stat = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div>
    <Label tone="muted" style={{ fontSize: 10, display: "block" }}>
      {l}
    </Label>
    <Display size={20} as="div" className="small:!text-[22px]" style={{ marginTop: 4 }}>
      {v}
    </Display>
  </div>
)

const EditorialBlock = ({
  product,
  idx,
  total,
  flip,
}: {
  product: DiscoveryProduct
  idx: number
  total: number
  flip: boolean
}) => (
  <div
    className={`grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16 items-center px-5 py-12 xsmall:px-8 small:px-20 small:py-20 ${
      flip ? "small:[direction:rtl]" : ""
    }`}
  >
    <div className="relative" style={{ direction: "ltr" }}>
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-[var(--soft)]"
        style={{ aspectRatio: "4/3" }}
      >
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={`${product.brand} ${product.name}`}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-8"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Wheel size={220} finish={product.finish} />
          </div>
        )}
      </div>
      <div className="counter" style={{ position: "absolute", top: 20, left: 20 }}>
        FT.0{idx} / 0{total}
      </div>
    </div>
    <div style={{ direction: "ltr" }}>
      <Label style={{ marginBottom: 14, display: "block" }}>FEATURED · {product.brand}</Label>
      <Display size={36} as="h3" className="small:!text-[56px]">
        {product.name}
      </Display>
      <div className="grid grid-cols-2 small:grid-cols-4 gap-5 mt-7 mb-7 border-y border-[var(--hairline)] py-5">
        {product.diameter > 0 && <Stat l="DIAMETER" v={`${product.diameter}"`} />}
        {product.width > 0 && <Stat l="WIDTH" v={`${product.width}"`} />}
        {product.boltPattern && <Stat l="BOLT" v={product.boltPattern} />}
        <Stat
          l="FROM"
          v={
            <span>
              <span style={{ color: "var(--orange)" }}>$</span>
              {money(product.priceCents)}
            </span>
          }
        />
      </div>
      <Button asChild className="w-full small:w-auto">
        <LocalizedClientLink href={`/products/${product.handle}`}>
          Shop This Wheel <Icon name="arrow-right" size={16} color="white" />
        </LocalizedClientLink>
      </Button>
    </div>
  </div>
)

const FeaturedBlocks = async () => {
  const products = await getFeaturedProducts(3)
  if (products.length === 0) return null

  return (
    <section style={{ borderTop: "1px solid var(--hairline)" }}>
      {products.map((p, i) => (
        <div key={p.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
          <EditorialBlock product={p} idx={i + 1} total={products.length} flip={i % 2 === 1} />
        </div>
      ))}
    </section>
  )
}

export default FeaturedBlocks
```

- [ ] **Step 7: Document the env var**

In `storefront/.env.local.template`, add (near other `NEXT_PUBLIC_*` entries):
```
# Comma-separated product handles to feature on the home page (Featured Blocks).
# Leave unset to auto-feature the top-priced wheels. Changing this needs a rebuild.
NEXT_PUBLIC_FEATURED_HANDLES=
```

- [ ] **Step 8: Typecheck + full storefront unit run**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors.
Run: `cd storefront && npx vitest run`
Expected: PASS — existing 95 + new select-featured cases.

- [ ] **Step 9: Commit**

```bash
git add storefront/src/modules/home/data/select-featured.ts storefront/src/modules/home/data/select-featured.test.ts storefront/src/modules/home/data/get-featured.ts storefront/src/modules/home/components/featured-blocks/index.tsx storefront/.env.local.template
git commit -m "feat(home): Featured Blocks render real curated products (WB-004)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Build Gallery → catalog-wall (real product mosaic)

**Files:**
- Create: `storefront/src/modules/home/components/catalog-wall/index.tsx`
- Delete: `storefront/src/modules/home/components/build-gallery/index.tsx` (and its now-empty dir)
- Modify: `storefront/src/app/[countryCode]/(main)/page.tsx` (import + tag)

**Interfaces:**
- Consumes: `getHomeCatalog` (`@modules/home/data/get-home-catalog`) — `newestProducts`.

- [ ] **Step 1: Create the catalog-wall component (real tiles + honest copy)**

`storefront/src/modules/home/components/catalog-wall/index.tsx`:
```tsx
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel from "@modules/common/components/wheel"
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import Chip from "@modules/common/components/chip"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import type { DiscoveryProduct } from "@modules/discovery/data/types"

// Fixed visual rhythm (mixed 12-col spans on small+; .build-tile media-queries
// the spans off on mobile to a plain 2-col grid). Decorative layout only —
// content comes from real products.
const SPANS = [
  { w: 5, h: 4 },
  { w: 4, h: 4 },
  { w: 3, h: 4 },
  { w: 3, h: 5 },
  { w: 5, h: 5 },
  { w: 4, h: 3 },
  { w: 4, h: 4 },
  { w: 4, h: 3 },
]

const Tile = ({
  product,
  span,
}: {
  product: DiscoveryProduct
  span: { w: number; h: number }
}) => (
  <LocalizedClientLink
    href={`/products/${product.handle}`}
    className="build-tile relative aspect-square small:aspect-auto block overflow-hidden rounded-md bg-[var(--soft)]"
    style={{ gridColumn: `span ${span.w}`, gridRow: `span ${span.h}` }}
    aria-label={`${product.brand} ${product.name}`}
  >
    {product.thumbnail ? (
      <Image
        src={product.thumbnail}
        alt={`${product.brand} ${product.name}`}
        fill
        sizes="(min-width: 1024px) 40vw, 50vw"
        className="object-contain p-3"
      />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center">
        <Wheel size={120} finish={product.finish} />
      </div>
    )}
    <div style={{ position: "absolute", left: 12, bottom: 12 }}>
      <Chip variant="outline" size="sm" dot>
        {product.brand}
      </Chip>
    </div>
  </LocalizedClientLink>
)

const CatalogWall = async () => {
  const { newestProducts } = await getHomeCatalog()
  const tiles = newestProducts.slice(0, SPANS.length)
  if (tiles.length === 0) return null

  return (
    <section
      className="px-5 py-16 xsmall:px-8 small:px-20 small:py-[120px]"
      style={{ background: "var(--soft)" }}
    >
      <SectionHeader
        eyebrow="LATEST ARRIVALS"
        title="Straight off the truck."
        action={<MicroLink href="/store">Browse all wheels</MicroLink>}
      />
      <div className="grid grid-cols-2 small:grid-cols-12 gap-3" style={{ gridAutoRows: "70px" }}>
        {tiles.map((p, i) => (
          <Tile key={p.id} product={p} span={SPANS[i]} />
        ))}
      </div>
    </section>
  )
}

export default CatalogWall
```

- [ ] **Step 2: Delete the old build-gallery component**

```bash
git rm storefront/src/modules/home/components/build-gallery/index.tsx
```

- [ ] **Step 3: Update the home page import**

In `storefront/src/app/[countryCode]/(main)/page.tsx`:

Replace the import line
```ts
import BuildGallery from "@modules/home/components/build-gallery"
```
with
```ts
import CatalogWall from "@modules/home/components/catalog-wall"
```

Replace the usage `<BuildGallery />` with `<CatalogWall />`.

- [ ] **Step 4: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors. (Grep `BuildGallery` storefront-wide returns no matches.)

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/home/components/catalog-wall storefront/src/app/"[countryCode]"/"(main)"/page.tsx
git commit -m "feat(home): Build Gallery → catalog-wall real product mosaic (WB-004)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: De-hardcode merchandising copy (config + live metadata)

**Files:**
- Create: `storefront/src/modules/home/data/merchandising.ts`
- Modify: `storefront/src/modules/home/components/trust-strip/index.tsx`
- Modify: `storefront/src/modules/home/components/hero/index.tsx`
- Modify: `storefront/src/app/[countryCode]/(main)/page.tsx`

**Interfaces:**
- Produces: `TRUST_STRIP_ITEMS: { icon: IconName; h: string; s: string }[]`; `HERO_COPY: { eyebrow: string; headlineTop: string; headlineBottom: string; subcopy: string; trustPoints: { l: string; s: string }[] }`.

- [ ] **Step 1: Create the merchandising config**

`storefront/src/modules/home/data/merchandising.ts`:
```ts
import type { IconName } from "@modules/common/components/icon"

/**
 * Editable home merchandising copy. Change strings here — not in the section
 * components. The brand-count-dependent values (trust-strip "Authorized dealer"
 * subtitle, hero "Authorized dealer" point) stay computed in their components
 * because they read the live facet count.
 */
export const TRUST_STRIP_ITEMS: { icon: IconName; h: string; s: string }[] = [
  { icon: "shipping", h: "Free shipping $199+", s: "Lower 48, ground" },
  { icon: "shield", h: "Fitment guarantee", s: "Or your money back" },
  { icon: "badge", h: "Authorized dealer", s: "Premium brands" },
  { icon: "return", h: "30-day returns", s: "Unmounted wheels" },
]

export const HERO_COPY = {
  eyebrow: "FITMENT FIRST · STEP 01 OF 02",
  headlineTop: "What do",
  headlineBottom: "you drive?",
  subcopy:
    "Tell us once. We'll show you only the wheels confirmed to fit, ship them in 2–3 days, and back every fitment with our money-back guarantee.",
  trustPoints: [
    { l: "Fitment guaranteed", s: "Or your money back" },
    { l: "Free returns", s: "30 days, unmounted" },
    { l: "Free ship $199+", s: "2–3 day delivery" },
  ],
}
```

- [ ] **Step 2: Wire trust-strip to the config**

In `storefront/src/modules/home/components/trust-strip/index.tsx`:

Add import:
```ts
import { TRUST_STRIP_ITEMS } from "@modules/home/data/merchandising"
```

Replace the inline `const ITEMS: ... = [ ... ]` array with a config-driven version that enriches only the dealer item with the live count:
```ts
  const ITEMS = TRUST_STRIP_ITEMS.map((it) =>
    it.icon === "badge" && brandCount
      ? { ...it, s: `${brandCount} premium brands` }
      : it
  )
```
(Leave the rest of the component — the `Icon` import, the rendering/border logic — unchanged.)

- [ ] **Step 3: Wire hero to the config**

In `storefront/src/modules/home/components/hero/index.tsx`:

Add import:
```ts
import { HERO_COPY } from "@modules/home/data/merchandising"
```

Replace the inline `const TRUST_POINTS = [ ... ]` with the config + computed dealer point (preserving order — dealer is last):
```ts
  const TRUST_POINTS = [
    ...HERO_COPY.trustPoints,
    { l: "Authorized dealer", s: brandCount ? `${brandCount} brands` : "Premium brands" },
  ]
```

Replace the hard-coded eyebrow `<Label bar ...>FITMENT FIRST · STEP 01 OF 02</Label>` text with `{HERO_COPY.eyebrow}`.

Replace the `<Display ...>What do<br />you drive?</Display>` inner content with:
```tsx
          {HERO_COPY.headlineTop}
          <br />
          {HERO_COPY.headlineBottom}
```

Replace the subcopy paragraph text (the `Tell us once. ...` content, which currently uses `&apos;`) with `{HERO_COPY.subcopy}`.

- [ ] **Step 4: Convert page metadata to live `generateMetadata`**

In `storefront/src/app/[countryCode]/(main)/page.tsx`:

Replace the static `export const metadata: Metadata = { ... }` block with:
```ts
export async function generateMetadata(): Promise<Metadata> {
  const { facets } = await getHomeCatalog()
  const brandCount = Object.keys(facets.brands).length
  return {
    title: "Wheel Builds — Premium Aftermarket Wheels & Fitment",
    description: `Authorized dealer for ${brandCount} premium aftermarket wheel brands. Tell us what you drive — we'll show you only the wheels confirmed to fit.`,
  }
}
```
(`getHomeCatalog` is already imported and is `react.cache`'d, so this adds no extra round-trip.)

- [ ] **Step 5: Typecheck**

Run: `cd storefront && npx tsc --noEmit`
Expected: 0 new errors.

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/home/data/merchandising.ts storefront/src/modules/home/components/trust-strip/index.tsx storefront/src/modules/home/components/hero/index.tsx storefront/src/app/"[countryCode]"/"(main)"/page.tsx
git commit -m "refactor(home): merchandising copy → config; metadata uses live brand count (WB-028)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `cd backend && npx jest src/modules/newsletter` — green.
- [ ] `cd backend && node --check medusa-config.js` — valid.
- [ ] `cd backend && npx tsc --noEmit` — no new errors from newsletter files.
- [ ] `cd storefront && npx vitest run` — existing 95 + new select-featured cases green.
- [ ] `cd storefront && npx tsc --noEmit` — 0 new errors vs the 14 pre-existing on `main`.
- [ ] Grep `BuildGallery` / `build-gallery` storefront-wide → no matches.
- [ ] **Deferred to pre-deploy (live backend):** newsletter POST persists + idempotent + 400 on bad email; Featured renders curated handles (and top-priced fallback when `NEXT_PUBLIC_FEATURED_HANDLES` unset); catalog-wall tiles link to real PDPs; home `<meta description>` shows the real brand count.

## Self-review notes
- **Spec coverage:** WB-004 Featured (Task 4) + Build Gallery (Task 5); WB-023 newsletter backend (Tasks 1–2) + storefront (Task 3); WB-028 copy config + live metadata (Task 6). All covered.
- **Type consistency:** `selectFeatured`/`getFeaturedProducts`/`toFeatured` all produce `DiscoveryProduct`; `subscribe` returns `{ created }`, route returns `{ subscribed }` (intentionally different shapes — internal vs wire). `newsletterSubscribe` returns `{ ok, error? }`.
- **Module snapshot:** intentionally omitted — only `medusa db:generate` drift-detection uses it; deploy runs `db:migrate` against the hand-authored migration. If a later `db:generate newsletter` is run, it will regenerate a create migration (harmless false-positive) until a snapshot is committed.
