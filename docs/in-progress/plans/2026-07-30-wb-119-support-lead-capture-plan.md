# WB-119 · Support & Lead Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give customers a working way to reach the business, and make sure a message survives even when email delivery is impossible — which it is today.

**Architecture:** A new backend `support-request` module mirroring the existing `newsletter` module (one entity, one migration, one `POST /store/support-request` route), fronted by a storefront form that **persists first and notifies second**. The contact page's existing env-gated `mailto:` gains a phone sibling. The tyre PDP's fitment CTA points at the same form with vehicle context pre-filled, and the wheel PDP gains the equivalent CTA it currently lacks.

**Tech Stack:** MedusaJS 2.13.6 (MikroORM models, zod validators, Jest), Next.js 15 storefront (Server Actions, Vitest).

## Corrections to the spec, found while reading the code

The spec was written from the rendered page. Reading the source changed two things — **do not implement from the spec text alone**:

1. **The contact page is not featureless.** `contact/page.tsx` already reads
   `NEXT_PUBLIC_SUPPORT_EMAIL` and renders a `mailto:` when it is set, falling back to
   "reply to any order email" prose when it is not (WB-081). So the missing email channel
   is a **production config gap**, not missing code. This plan adds the **phone** sibling
   and the **form**; it does not rebuild the email link.

2. **`order-placed.ts` swallows send failures.** WB-094 made the Resend provider
   fail-loud, but the subscriber wraps `createNotifications` in `try { … } catch { console.error(…) }`.
   A production send failure is therefore invisible — not in the Medusa logger, and with
   no event retry. That is the real remaining Q-19 work, and it needs no client input.

## Global Constraints

- **`MedusaService` update/create take a single object**, not `(selector, update)`.
- **Backend path resolution:** `tsconfig.json` sets `paths: { "*": ["./src/*"] }`. Import as `lib/constants`, never `@/lib/constants`.
- **Storefront tsc baseline is exactly 2 errors.** Must not rise.
- **`"use server"` modules may export only async functions.** Neither vitest nor tsc catches a violation — only `next build` does (this bit WB-093).
- **No `wb-` prefix** on any identifier.
- **`.medusa/server` is a stale-config trap.** After changing `medusa-config.js`, `rm -rf backend/.medusa/server` before restarting.
- **A migration is required.** Generate it, don't hand-write the snapshot.
- **Commit after every task.** Branch: `feat/g13-qa-remediation` (already checked out).

## Blocked on the client — and how this plan avoids being blocked

`docs/reference/client-input-needed.md` items 4 and 5 ask for the support email, phone, and
fitment-check response time. **None of them block this plan.** Every surface is env-gated
and renders *nothing* rather than a placeholder when its value is absent — a fake support
address is worse than none. The form works regardless, because it writes to the database
before it tries to notify anyone.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `backend/src/lib/email-address.ts` | **Create.** Shared pure `normalizeEmail` / `isValidEmail`. | 1 |
| `backend/src/lib/__tests__/email-address.test.ts` | **Create.** | 1 |
| `backend/src/modules/newsletter/lib/email.ts` | **Modify.** Re-export from the shared lib; keep its own tests passing. | 1 |
| `backend/src/modules/support-request/models/support-request.ts` | **Create.** The entity. | 2 |
| `backend/src/modules/support-request/service.ts` | **Create.** `create()` — plain insert, no upsert. | 2 |
| `backend/src/modules/support-request/index.ts` | **Create.** Module registration. | 2 |
| `backend/src/modules/support-request/migrations/` | **Generate.** | 2 |
| `backend/medusa-config.js` | **Modify.** Register the module. | 2 |
| `backend/src/api/store/support-request/validators.ts` | **Create.** zod schema + `parseSupportRequest`. | 3 |
| `backend/src/api/store/support-request/__tests__/validators.test.ts` | **Create.** | 3 |
| `backend/src/api/store/support-request/route.ts` | **Create.** POST. | 3 |
| `storefront/src/lib/data/support-request.ts` | **Create.** SDK call. | 4 |
| `storefront/src/modules/support/actions.ts` | **Create.** Server Action. | 4 |
| `storefront/src/modules/support/components/contact-form/index.tsx` | **Create.** The form. | 4 |
| `storefront/src/modules/support/support-config.ts` + `.test.ts` | **Create.** Env-gated channel config. | 4 |
| `storefront/src/app/[countryCode]/(main)/contact/page.tsx` | **Modify.** Phone + form + prefill. | 5 |
| `storefront/src/modules/product-detail/components/tire/fitment.tsx` | **Modify.** CTA carries vehicle context. | 6 |
| `storefront/src/modules/product-detail/components/fitment/index.tsx` | **Modify.** Add the wheel CTA. | 6 |
| `backend/src/subscribers/order-placed.ts` | **Modify.** Stop swallowing send failures. | 7 |
| `backend/src/subscribers/__tests__/order-placed.test.ts` | **Create.** | 7 |

