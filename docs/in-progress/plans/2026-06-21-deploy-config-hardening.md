# Deploy & Config Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three silent-misconfiguration failure modes (feed truncation, CORS, hidden module disable) and commit reproducible Railway deploy config, so the backend is safe to deploy.

**Architecture:** Each code item extracts a small **pure helper** into `backend/src/lib/`, unit-tested with Jest, then called from the thin config layer (`medusa-config.js` / `src/lib/constants.ts`). Both already import TS modules via the `lib/*` path alias. WB-040 adds static `railway.json` files.

**Tech Stack:** MedusaJS 2.13.6 (Node 22, pnpm 9.10), TypeScript, Jest + `@swc/jest`, Railway/Nixpacks.

## Global Constraints

- Backlog ids: WB-027 (devMaxRows), WB-039 (CORS), WB-010 (module status), WB-040 (railway.json).
- **Never log a secret VALUE** — only booleans and env-var NAMES (WB-049 lesson).
- No DB migrations. No change to how modules are *wired* (WB-010 only adds a log).
- All Jest commands run **from `backend/`** (the `jest.config.js` lives there). Use `npx jest …` because pnpm may not be on PATH (Windows).
- `jest.config.js` already has `testMatch: ['<rootDir>/src/**/*.test.ts']`, so any `*.test.ts` under `src/` is picked up.
- TS helpers are imported into `medusa-config.js` via the path alias (e.g. `from 'lib/dev-max-rows'`), exactly like the existing `from 'modules/vendor-sync/search/build-search-document'` import.
- End every commit message with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 1: WB-027 — `resolveDevMaxRows` (explicit opt-in truncation)

**Files:**
- Create: `backend/src/lib/dev-max-rows.ts`
- Test: `backend/src/lib/__tests__/dev-max-rows.test.ts`
- Modify: `backend/medusa-config.js:76-84` (replace the `devMaxRows` block + comment), `backend/medusa-config.js:1-52` (add import)
- Modify: `backend/package.json:22` (add `test:config` script)
- Modify: `backend/.env.template` (un-comment `VENDOR_SYNC_DEV_MAX_ROWS=1000`, update note)

**Interfaces:**
- Produces: `resolveDevMaxRows(raw: string | undefined): number | undefined`

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/__tests__/dev-max-rows.test.ts`:

```ts
import { resolveDevMaxRows } from '../dev-max-rows'

