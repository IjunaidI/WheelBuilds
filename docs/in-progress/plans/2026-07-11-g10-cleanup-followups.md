# G10 Cleanup Follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four small code follow-ups left after the G10 epic — the two deferred WB-079 Minors (payment-button transport-error guard, `errText`/`medusaError` dedup) plus the WB-081/WB-082 tidy-ups (drop the 3 demo S3 image hosts, add category/collection URLs to the sitemap). Sentry is deliberately out of scope (needs a DSN/vendor decision).

**Architecture:** Storefront-only, four independent changes on one branch (`feat/g10-cleanup`). One pure seam gets a vitest test (F15's shared extractor); the other three are verify-driven (JSX + config + a metadata route with no unit harness — gate on `tsc` + not breaking existing tests + code correctness).

**Tech Stack:** Next.js 15 App Router / React 19, vitest (`test:unit`). No backend changes, no new dependencies.

## Global Constraints

- **Do NOT swallow `NEXT_REDIRECT`.** A successful `placeOrder()` navigates via the Server Action result; the new payment-button guard must re-throw framework navigation signals (`unstable_rethrow` from `next/navigation`) before showing any error, so the happy checkout path is untouched.
- **F15 must preserve the existing `medusa-error.test.ts` behavior verbatim** — case 1 (`"boom"` → `"Boom."`), case 2 (object-without-`.message` `{code:"E"}` → `'{"code":"E"}.'`, NOT a `TypeError`). The dedup is a refactor, not a behavior change.
- **Storefront tsc stays at the documented 5-error baseline** (`collections.ts`, `onboarding.ts`, `product-onboarding-cta`, `related-products` ×2) — no new errors. Storefront build ignores TS/lint errors, so `tsc --noEmit` + `vitest run` are the gates, not the build.
- **The sitemap route must never throw** — category/collection fetches wrap in try/catch (mirroring the existing product loop) so a data-layer blip still serves the static + product URLs.
- **No new dependencies** — F14 uses `unstable_rethrow` (built into Next 15), the sitemap reuses the existing `getCategoriesList`/`getCollectionsList` data functions.
- **No `wb-` prefix** on any new identifier (project naming rule). New util file name is role-descriptive.

## File Structure

- `storefront/src/lib/util/error-message.ts` — CREATE. `extractMedusaMessage(error)` — the single shared extractor.
- `storefront/src/lib/util/__tests__/error-message.test.ts` — CREATE. Direct unit test for the extractor.
- `storefront/src/lib/util/medusa-error.ts` — MODIFY. Response branch delegates to `extractMedusaMessage`.
- `storefront/src/lib/data/cart.ts` — MODIFY. `errText` delegates to `extractMedusaMessage`.
- `storefront/src/lib/util/__tests__/medusa-error.test.ts` — unchanged (must still pass — it's the F15 regression guard).
- `storefront/src/modules/checkout/components/payment-button/index.tsx` — MODIFY. Guard the 3 `onPaymentCompleted` handlers.
- `storefront/next.config.js` — MODIFY. Remove the 3 demo S3 `remotePatterns`.
- `storefront/src/app/sitemap.ts` — MODIFY. Add category + collection URLs.

---

## Task 1: F15 — shared `extractMedusaMessage`, dedup `medusaError` + `errText`

**Files:**
- Create: `storefront/src/lib/util/error-message.ts`
- Create: `storefront/src/lib/util/__tests__/error-message.test.ts`
- Modify: `storefront/src/lib/util/medusa-error.ts`
- Modify: `storefront/src/lib/data/cart.ts` (the `errText` helper, ~lines 215-233)

**Interfaces:**
- Produces: `extractMedusaMessage(error: any): string | null` — the capitalized, period-terminated message from an axios/SDK-style `error.response.data` (string, `.message`, or JSON-stringified object), or `null` when there's no response data / empty message.

- [ ] **Step 1: Write the failing test.** `storefront/src/lib/util/__tests__/error-message.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { extractMedusaMessage } from "../error-message"

const respErr = (data: unknown) => ({ response: { data } })

describe("extractMedusaMessage", () => {
  it("capitalizes + periods a string message", () => {
    expect(extractMedusaMessage(respErr("boom"))).toBe("Boom.")
  })
  it("reads response.data.message", () => {
    expect(extractMedusaMessage(respErr({ message: "not allowed" }))).toBe("Not allowed.")
  })
  it("JSON-stringifies an object without .message (no TypeError)", () => {
    expect(extractMedusaMessage(respErr({ code: "E" }))).toBe('{"code":"E"}.')
  })
  it("returns null when there is no response", () => {
    expect(extractMedusaMessage({ request: {} })).toBeNull()
    expect(extractMedusaMessage(new Error("x"))).toBeNull()
  })
  it("returns null on empty response data", () => {
    expect(extractMedusaMessage(respErr(""))).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail.**
Run: `cd storefront && npx vitest run src/lib/util/__tests__/error-message.test.ts`
Expected: FAIL ("Cannot find module '../error-message'").

- [ ] **Step 3: Create the extractor.** `storefront/src/lib/util/error-message.ts`:

```ts
/**
 * Shared message extraction for Medusa/axios-style errors (WB-079 F15 dedup).
 * `medusaError` (throws) and `cart.ts`'s `errText` (returns) both derive their
 * user-facing copy from `error.response.data`, which may be a string, an object
 * with `.message`, or an arbitrary object — never assume `.charAt` (that throws
 * a masking TypeError). Returns the capitalized, period-terminated message, or
 * `null` when there is no response data or the message is empty.
 */
export function extractMedusaMessage(error: any): string | null {
  const data = error?.response?.data
  if (data == null) return null
  const raw = data?.message ?? data
  const message =
    typeof raw === "string" ? raw : raw?.message ?? JSON.stringify(raw)
  if (typeof message !== "string" || message.length === 0) return null
  return message.charAt(0).toUpperCase() + message.slice(1) + "."
}
```

- [ ] **Step 4: Run to verify pass.**
Run: `cd storefront && npx vitest run src/lib/util/__tests__/error-message.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Delegate from `medusaError`.** In `medusa-error.ts`, keep the try/catch diagnostic-logging block; replace the extraction (lines 20-27) with:

```ts
    // Extract the user-facing message via the shared helper (WB-079 F15).
    const message = extractMedusaMessage(error) ?? "An error occurred."

    throw new Error(message)
```
And add the import at the top: `import { extractMedusaMessage } from "./error-message"`.
(Behavior is identical for a real response error — `extractMedusaMessage` computes exactly what the old inline code did; the `?? "An error occurred."` only covers the previously-untested empty-data edge.)

- [ ] **Step 6: Delegate from `errText`.** In `cart.ts`, replace the body of `errText` (keep the doc comment) with:

```ts
function errText(error: any): string {
  const fromResponse = extractMedusaMessage(error)
  if (fromResponse) return fromResponse
  if (error?.request) return "No response received. Please try again."
  return error?.message || "An unexpected error occurred. Please try again."
}
```
Add the import near the other `@lib/util` imports in `cart.ts`: `import { extractMedusaMessage } from "@lib/util/error-message"`.

- [ ] **Step 7: Run the regression + new tests.**
Run: `cd storefront && npx vitest run src/lib/util && npx tsc --noEmit`
Expected: `error-message.test.ts` 5/5 + `medusa-error.test.ts` still green (the F15 behavior-preservation guard); tsc no new errors beyond the 5-baseline.

- [ ] **Step 8: Commit.**
```bash
git add storefront/src/lib/util/error-message.ts storefront/src/lib/util/__tests__/error-message.test.ts storefront/src/lib/util/medusa-error.ts storefront/src/lib/data/cart.ts
git commit -m "refactor(g10): F15 shared extractMedusaMessage; medusaError + errText delegate"
```

---

## Task 2: F14 — payment-button transport-error guard

**Files:**
- Modify: `storefront/src/modules/checkout/components/payment-button/index.tsx`

**Interfaces:**
- Consumes: `placeOrder()` (returns `{ error?: string }` on failure, navigates on success).

- [ ] **Step 1: Guard the three `onPaymentCompleted` handlers.** Add the import at the top of the file:

```ts
import { unstable_rethrow } from "next/navigation"
```

Then replace EACH of the three identical `onPaymentCompleted` bodies (Stripe ~108-116, PayPal ~218-226, Manual ~283-291) with:

```ts
  const onPaymentCompleted = async () => {
    // WB-079 B2: placeOrder() RETURNS { error } on failure (Next redacts thrown
    // Server Action messages in prod) and navigates on success. F14: a genuine
    // transport/framework failure (e.g. a network drop mid-RPC) would otherwise
    // reject unhandled and leave the spinner stuck on a real payment — catch it,
    // but re-throw NEXT_REDIRECT/NEXT_NOT_FOUND untouched so the happy path is
    // unaffected.
    try {
      const res = await placeOrder()
      if (res?.error) {
        setErrorMessage(res.error)
        setSubmitting(false)
        return
      }
      // Success: placeOrder() already redirected. Nothing else to do.
    } catch (err) {
      unstable_rethrow(err)
      setErrorMessage("Something went wrong reaching our server. Please try again.")
      setSubmitting(false)
    }
  }
```

(The `GiftCardPaymentButton`'s `handleOrder` is dead code — commented-out call site — leave it unchanged.)

- [ ] **Step 2: Typecheck.**
Run: `cd storefront && npx tsc --noEmit`
Expected: no new errors beyond the 5-baseline. Confirm `unstable_rethrow` resolves from `next/navigation` (no import error).

- [ ] **Step 3: Run the checkout unit tests** to confirm nothing broke.
Run: `cd storefront && npx vitest run src/modules/checkout src/lib`
Expected: green (no unit harness for these buttons, but this catches any collateral).

- [ ] **Step 4: Commit.**
```bash
git add storefront/src/modules/checkout/components/payment-button/index.tsx
git commit -m "fix(g10): F14 payment buttons guard transport errors (rethrow NEXT_REDIRECT)"
```

---

## Task 3: Drop the 3 demo S3 image hosts from `next.config.js`

**Files:**
- Modify: `storefront/next.config.js`

- [ ] **Step 1: Remove the three demo `remotePatterns` blocks.** Delete lines 43-54 (the three `{ ... hostname: "medusa-...s3...amazonaws.com" }` entries each commented `// Note: can be removed after deleting demo products`). Leave the `localhost`, `assets.wheelpros.com`, `images.wheelpros.com`, the env-driven `NEXT_PUBLIC_BASE_URL`/`NEXT_PUBLIC_MEDUSA_BACKEND_URL`/`NEXT_PUBLIC_MINIO_ENDPOINT` blocks intact. After removal the `remotePatterns` array flows straight from the `NEXT_PUBLIC_MEDUSA_BACKEND_URL` block to the `NEXT_PUBLIC_MINIO_ENDPOINT` block.

- [ ] **Step 2: Verify the config still parses.**
Run: `cd storefront && node -e "require('./next.config.js'); console.log('config ok')"`
Expected: `config ok` (no syntax error). NOTE: this executes `check-env-variables()` — if it exits due to a missing `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in the shell env, instead validate by running `npx tsc --noEmit` (unaffected) and eyeballing the diff; the change is a pure deletion of three array elements.

- [ ] **Step 3: Commit.**
```bash
git add storefront/next.config.js
git commit -m "chore(g10): drop the 3 demo S3 image hosts from next.config remotePatterns"
```
(The admin-side deletion of the 4 demo apparel products is a separate OPS step in the go-live runbook; this only removes the now-unneeded image allowlist entries.)

---

## Task 4: Add category + collection URLs to the sitemap

**Files:**
- Modify: `storefront/src/app/sitemap.ts`

**Interfaces:**
- Consumes: `getCategoriesList(offset, limit)` → `{ product_categories: {handle?}[] }`; `getCollectionsList(offset, limit)` → `{ collections: {handle?}[] }`.

- [ ] **Step 1: Import the data functions.** At the top of `sitemap.ts`, add:

```ts
import { getCategoriesList } from "@lib/data/categories"
import { getCollectionsList } from "@lib/data/collections"
```

- [ ] **Step 2: Build a taxonomy list, each fetch try/catch-guarded.** After the `products` block (before the `return`), add:

```ts
  const taxonomy: MetadataRoute.Sitemap = []
  try {
    const { product_categories } = await getCategoriesList(0, 200)
    for (const c of product_categories ?? []) {
      if (c.handle) {
        taxonomy.push({
          url: at(`/categories/${c.handle}`),
          changeFrequency: "weekly",
          priority: 0.5,
        })
      }
    }
  } catch (e) {
    console.error("[sitemap] categories unavailable — skipping:", e)
  }
  try {
    const { collections } = await getCollectionsList(0, 200)
    for (const col of collections ?? []) {
      if (col.handle) {
        taxonomy.push({
          url: at(`/collections/${col.handle}`),
          changeFrequency: "weekly",
          priority: 0.5,
        })
      }
    }
  } catch (e) {
    console.error("[sitemap] collections unavailable — skipping:", e)
  }
```

- [ ] **Step 3: Include taxonomy in the returned sitemap.** Change the final `return`:

```ts
  return [...statics, ...taxonomy, ...products]
```

- [ ] **Step 4: Typecheck + confirm the route compiles.**
Run: `cd storefront && npx tsc --noEmit`
Expected: no new errors beyond the 5-baseline. (The `getCategoriesList` response is loosely typed via its `@ts-ignore`'d SDK call — `product_categories` is present at runtime; `col.handle`/`c.handle` are optional string reads guarded by the `if`.)
Note the single-call cap (limit 200, offset 0) — a wheels/tires store has few categories/collections, well under 200; documented here so a future large-taxonomy store knows to paginate.

- [ ] **Step 5: Commit.**
```bash
git add storefront/src/app/sitemap.ts
git commit -m "feat(g10): sitemap includes category + collection URLs (guarded fetches)"
```

---

## Final verification

- [ ] `cd storefront && npx vitest run` → all green (incl. the new `error-message.test.ts` and the preserved `medusa-error.test.ts`).
- [ ] `cd storefront && npx tsc --noEmit` → exactly the 5 pre-existing baseline errors, none new.
- [ ] Sanity: `/sitemap.xml` now includes `/categories/*` + `/collections/*` (verify live when the app runs); no demo S3 hosts remain in `next.config.js`; a forced transport error in a payment button releases the spinner with a generic message (verify live).

## Self-review checklist (author, before handoff)

- F15 dedup preserves the two `medusa-error.test.ts` cases (Task 1 Step 7 asserts it) ✅ · shared extractor tested directly ✅
- F14 re-throws NEXT_REDIRECT via `unstable_rethrow` before any error UI — happy path untouched ✅ · applied to all 3 live buttons ✅
- next.config.js: pure deletion of 3 array elements, other patterns intact ✅
- sitemap: guarded fetches, never throws; taxonomy added between statics and products ✅
- No new deps, storefront-only, no `wb-` identifiers ✅