---

## Task 1: Shared email helpers

`support-request` needs the same `normalizeEmail`/`isValidEmail` the newsletter module has.
Copying them would create a silent drift pair; importing across module boundaries couples
two Medusa modules for no reason. Promote them to `src/lib/`.

**Files:**
- Create: `backend/src/lib/email-address.ts`
- Test: `backend/src/lib/__tests__/email-address.test.ts`
- Modify: `backend/src/modules/newsletter/lib/email.ts`

**Interfaces:**
- Produces: `normalizeEmail(raw: string): string`, `isValidEmail(raw: string): boolean`.
  Tasks 3 consumes both.

- [ ] **Step 1: Write the failing test**

```ts
import { isValidEmail, normalizeEmail } from "../email-address"

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  QA@Example.COM ")).toBe("qa@example.com")
  })
})

describe("isValidEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.com"])("accepts %s", (e) => {
    expect(isValidEmail(e)).toBe(true)
  })

  it.each(["", "a", "no-at.example.com", "two@@example.com", "spaces in@example.com", "a@b"])(
    "rejects %s",
    (e) => {
      expect(isValidEmail(e)).toBe(false)
    }
  )

  it("rejects an address longer than 254 chars", () => {
    expect(isValidEmail(`${"a".repeat(250)}@b.co`)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx jest src/lib/__tests__/email-address.test.ts
```
Expected: FAIL — cannot find module `../email-address`.

- [ ] **Step 3: Create the shared module**

Move the two functions verbatim out of `src/modules/newsletter/lib/email.ts` into
`backend/src/lib/email-address.ts`, changing only the docstring:

```ts
/**
 * Pure, dependency-free email helpers shared by the `newsletter` and
 * `support-request` modules (WB-119 Task 1).
 *
 * Promoted out of `modules/newsletter/lib/email.ts` when support-request
 * needed the same rules: copying them would have created a silent drift
 * pair, and importing across module boundaries would couple two Medusa
 * modules for no reason.
 */
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

- [ ] **Step 4: Re-export from the newsletter module**

Replace the body of `src/modules/newsletter/lib/email.ts` with:

```ts
/**
 * Re-export of the shared helpers in `src/lib/email-address.ts` (WB-119
 * Task 1). Kept as a module-local path so the newsletter module's existing
 * imports and tests are untouched.
 */
export { normalizeEmail, isValidEmail } from "../../../lib/email-address"
```

- [ ] **Step 5: Verify both suites still pass**

```bash
cd backend && npx jest src/lib/__tests__/email-address.test.ts src/modules/newsletter
```
Expected: PASS. The newsletter suite (8 tests) must be unchanged — if any fail, the move
was not verbatim.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/email-address.ts backend/src/lib/__tests__/email-address.test.ts backend/src/modules/newsletter/lib/email.ts
git commit -m "refactor(WB-119): share the email helpers between newsletter and support-request"
```

---

## Task 2: The `support-request` module

**Files:**
- Create: `backend/src/modules/support-request/models/support-request.ts`
- Create: `backend/src/modules/support-request/service.ts`
- Create: `backend/src/modules/support-request/index.ts`
- Modify: `backend/medusa-config.js`
- Generate: `backend/src/modules/support-request/migrations/`

**Interfaces:**
- Produces: `SUPPORT_REQUEST_MODULE = "supportRequestModuleService"`, and a service with
  `createSupportRequests({...})` (from `MedusaService`). Task 3 consumes both.