describe('resolveDevMaxRows', () => {
  it('returns undefined when unset (full feed)', () => {
    expect(resolveDevMaxRows(undefined)).toBeUndefined()
  })
  it('returns undefined for empty / whitespace', () => {
    expect(resolveDevMaxRows('')).toBeUndefined()
    expect(resolveDevMaxRows('   ')).toBeUndefined()
  })
  it('returns the positive integer when set', () => {
    expect(resolveDevMaxRows('500')).toBe(500)
    expect(resolveDevMaxRows(' 1000 ')).toBe(1000)
  })
  it('returns undefined for zero, negative, or non-numeric', () => {
    expect(resolveDevMaxRows('0')).toBeUndefined()
    expect(resolveDevMaxRows('-1')).toBeUndefined()
    expect(resolveDevMaxRows('abc')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`: `npx jest src/lib/__tests__/dev-max-rows.test.ts`
Expected: FAIL — "Cannot find module '../dev-max-rows'".

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/lib/dev-max-rows.ts`:

```ts
/**
 * Vendor-sync feed-truncation cap (WB-027).
 *
 * Truncation is an explicit, environment-independent choice: it is active ONLY when
 * VENDOR_SYNC_DEV_MAX_ROWS is set to a positive integer. There is intentionally NO
 * NODE_ENV coupling — a NODE_ENV=staging box must never silently truncate the feed.
 *
 * @param raw the raw VENDOR_SYNC_DEV_MAX_ROWS env value
 * @returns a positive row cap, or undefined for "no cap / full feed"
 */
export function resolveDevMaxRows(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}
```

- [ ] **Step 4: Run test to verify it passes**

From `backend/`: `npx jest src/lib/__tests__/dev-max-rows.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `medusa-config.js`**

Add to the import block at the top of `backend/medusa-config.js` (after the `buildSearchDocument` import on line 52):

```js
import { resolveDevMaxRows } from 'lib/dev-max-rows';
```

Replace the existing block at `backend/medusa-config.js:76-84`:

```js
// Dev/test-only feed truncation. Outside production we cap how many CSV rows
// vendor-sync stages so local "first import" runs finish fast instead of
// staging + diffing + applying the entire feed. Override the row count with
// VENDOR_SYNC_DEV_MAX_ROWS; in production NODE_ENV==='production' => undefined
// => full feed. (medusa develop sets NODE_ENV=development before .env loads,
// so this triggers for local dev even if .env says NODE_ENV=Local.)
const devMaxRows = process.env.NODE_ENV !== 'production'
  ? parseInt(process.env.VENDOR_SYNC_DEV_MAX_ROWS ?? '1000', 10)
  : undefined
```

with:

```js
// Vendor-sync feed-truncation cap (WB-027). Explicit opt-in: active ONLY when
// VENDOR_SYNC_DEV_MAX_ROWS is set to a positive integer — no NODE_ENV coupling, so a
// NODE_ENV=staging box never silently truncates the feed. Local dev opts in via
// .env.template (VENDOR_SYNC_DEV_MAX_ROWS=1000) to keep first-import fast.
const devMaxRows = resolveDevMaxRows(process.env.VENDOR_SYNC_DEV_MAX_ROWS)
```

- [ ] **Step 6: Add the `test:config` script**

In `backend/package.json` scripts (after the `test:fitment` line), add:

```json
    "test:config": "jest src/lib",
```

- [ ] **Step 7: Update `.env.template`**

In `backend/.env.template`, find the dev-truncation block near the end. Change the comment to reflect opt-in semantics and **un-comment** the var so local dev keeps fast imports:

```
# Vendor-sync feed truncation (WB-027): EXPLICIT opt-in, no NODE_ENV coupling.
# Truncation is active ONLY when this var is set to a positive integer. Leave it set
# for fast local first-imports; UNSET it (or remove) in staging/production to run the
# full feed.
VENDOR_SYNC_DEV_MAX_ROWS=1000
```

- [ ] **Step 8: Run the config suite + commit**

From `backend/`: `npx jest src/lib`
Expected: PASS.

```bash
git add backend/src/lib/dev-max-rows.ts backend/src/lib/__tests__/dev-max-rows.test.ts backend/medusa-config.js backend/package.json backend/.env.template
git commit -m "feat(config): devMaxRows explicit opt-in, drop NODE_ENV coupling (WB-027)"
```

---

### Task 2: WB-039 — `resolveCors` (fail loud in production)

**Files:**
- Create: `backend/src/lib/cors.ts`
- Test: `backend/src/lib/__tests__/cors.test.ts`
- Modify: `backend/src/lib/constants.ts:30-43` (replace the three CORS exports), add `IS_PRODUCTION` + import
- Modify: `backend/.env.template` (add CORS-required-in-prod note)

**Interfaces:**
- Produces: `resolveCors(value: string | undefined, opts: { isProduction: boolean; devDefault: string; name: string }): string`

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/__tests__/cors.test.ts`:

```ts
import { resolveCors } from '../cors'

describe('resolveCors', () => {
  const base = { isProduction: false, devDefault: 'http://localhost:8000', name: 'STORE_CORS' }

  it('returns the value verbatim when set', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCors('https://shop.example', base)).toBe('https://shop.example')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns the dev default + warns when unset in non-production', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCors(undefined, base)).toBe('http://localhost:8000')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('STORE_CORS')
    warn.mockRestore()
  })

  it('treats empty / whitespace as unset', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCors('   ', base)).toBe('http://localhost:8000')
    warn.mockRestore()
  })

  it('throws an actionable error when unset in production', () => {
    expect(() => resolveCors(undefined, { ...base, isProduction: true })).toThrow(/STORE_CORS/)
    expect(() => resolveCors(undefined, { ...base, isProduction: true })).toThrow(/production/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`: `npx jest src/lib/__tests__/cors.test.ts`
Expected: FAIL — "Cannot find module '../cors'".

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/lib/cors.ts`:

```ts
/**
 * Resolve a CORS origin list with a safe, non-silent fallback (WB-039).
 *
 * - value set            -> value (verbatim)
 * - unset + production   -> throw. We cannot derive a safe prod CORS default (the backend
 *                           does not know the storefront origin), so failing loud at startup
 *                           beats silently allowing or blocking all origins.
 * - unset + non-prod     -> devDefault, with a console.warn naming the var to set.
 */
export function resolveCors(
  value: string | undefined,
  opts: { isProduction: boolean; devDefault: string; name: string },
): string {
  if (value != null && value.trim() !== '') return value
  if (opts.isProduction) {
    throw new Error(
      `${opts.name} is required in production (NODE_ENV=production) but is not set. ` +
        `Set ${opts.name} to a comma-separated list of allowed origins ` +
        `(e.g. https://your-storefront.example).`,
    )
  }
  console.warn(
    `[cors] ${opts.name} not set — using dev default "${opts.devDefault}". ` +
      `Set ${opts.name} explicitly before deploying.`,
  )
  return opts.devDefault
}
```

- [ ] **Step 4: Run test to verify it passes**

From `backend/`: `npx jest src/lib/__tests__/cors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `constants.ts`**

In `backend/src/lib/constants.ts`, add the import near the top (after the `assertValue` import on line 3):

```ts
import { resolveCors } from 'lib/cors'
```

Add an `IS_PRODUCTION` constant next to `IS_DEV` (after line 10):

```ts
/**
 * Is production environment
 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'
```

Replace the three CORS exports at `backend/src/lib/constants.ts:30-43`:

```ts
/**
 * Admin CORS origins
 */
export const ADMIN_CORS = process.env.ADMIN_CORS;

/**
 * Auth CORS origins
 */
export const AUTH_CORS = process.env.AUTH_CORS;

/**
 * Store/frontend CORS origins
 */
export const STORE_CORS = process.env.STORE_CORS;
```

with:

```ts
/**
 * Admin CORS origins. Required in production; dev falls back to localhost (WB-039).
 */
export const ADMIN_CORS = resolveCors(process.env.ADMIN_CORS, {
  isProduction: IS_PRODUCTION,
  devDefault: 'http://localhost:7000,http://localhost:7001',
  name: 'ADMIN_CORS',
});

/**
 * Auth CORS origins. Required in production; dev falls back to localhost (WB-039).
 */
export const AUTH_CORS = resolveCors(process.env.AUTH_CORS, {
  isProduction: IS_PRODUCTION,
  devDefault: 'http://localhost:7000,http://localhost:7001',
  name: 'AUTH_CORS',
});

/**
 * Store/frontend CORS origins. Required in production; dev falls back to localhost (WB-039).
 */
export const STORE_CORS = resolveCors(process.env.STORE_CORS, {
  isProduction: IS_PRODUCTION,
  devDefault: 'http://localhost:8000',
  name: 'STORE_CORS',
});
```

- [ ] **Step 6: Update `.env.template`**

In `backend/.env.template`, replace the three existing CORS lines (`ADMIN_CORS=…`, `STORE_CORS=…`, `AUTH_CORS=…`) with a noted block:

```
# CORS allowed origins. REQUIRED in production — the backend throws on startup if any of
# these is unset when NODE_ENV=production (WB-039). Dev falls back to localhost + a warning.
ADMIN_CORS=http://localhost:7000,http://localhost:7001,https://docs.medusajs.com
STORE_CORS=http://localhost:8000,https://docs.medusajs.com
AUTH_CORS=http://localhost:7000,http://localhost:7001,https://docs.medusajs.com
```

- [ ] **Step 7: Run the config suite + commit**

From `backend/`: `npx jest src/lib`
Expected: PASS (dev-max-rows + cors).

```bash
git add backend/src/lib/cors.ts backend/src/lib/__tests__/cors.test.ts backend/src/lib/constants.ts backend/.env.template
git commit -m "feat(config): CORS safe default, fail loud in production (WB-039)"
```

---

### Task 3: WB-010 — startup module status report

**Files:**
- Create: `backend/src/lib/module-status.ts`
- Test: `backend/src/lib/__tests__/module-status.test.ts`
- Modify: `backend/medusa-config.js` (add import; log once before `export default`)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `interface ModuleStatusRow { name: string; enabled: boolean; controlledBy: string }`, `buildModuleStatusReport(env: NodeJS.ProcessEnv): ModuleStatusRow[]`, `formatModuleStatusReport(rows: ModuleStatusRow[]): string`

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/__tests__/module-status.test.ts`:

```ts
import { buildModuleStatusReport, formatModuleStatusReport } from '../module-status'

describe('buildModuleStatusReport', () => {
  it('marks every optional module disabled for an empty env', () => {
    const rows = buildModuleStatusReport({})
    expect(rows.length).toBe(8)
    expect(rows.every((r) => r.enabled === false)).toBe(true)
  })

  it('enables modules when their controlling vars are present', () => {
    const env = {
      MINIO_ENDPOINT: 'x', MINIO_ACCESS_KEY: 'x', MINIO_SECRET_KEY: 'secret',
      REDIS_URL: 'redis://x',
      SENDGRID_API_KEY: 'x', SENDGRID_FROM_EMAIL: 'a@b.c',
      RESEND_API_KEY: 'x', RESEND_FROM_EMAIL: 'a@b.c',
      STRIPE_API_KEY: 'x', STRIPE_WEBHOOK_SECRET: 'x',
      VENDOR_WHEELPROS_WHEELS_ENABLED: 'true',
      WHEEL_SIZE_API_KEY: 'x',
      MEILISEARCH_HOST: 'x', MEILISEARCH_ADMIN_KEY: 'x',
    } as NodeJS.ProcessEnv
    const rows = buildModuleStatusReport(env)
    expect(rows.every((r) => r.enabled === true)).toBe(true)
  })

  it('vendor-sync enables on the tires flag alone', () => {
    const rows = buildModuleStatusReport({ VENDOR_WHEELPROS_TIRES_ENABLED: 'true' } as NodeJS.ProcessEnv)
    const vendor = rows.find((r) => r.name.startsWith('Vendor-sync'))!
    expect(vendor.enabled).toBe(true)
  })

  it('format output never leaks a secret value', () => {
    const env = { MINIO_ENDPOINT: 'x', MINIO_ACCESS_KEY: 'x', MINIO_SECRET_KEY: 'TOPSECRET' } as NodeJS.ProcessEnv
    const out = formatModuleStatusReport(buildModuleStatusReport(env))
    expect(out).not.toContain('TOPSECRET')
    expect(out).toContain('MINIO_ENDPOINT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`: `npx jest src/lib/__tests__/module-status.test.ts`
Expected: FAIL — "Cannot find module '../module-status'".

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/lib/module-status.ts`:

```ts
/**
 * Startup report of which OPTIONAL modules are enabled/disabled and the env var(s) that
 * control each (WB-010). Mirrors the exact conditions in medusa-config.js. The report
 * carries ONLY booleans and env-var NAMES — never a secret value (WB-049).
 */
export interface ModuleStatusRow {
  name: string
  enabled: boolean
  controlledBy: string
}

export function buildModuleStatusReport(env: NodeJS.ProcessEnv): ModuleStatusRow[] {
  const has = (k: string) => typeof env[k] === 'string' && env[k]!.trim() !== ''
  const isTrue = (k: string) => env[k] === 'true'
  return [
    {
      name: 'File: MinIO (else local disk)',
      enabled: has('MINIO_ENDPOINT') && has('MINIO_ACCESS_KEY') && has('MINIO_SECRET_KEY'),
      controlledBy: 'MINIO_ENDPOINT,MINIO_ACCESS_KEY,MINIO_SECRET_KEY',
    },
    {
      name: 'Redis event-bus + workflow',
      enabled: has('REDIS_URL'),
      controlledBy: 'REDIS_URL',
    },
    {
      name: 'Notification: SendGrid',
      enabled: has('SENDGRID_API_KEY') && (has('SENDGRID_FROM_EMAIL') || has('SENDGRID_FROM')),
      controlledBy: 'SENDGRID_API_KEY,SENDGRID_FROM_EMAIL',
    },
    {
      name: 'Notification: Resend',
      enabled: has('RESEND_API_KEY') && (has('RESEND_FROM_EMAIL') || has('RESEND_FROM')),
      controlledBy: 'RESEND_API_KEY,RESEND_FROM_EMAIL',
    },
    {
      name: 'Payment: Stripe',
      enabled: has('STRIPE_API_KEY') && has('STRIPE_WEBHOOK_SECRET'),
      controlledBy: 'STRIPE_API_KEY,STRIPE_WEBHOOK_SECRET',
    },
    {
      name: 'Vendor-sync',
      enabled: isTrue('VENDOR_WHEELPROS_WHEELS_ENABLED') || isTrue('VENDOR_WHEELPROS_TIRES_ENABLED'),
      controlledBy: 'VENDOR_WHEELPROS_WHEELS_ENABLED,VENDOR_WHEELPROS_TIRES_ENABLED',
    },
    {
      name: 'wheel-size fitment',
      enabled: has('WHEEL_SIZE_API_KEY'),
      controlledBy: 'WHEEL_SIZE_API_KEY',
    },
    {
      name: 'Meilisearch',
      enabled: has('MEILISEARCH_HOST') && has('MEILISEARCH_ADMIN_KEY'),
      controlledBy: 'MEILISEARCH_HOST,MEILISEARCH_ADMIN_KEY',
    },
  ]
}

export function formatModuleStatusReport(rows: ModuleStatusRow[]): string {
  const width = Math.max(...rows.map((r) => r.name.length))
  const lines = rows.map((r) => {
    const status = r.enabled ? 'ENABLED ' : 'DISABLED'
    return `  ${r.name.padEnd(width)}  ${status}  (${r.controlledBy})`
  })
  return ['[modules] optional module status:', ...lines].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

From `backend/`: `npx jest src/lib/__tests__/module-status.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `medusa-config.js`**

Add to the import block at the top of `backend/medusa-config.js`:

```js
import { buildModuleStatusReport, formatModuleStatusReport } from 'lib/module-status';
```

At the bottom of `backend/medusa-config.js`, immediately BEFORE the `export default defineConfig(medusaConfig);` line (and after the existing WB-049 do-not-log comment), add:

```js
// WB-010: log which optional modules are enabled/disabled (names + booleans ONLY — never
// values, per WB-049) so a silently-missing module is diagnosable from deploy logs.
console.log(formatModuleStatusReport(buildModuleStatusReport(process.env)));
```

- [ ] **Step 6: Run the config suite + commit**

From `backend/`: `npx jest src/lib`
Expected: PASS (dev-max-rows + cors + module-status).

```bash
git add backend/src/lib/module-status.ts backend/src/lib/__tests__/module-status.test.ts backend/medusa-config.js
git commit -m "feat(config): startup enabled/disabled report for optional modules (WB-010)"
```

---

### Task 4: WB-040 — committed Railway deploy config

**Files:**
- Create: `backend/railway.json`
- Create: `storefront/railway.json`

**Interfaces:** none (static config).

- [ ] **Step 1: Create `backend/railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 2: Create `storefront/railway.json`**

(No `healthcheckPath`: Next `/` 307-redirects through the country-code middleware, which a Railway healthcheck treats as non-200. Rely on Railway's default readiness check.)

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 3: Verify both files are valid JSON**

From repo root: `node -e "require('./backend/railway.json'); require('./storefront/railway.json'); console.log('both valid')"`
Expected: `both valid`.

- [ ] **Step 4: Commit**

```bash
git add backend/railway.json storefront/railway.json
git commit -m "chore(infra): commit per-app railway.json (Nixpacks, start + restart policy) (WB-040)"
```

---

### Task 5: Regression check + docs finalization

**Files:**
- Modify: `docs/future/BACKLOG.md` (WB-010/027/039/040 → `done` + `done:` lines)
- Modify: `docs/STATUS.md` (Last verified date + Config/Infra row + Active work)
- Move: `docs/in-progress/specs/2026-06-21-deploy-config-hardening-design.md` → `docs/done/specs/`
- Move: `docs/in-progress/plans/2026-06-21-deploy-config-hardening.md` → `docs/done/plans/`

- [ ] **Step 1: Full backend test regression**

From `backend/`: `npx jest`
Expected: the prior suite count (per STATUS, 217 passing / 4 skipped) **plus the 12 new lib tests** all PASS — no regressions.

- [ ] **Step 2: Flip the four backlog items to `done`**

In `docs/future/BACKLOG.md`, for WB-010, WB-027, WB-039, WB-040: set `- status: done` and add a `- done:` line summarizing the change (helper name, decision, verified by the new Jest spec). Example for WB-027:

```
- status: done
- done: 2026-06-21 — resolveDevMaxRows() in backend/src/lib/dev-max-rows.ts; truncation is
  explicit opt-in (VENDOR_SYNC_DEV_MAX_ROWS only, no NODE_ENV). .env.template ships =1000 for
  dev. Verified by dev-max-rows.test.ts (4 cases).
```

- [ ] **Step 3: Update `docs/STATUS.md`**

Bump "Last verified" to `2026-06-21`. Update the **Config / Infra** pillar row to note: module status logging (WB-010), CORS fail-loud-in-prod (WB-039), devMaxRows opt-in (WB-027), committed railway.json (WB-040); remove those ids from its "Open backlog" cell. Update "Active work"/"Next up" to reflect Session 1 done and WB-016 still the remaining blocker.

- [ ] **Step 4: Move spec + plan to `done/`**

```bash
git mv docs/in-progress/specs/2026-06-21-deploy-config-hardening-design.md docs/done/specs/2026-06-21-deploy-config-hardening-design.md
git mv docs/in-progress/plans/2026-06-21-deploy-config-hardening.md docs/done/plans/2026-06-21-deploy-config-hardening.md
```

- [ ] **Step 5: Run `/doc-review`**

Invoke the `doc-review` skill. Resolve any drift it flags (stale ids, evidence mismatches).

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs(deploy-config): close WB-010/027/039/040 — flip backlog, bump STATUS, move spec+plan to done"
```

---

## Self-Review

**Spec coverage:**
- WB-027 → Task 1 ✓ · WB-039 → Task 2 ✓ · WB-010 → Task 3 ✓ · WB-040 → Task 4 ✓
- Testing (3 specs + `test:config`) → Tasks 1–3 + Task 1 Step 6 ✓
- `.env.template` notes → Task 1 Step 7 + Task 2 Step 6 ✓
- BACKLOG/STATUS flips + move spec/plan + doc-review → Task 5 ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; commands have expected output.

**Type consistency:** `resolveDevMaxRows`, `resolveCors`, `buildModuleStatusReport`/`formatModuleStatusReport`/`ModuleStatusRow` used identically in tests, helpers, and wiring. Import paths (`lib/dev-max-rows`, `lib/cors`, `lib/module-status`) match the alias style already in `medusa-config.js`.

## Out of scope

- WB-016 (partial-apply retry) — separate spec.
- Module *wiring* changes (WB-010 only logs).
- Storefront deploy config beyond `railway.json`.