- [ ] **Step 1: Define the model**

`backend/src/modules/support-request/models/support-request.ts`:

```ts
import { model } from "@medusajs/framework/utils"

/**
 * A customer message from the contact form or a PDP fitment-check CTA
 * (WB-119 Q-04 / Q-20).
 *
 * Deliberately NOT unique on anything: unlike a newsletter subscription, a
 * second message from the same person is a second message, not a duplicate.
 */
const SupportRequest = model
  .define("support_request", {
    id: model.id().primaryKey(),
    name: model.text(),
    email: model.text(),
    phone: model.text().nullable(),
    subject: model.text().nullable(),
    message: model.text(),
    /** "contact" | "fitment-check" — which surface it came from. */
    source: model.text().nullable(),
    /** Free-text vehicle context, prefilled by the fitment CTA. */
    vehicle: model.text().nullable(),
    /** Product handle the shopper was looking at, when known. */
    product_handle: model.text().nullable(),
    country_code: model.text().nullable(),
    /** Set once a notification has actually been delivered. */
    notified_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["created_at"] }, { on: ["email"] }])

export default SupportRequest
```

- [ ] **Step 2: Write the service**

`backend/src/modules/support-request/service.ts`:

```ts
import { MedusaService } from "@medusajs/framework/utils"
import SupportRequest from "./models/support-request"

/**
 * WB-119. Plain `MedusaService` — no custom upsert.
 *
 * The newsletter module needs an atomic idempotent upsert because a
 * subscription is a SET membership and a duplicate POST must be a no-op. A
 * support request is the opposite: every submission is a distinct message
 * that must be kept, so the generated `createSupportRequests` is exactly
 * right and adding cleverness here would risk losing a customer's message.
 */
class SupportRequestService extends MedusaService({ SupportRequest }) {}

export default SupportRequestService
```

- [ ] **Step 3: Register the module**

`backend/src/modules/support-request/index.ts`:

```ts
import { Module } from "@medusajs/framework/utils"
import SupportRequestService from "./service"

export const SUPPORT_REQUEST_MODULE = "supportRequestModuleService"
export default Module(SUPPORT_REQUEST_MODULE, { service: SupportRequestService })
```

In `backend/medusa-config.js`, beside the newsletter entry (search `./src/modules/newsletter`):

```js
    { resolve: './src/modules/support-request' },
```

Register it **unconditionally**, like newsletter — it has no env dependency, and a
conditionally-registered module is exactly the "why isn't X working in production" trap the
root CLAUDE.md warns about.

- [ ] **Step 4: Generate the migration**

```bash
cd backend
rm -rf .medusa/server
npx medusa db:generate support-request
```

Expected: a new `src/modules/support-request/migrations/Migration<timestamp>.ts` creating
`support_request`.

⚠️ MikroORM also drops a `.snapshot-railway.json` (~1 MB) in that folder. It is gitignored —
confirm with `git status` that it is NOT staged. The module-scoped
`.snapshot-support-request-module.json` **is** tracked and must be committed.

- [ ] **Step 5: Verify it compiles and the module loads**

```bash
cd backend && npx tsc --noEmit && npx medusa build
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/support-request backend/medusa-config.js
git commit -m "feat(WB-119): support-request module — entity, service, migration"
```

---

## Task 3: `POST /store/support-request`

**Files:**
- Create: `backend/src/api/store/support-request/validators.ts`
- Test: `backend/src/api/store/support-request/__tests__/validators.test.ts`
- Create: `backend/src/api/store/support-request/route.ts`

**Interfaces:**
- Consumes: `normalizeEmail` / `isValidEmail` (Task 1), `SUPPORT_REQUEST_MODULE` (Task 2).
- Produces: `parseSupportRequest(body: unknown): { ok: true; data: SupportRequestInput } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing validator test**

```ts
import { parseSupportRequest } from "../validators"

const valid = { name: "QA Tester", email: "qa@example.com", message: "Does this fit?" }

describe("parseSupportRequest", () => {
  it("accepts a minimal valid body", () => {
    const r = parseSupportRequest(valid)
    expect(r.ok).toBe(true)
  })

  it("accepts the optional fitment fields", () => {
    const r = parseSupportRequest({
      ...valid,
      phone: "+15555550100",
      subject: "Fitment",
      source: "fitment-check",
      vehicle: "2019 Toyota Corolla LE",
      product_handle: "nitto-terra-grappler",
      country_code: "us",
    })
    expect(r.ok).toBe(true)
  })

  it.each([
    ["missing name", { ...valid, name: undefined }],
    ["empty name", { ...valid, name: "   " }],
    ["missing message", { ...valid, message: undefined }],
    ["empty message", { ...valid, message: "  " }],
    ["missing email", { ...valid, email: undefined }],
  ])("rejects %s", (_label, body) => {
    expect(parseSupportRequest(body).ok).toBe(false)
  })

  it("rejects an over-long message rather than letting it hit the DB", () => {
    expect(parseSupportRequest({ ...valid, message: "x".repeat(5001) }).ok).toBe(false)
  })

  it("rejects a non-object body", () => {
    expect(parseSupportRequest(null).ok).toBe(false)
    expect(parseSupportRequest("hello").ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx jest src/api/store/support-request
```
Expected: FAIL — cannot find module `../validators`.

- [ ] **Step 3: Write the validator**

```ts
import { z } from "zod"

/**
 * WB-119. Length caps are deliberate: this endpoint is public and unauthenticated,
 * so an unbounded `message` is a free write-amplification vector into the
 * database. 5,000 characters is far more than a fitment question needs.
 */
const SupportRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().min(3).max(254),
  message: z.string().trim().min(1).max(5000),
  phone: z.string().trim().max(50).nullish(),
  subject: z.string().trim().max(200).nullish(),
  source: z.string().trim().max(50).nullish(),
  vehicle: z.string().trim().max(200).nullish(),
  product_handle: z.string().trim().max(200).nullish(),
  country_code: z.string().trim().max(10).nullish(),
})

export type SupportRequestInput = z.infer<typeof SupportRequestSchema>

export type ParseResult =
  | { ok: true; data: SupportRequestInput }
  | { ok: false; error: string }

export function parseSupportRequest(body: unknown): ParseResult {
  const r = SupportRequestSchema.safeParse(body)
  if (!r.success) {
    return {
      ok: false,
      error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    }
  }
  return { ok: true, data: r.data }
}
```

- [ ] **Step 4: Run the test**

```bash
cd backend && npx jest src/api/store/support-request
```
Expected: PASS, 10 cases.

- [ ] **Step 5: Write the route**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ulid } from "ulid"

import { isValidEmail, normalizeEmail } from "../../../lib/email-address"
import { SUPPORT_REQUEST_MODULE } from "../../../modules/support-request"
import { parseSupportRequest } from "./validators"

/**
 * WB-119 Q-04 / Q-20 — persist-then-notify.
 *
 * The row is written BEFORE any notification is attempted, and the response
 * does not depend on the notification succeeding. This is the whole point:
 * transactional email cannot be sent at all right now (no sending domain —
 * see docs/reference/client-input-needed.md item 6), so a submission that
 * only sent an email would be lost forever. Storing first means every lead
 * survives, and delivery becomes a best-effort side effect that can be
 * switched on later with no code change.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const parsed = parseSupportRequest(req.body)
  if (parsed.ok === false) {
    res.status(400).json({ error: "invalid_request", details: parsed.error })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "invalid_email" })
    return
  }

  const svc = req.scope.resolve(SUPPORT_REQUEST_MODULE) as any

  const [created] = await svc.createSupportRequests([
    {
      id: `supreq_${ulid()}`,
      name: parsed.data.name,
      email,
      message: parsed.data.message,
      phone: parsed.data.phone ?? null,
      subject: parsed.data.subject ?? null,
      source: parsed.data.source ?? null,
      vehicle: parsed.data.vehicle ?? null,
      product_handle: parsed.data.product_handle ?? null,
      country_code: parsed.data.country_code ?? null,
    },
  ])

  // The message is now durable. Anything after this point is best-effort and
  // must never turn a stored request into a client-visible failure.
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(
    `[support-request] stored ${created?.id} (source=${parsed.data.source ?? "contact"})`
  )

  res.status(201).json({ received: true })
}
```

- [ ] **Step 6: Verify compile + build**

```bash
cd backend && npx tsc --noEmit && npx medusa build
```
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/api/store/support-request
git commit -m "feat(WB-119): POST /store/support-request — persist before notify"
```

---

## Task 4: Storefront data layer, action, config and form

**Files:**
- Create: `storefront/src/lib/data/support-request.ts`
- Create: `storefront/src/modules/support/actions.ts`
- Create: `storefront/src/modules/support/support-config.ts`
- Test: `storefront/src/modules/support/support-config.test.ts`
- Create: `storefront/src/modules/support/components/contact-form/index.tsx`

**Interfaces:**
- Consumes: `POST /store/support-request` (Task 3).
- Produces:
  ```ts
  // support-config.ts
  export type SupportChannels = { email: string | null; phone: string | null; hasAny: boolean }
  export function supportChannels(): SupportChannels
  // actions.ts  ("use server" — async exports ONLY)
  export async function submitSupportRequest(input: {...}): Promise<{ ok: boolean; error?: string }>
  ```
  Tasks 5 and 6 consume both.

- [ ] **Step 1: Write the failing config test**

`storefront/src/modules/support/support-config.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { supportChannelsFrom } from "./support-config"

describe("supportChannelsFrom", () => {
  it("returns both channels when both are set", () => {
    expect(supportChannelsFrom("help@example.com", "+1 555 555 0100")).toEqual({
      email: "help@example.com",
      phone: "+1 555 555 0100",
      hasAny: true,
    })
  })

  it("omits a channel that is unset — never a placeholder", () => {
    // Showing a fake support address is worse than showing none: it silently
    // swallows customer mail. See docs/reference/client-input-needed.md item 4.
    expect(supportChannelsFrom(undefined, undefined)).toEqual({
      email: null,
      phone: null,
      hasAny: false,
    })
  })

  it("treats blank/whitespace env values as unset", () => {
    expect(supportChannelsFrom("   ", "")).toEqual({
      email: null,
      phone: null,
      hasAny: false,
    })
  })

  it("reports hasAny when only one channel is configured", () => {
    expect(supportChannelsFrom("help@example.com", undefined).hasAny).toBe(true)
    expect(supportChannelsFrom(undefined, "+15555550100").hasAny).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd storefront && npx vitest run src/modules/support/support-config.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the config**

```ts
/**
 * Support channels shown on the contact page (WB-119 Q-04).
 *
 * Each renders ONLY when its env var is set. A fake support address is worse
 * than none — it silently swallows customer mail — so there is deliberately
 * no default. Values are pending from the client
 * (docs/reference/client-input-needed.md item 4).
 *
 * `NEXT_PUBLIC_SUPPORT_EMAIL` predates this file (WB-081, already read by the
 * contact page); `NEXT_PUBLIC_SUPPORT_PHONE` is new.
 */
export type SupportChannels = {
  email: string | null
  phone: string | null
  hasAny: boolean
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").trim()
  return t.length ? t : null
}

/** Pure core — exported for tests, which cannot restub inlined env vars. */
export function supportChannelsFrom(
  email: string | undefined,
  phone: string | undefined
): SupportChannels {
  const e = clean(email)
  const p = clean(phone)
  return { email: e, phone: p, hasAny: Boolean(e || p) }
}

export function supportChannels(): SupportChannels {
  // Must be literal `process.env.NEXT_PUBLIC_*` member expressions — that is
  // how Next.js inlines them at build time.
  return supportChannelsFrom(
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    process.env.NEXT_PUBLIC_SUPPORT_PHONE
  )
}
```

- [ ] **Step 4: Run the test**

```bash
cd storefront && npx vitest run src/modules/support/support-config.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the data layer**

`storefront/src/lib/data/support-request.ts`:

```ts
import { sdk } from "@lib/config"

export type SupportRequestBody = {
  name: string
  email: string
  message: string
  phone?: string | null
  subject?: string | null
  source?: string | null
  vehicle?: string | null
  product_handle?: string | null
  country_code?: string | null
}

export const postSupportRequest = (body: SupportRequestBody) =>
  sdk.client.fetch<{ received: boolean }>("/store/support-request", {
    method: "POST",
    body,
  })
```

- [ ] **Step 6: Write the Server Action**

`storefront/src/modules/support/actions.ts`:

```ts
"use server"

import { postSupportRequest, type SupportRequestBody } from "@lib/data/support-request"

/**
 * WB-119. Mirrors `modules/home/actions.ts`'s newsletterSubscribe.
 *
 * ⚠️ A "use server" module may export ONLY async functions. Neither vitest nor
 * tsc catches a violation — only `next build` does (this broke WB-093). Do not
 * add a constant, type, or sync helper export to this file.
 */
export async function submitSupportRequest(
  input: SupportRequestBody
): Promise<{ ok: boolean; error?: string }> {
  const name = input.name?.trim() ?? ""
  const email = input.email?.trim() ?? ""
  const message = input.message?.trim() ?? ""

  if (!name) return { ok: false, error: "Enter your name" }
  if (!email) return { ok: false, error: "Enter an email address" }
  if (!message) return { ok: false, error: "Enter a message" }

  try {
    await postSupportRequest({ ...input, name, email, message })
    return { ok: true }
  } catch {
    return { ok: false, error: "Couldn't send that — please try again" }
  }
}
```

- [ ] **Step 7: Write the form**

`storefront/src/modules/support/components/contact-form/index.tsx`. A `"use client"`
component with `useState` for the fields plus `idle | sending | sent | error` status.

Requirements, in order of importance:

1. On success, replace the form with a confirmation that is **honest about what happened**:
   *"Thanks — we've got your message and we'll reply by email."* Do **not** promise a
   timeframe; the client has not confirmed one (client-input item 5).
2. Every input has a real `<label>` (WB-096 a11y work is not to be regressed).
3. Accept optional `defaultSubject`, `defaultMessage`, `vehicle`, `productHandle` and
   `source` props, so Task 6's fitment CTA can prefill it.
4. Use `Field` + `TextInput` from `@modules/common/components/*`, and a plain `<textarea>`
   styled to match, since there is no shared textarea primitive.
5. Disable the submit button while `sending`; show the error string inline on failure.

> **Plan note:** this is the one step specified as requirements rather than literal JSX.
> The component is ~90 lines of presentation with no branching logic worth pinning in
> advance, and it is being written in the same session by the same implementer. If this
> plan is handed to someone else, treat the five points above as the acceptance criteria.

- [ ] **Step 8: Verify types and build**

```bash
cd storefront && npx vitest run && npx tsc --noEmit && npx next build
```
Expected: tests PASS, tsc exactly **2** errors, `next build` exit 0. The build is the only
thing that catches a `"use server"` export violation.

- [ ] **Step 9: Commit**

```bash
git add storefront/src/lib/data/support-request.ts storefront/src/modules/support
git commit -m "feat(WB-119): support-request form, action, and env-gated channel config"
```

---

## Task 5: Wire the contact page

**Files:**
- Modify: `storefront/src/app/[countryCode]/(main)/contact/page.tsx`

**Interfaces:**
- Consumes: `supportChannels()` and `ContactForm` (Task 4).

- [ ] **Step 1: Replace the channel block with `supportChannels()`**

The page currently reads `process.env.NEXT_PUBLIC_SUPPORT_EMAIL` directly. Swap that for
`supportChannels()` so email and phone share one rule, and render:

- the `mailto:` when `email` is set (keep the existing styling),
- a `tel:` link when `phone` is set,
- the existing "reply to any order email" prose **only when `hasAny` is false**.

- [ ] **Step 2: Mount the form**

Add `<ContactForm />` below the channel block, under a `SUPPORT` label, reading
`?subject=`, `?vehicle=` and `?product=` from `searchParams` to prefill. The page is a
server component; take `searchParams` from its props and pass primitives down.

- [ ] **Step 3: Update the metadata description**

It currently says "Get help with an order, fitment, returns, or anything else" — accurate
once a form exists. Leave it.

- [ ] **Step 4: Verify the page renders both states**

```bash
cd storefront && npx next build
```
Then reason through both branches explicitly and record it in the commit body: with no env
vars set, **no email and no phone must appear anywhere** on the page.

- [ ] **Step 5: Commit**

```bash
git add "storefront/src/app/[countryCode]/(main)/contact/page.tsx"
git commit -m "feat(WB-119): contact page gains a real form and an env-gated phone channel"
```

---

## Task 6: Fitment-check CTAs

**Files:**
- Modify: `storefront/src/modules/product-detail/components/tire/fitment.tsx`
- Modify: `storefront/src/modules/product-detail/components/fitment/index.tsx`

- [ ] **Step 1: Point the tyre CTA at a prefilled form**

At `tire/fitment.tsx` the link is `href="/contact"` under copy promising *"we usually
confirm within 24 hours"*. Change the href to carry context:

```tsx
href={`/contact?subject=${encodeURIComponent("Fitment check")}&source=fitment-check${
  vehicleLabel ? `&vehicle=${encodeURIComponent(vehicleLabel)}` : ""
}${product?.handle ? `&product=${encodeURIComponent(product.handle)}` : ""}`}
```

- [ ] **Step 2: Soften the unconfirmed time promise**

Change *"— we usually confirm within 24 hours."* to *"— we'll get back to you by email."*
until the client confirms a real response time (client-input item 5). Promising 24 hours
with nobody monitoring an inbox is worse than promising nothing.

- [ ] **Step 3: Add the equivalent CTA to the wheel PDP**

`product-detail/components/fitment/index.tsx` has no such CTA at all — a shopper whose
vehicle isn't listed has no route forward. Add the same line at the end of the section,
using the same href shape and the wheel product's handle.

- [ ] **Step 4: Verify**

```bash
cd storefront && npx vitest run && npx tsc --noEmit && npx next build
```
Expected: tests PASS, tsc exactly **2**, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/product-detail/components
git commit -m "feat(WB-119): fitment-check CTAs reach a real form, on both PDPs"
```

---

## Task 7: Stop swallowing email send failures

**Files:**
- Modify: `backend/src/subscribers/order-placed.ts`
- Test: `backend/src/subscribers/__tests__/order-placed.test.ts`

**Why this is Q-19's real work.** WB-094 made the Resend provider throw instead of
silently recording success. But this subscriber wraps the call in
`try { … } catch { console.error(…) }` — so the throw is caught, written to `console`
rather than the Medusa logger, and the event is marked handled with no retry. The tester's
"didn't receive any" is currently indistinguishable from "sent fine" in the logs.

- [ ] **Step 1: Write the failing test**

```ts
import orderPlacedHandler from "../order-placed"

const makeContainer = (notify: jest.Mock, logger: any) => ({
  resolve: (key: string) => {
    if (String(key).includes("notification")) return { createNotifications: notify }
    if (String(key).includes("order")) {
      return {
        retrieveOrder: jest.fn().mockResolvedValue({
          id: "order_1",
          email: "qa@example.com",
          shipping_address: { id: "addr_1" },
          items: [],
        }),
        orderAddressService_: { retrieve: jest.fn().mockResolvedValue({ id: "addr_1" }) },
      }
    }
    return logger
  },
})

describe("order-placed subscriber (WB-119 Q-19)", () => {
  it("logs a send failure through the Medusa logger, not console", async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
    const notify = jest.fn().mockRejectedValue(new Error("Resend rejected"))

    await orderPlacedHandler({
      event: { data: { id: "order_1" } },
      container: makeContainer(notify, logger),
    } as any)

    expect(logger.error).toHaveBeenCalled()
    const msg = logger.error.mock.calls.map((c: any[]) => String(c[0])).join(" ")
    expect(msg).toMatch(/order_1/)
    expect(msg).toMatch(/confirmation/i)
  })

  it("does not log an error when the send succeeds", async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
    const notify = jest.fn().mockResolvedValue(undefined)

    await orderPlacedHandler({
      event: { data: { id: "order_1" } },
      container: makeContainer(notify, logger),
    } as any)

    expect(logger.error).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx jest src/subscribers/__tests__/order-placed.test.ts
```
Expected: FAIL — the handler uses `console.error`, so `logger.error` is never called.

- [ ] **Step 3: Replace the swallow**

```ts
  } catch (error: any) {
    // WB-119 Q-19. This used to be `console.error`, which meant a failed
    // order-confirmation email was invisible: WB-094 made the Resend provider
    // throw instead of silently recording success, and this catch then threw
    // that signal away. Route it through the Medusa logger so it lands in
    // production logs like every other backend error.
    //
    // Deliberately still swallowed rather than rethrown: the order is already
    // placed and paid: failing the subscriber would retry the whole handler
    // and risk duplicate sends, which is worse for the customer than a missing
    // email that shows up loudly in the logs.
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `Failed to send order confirmation for order ${data.id}: ${error?.message ?? error}`
    )
  }
```

- [ ] **Step 4: Run the test**

```bash
cd backend && npx jest src/subscribers/__tests__/order-placed.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Full backend gate**

```bash
cd backend && npx jest && npx tsc --noEmit && npx medusa build
```
Expected: all PASS, tsc clean, build exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/subscribers/order-placed.ts backend/src/subscribers/__tests__/order-placed.test.ts
git commit -m "fix(WB-119): a failed order email is now loud in the logs, not console-only"
```

---

## Task 8: Env template + docs closeout

**Files:**
- Modify: `storefront/.env.local.template`
- Modify: `docs/reference/go-live-runbook.md`
- Modify: `docs/future/BACKLOG.md`, `docs/STATUS.md`

- [ ] **Step 1: Document the new env vars**

Add to `storefront/.env.local.template`, with comments saying each renders nothing when
unset:

```
# Support channels shown on /contact. Each renders ONLY when set — a fake
# address is worse than none. Pending from the client.
NEXT_PUBLIC_SUPPORT_EMAIL=
NEXT_PUBLIC_SUPPORT_PHONE=
```

⚠️ Do **not** add these to `check-env-variables.js`'s hard-required list — an unset
support phone must not fail the build.

- [ ] **Step 2: Runbook**

Add a WB-119 section: run the `support_request` migration on deploy (it runs automatically
via `init-backend`), set the two `NEXT_PUBLIC_SUPPORT_*` vars, then **rebuild the
storefront** — `NEXT_PUBLIC_*` values are baked in at build time, so setting them without a
rebuild changes nothing.

- [ ] **Step 3: Where to read submissions**

Until an admin UI exists, submissions are read straight from the database. Record the query
in the runbook:

```sql
select created_at, source, name, email, phone, vehicle, product_handle, subject, message
from support_request
where deleted_at is null
order by created_at desc
limit 50;
```

Note as a follow-up that an admin console route (mirroring the vendor-sync console, WB-006)
would be the proper home for this.

- [ ] **Step 4: Update BACKLOG + STATUS**

Set WB-119 `status: done`, record the real gate numbers, and state plainly that **email
delivery remains impossible until a sending domain exists** — the code is ready, the
config is not.

- [ ] **Step 5: `/doc-review`**

Fix anything it flags.

- [ ] **Step 6: Commit**

```bash
git add docs storefront/.env.local.template
git commit -m "docs(WB-119): close out support & lead capture"
```

---

## Wave 2 exit criteria

- [ ] `POST /store/support-request` stores a row and returns 201.
- [ ] A submission still returns 201 when no notification can be sent — nothing is lost.
- [ ] With both env vars unset, **no email address and no phone number appear anywhere** on `/contact`, and the form still works.
- [ ] Both PDPs have a fitment-check CTA reaching a prefilled form.
- [ ] A failed order-confirmation email is logged via the Medusa logger.
- [ ] Backend jest + tsc + `medusa build` clean; storefront vitest + `next build` clean, tsc at exactly 2.
- [ ] No unconfirmed time promise ("24 hours") remains in the copy.

## What this wave deliberately does NOT do

- Send any email. There is no sending domain (client-input item 6).
- Invent a support email or phone number.
- Build an admin UI for reading submissions (SQL query documented instead; tracked as a follow-up).
- Add double-opt-in, captcha or rate limiting beyond the validator's length caps — worth revisiting if the endpoint attracts spam (WB-057 already tracks newsletter hardening).
