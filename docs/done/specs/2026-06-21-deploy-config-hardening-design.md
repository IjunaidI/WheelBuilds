# Deploy & Config Hardening — Design (Session 1)

> Status: done (shipped 2026-06-21) · Created 2026-06-21 · Backlog: WB-010, WB-027, WB-039, WB-040
> Theme: get the backend to a deployable, non-silent, reproducible state.

## Context

The STATUS dashboard frames all remaining work around deploy-readiness. Four backlog
items are pure backend config/infra — no DB migrations, low blast radius, independent of
each other — and together they remove the "silent misconfiguration" failure modes that
make a Railway deploy hard to trust:

- **WB-027** — `devMaxRows` feed truncation keyed off `NODE_ENV` → a `NODE_ENV=staging`
  box silently truncates the catalog.
- **WB-039** — `ADMIN_CORS`/`AUTH_CORS`/`STORE_CORS` are raw `process.env.X`; unset → CORS
  behavior is undefined (may silently allow/reject all origins).
- **WB-010** — optional modules register conditionally with **no log**; a missing env var
  silently disables a module with nothing in stdout to diagnose it.
- **WB-040** — no committed `railway.json`/Dockerfile/Procfile; deploy config lives only in
  the Railway dashboard and is not reproducible from the repo.

## Design principle

The three code items each follow the same shape: **extract a small pure helper into
`backend/src/lib/`, unit-test it with Jest, and call it from the thin config layer**
(`medusa-config.js` or `src/lib/constants.ts`). Both already import TS modules through the
`lib/*` / `modules/*` path alias, so TS helpers are importable from the JS config file.

This keeps `medusa-config.js` and `constants.ts` declarative and moves all branching logic
behind tested seams.

---

## WB-027 — `devMaxRows` explicit opt-in (no `NODE_ENV` coupling)

**Decision: Approach A — pure explicit opt-in.**

`medusa-config.js:82-84` today:

```js
const devMaxRows = process.env.NODE_ENV !== 'production'
  ? parseInt(process.env.VENDOR_SYNC_DEV_MAX_ROWS ?? '1000', 10)
  : undefined
```

New helper `backend/src/lib/dev-max-rows.ts`:

```ts
// Truncation is an explicit, environment-independent choice.
// Returns a positive row cap iff VENDOR_SYNC_DEV_MAX_ROWS parses to one; else undefined.
export function resolveDevMaxRows(raw: string | undefined): number | undefined
```

- `raw` unset/empty → `undefined` (full feed).
- `raw` parses to a positive integer → that integer.
- `raw` set but non-numeric or `<= 0` → `undefined` (treat as "no cap"; do not crash the
  config load on a typo).

`medusa-config.js` calls `resolveDevMaxRows(process.env.VENDOR_SYNC_DEV_MAX_ROWS)`.

`.env.template`: un-comment `VENDOR_SYNC_DEV_MAX_ROWS=1000` and update the comment to state
truncation is opt-in regardless of `NODE_ENV`, so local dev keeps the fast first-import.

**Verify (WB-027):** `NODE_ENV=staging` with the var unset → full feed; the var set → cap.

---

## WB-039 — CORS safe default / fail-loud in production

**Decision: fail loud (throw) in production; localhost default + warn otherwise.**

New helper `backend/src/lib/cors.ts`:

```ts
// value set            -> value
// unset + production   -> throw (actionable: which var, that it's required in prod)
// unset + non-prod     -> devDefault, and console.warn which var to set
export function resolveCors(
  value: string | undefined,
  opts: { isProduction: boolean; devDefault: string; name: string },
): string
```

`constants.ts` defines `IS_PRODUCTION = process.env.NODE_ENV === 'production'` and the dev
defaults (matching `.env.template`):

- `ADMIN_CORS` dev default `http://localhost:7000,http://localhost:7001`
- `AUTH_CORS`  dev default `http://localhost:7000,http://localhost:7001`
- `STORE_CORS` dev default `http://localhost:8000`

`ADMIN_CORS`/`AUTH_CORS`/`STORE_CORS` exports become
`resolveCors(process.env.X, { isProduction: IS_PRODUCTION, devDefault, name: 'X' })`.

Rationale: we cannot derive a safe production CORS default (the storefront origin is not
known to the backend), so a silent default would either break the storefront or allow all
origins. Throwing at startup is consistent with the existing `assertValue` calls (DB/JWT/
COOKIE) and the WB-041 fail-loud philosophy. Staging (`NODE_ENV=staging`) is non-production,
so it gets localhost defaults + a warning rather than a hard crash — acceptable for a
non-prod box.

**Verify (WB-039):** prod start with a CORS var unset → actionable throw; non-prod → applied
default + clear warning; CORS never silently undefined.

---

## WB-010 — startup module enabled/disabled report

New helper `backend/src/lib/module-status.ts`:

```ts
export interface ModuleStatusRow { name: string; enabled: boolean; controlledBy: string }
// Pure: derives the enable/disable decision for each optional module from an env snapshot,
// mirroring the exact conditions in medusa-config.js. NEVER includes any secret VALUE —
// only the boolean and the controlling env-var name(s).
export function buildModuleStatusReport(env: NodeJS.ProcessEnv): ModuleStatusRow[]
export function formatModuleStatusReport(rows: ModuleStatusRow[]): string
```

Rows (mirroring `medusa-config.js` conditions exactly):

| name | enabled when | controlledBy |
|---|---|---|
| File: MinIO (else local) | `MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY` | `MINIO_ENDPOINT,MINIO_ACCESS_KEY,MINIO_SECRET_KEY` |
| Redis event-bus + workflow | `REDIS_URL` | `REDIS_URL` |
| Notification: SendGrid | `SENDGRID_API_KEY && SENDGRID_FROM_EMAIL` | `SENDGRID_API_KEY,SENDGRID_FROM_EMAIL` |
| Notification: Resend | `RESEND_API_KEY && RESEND_FROM_EMAIL` | `RESEND_API_KEY,RESEND_FROM_EMAIL` |
| Payment: Stripe | `STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET` | `STRIPE_API_KEY,STRIPE_WEBHOOK_SECRET` |
| Vendor-sync | `VENDOR_WHEELPROS_WHEELS_ENABLED==='true' \|\| VENDOR_WHEELPROS_TIRES_ENABLED==='true'` | `VENDOR_WHEELPROS_WHEELS_ENABLED,VENDOR_WHEELPROS_TIRES_ENABLED` |
| wheel-size | `WHEEL_SIZE_API_KEY` | `WHEEL_SIZE_API_KEY` |
| Meilisearch | `MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY` | `MEILISEARCH_HOST,MEILISEARCH_ADMIN_KEY` |

`medusa-config.js` calls `console.log(formatModuleStatusReport(buildModuleStatusReport(process.env)))`
once, right before `export default`. Output is a compact aligned table, e.g.
`[modules] vendor-sync           ENABLED   (VENDOR_WHEELPROS_WHEELS_ENABLED,...)`.

**Verify (WB-010):** start without optional env vars → one clear ENABLED/DISABLED line per
module naming its controlling var; no module silently absent; no secret value printed.

---

## WB-040 — committed Railway deploy config (per app)

**Decision: `railway.json` per app, Nixpacks builder.**

`backend/railway.json`:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "pnpm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

`storefront/railway.json` — same shape, `startCommand: "pnpm start"`, **no** `healthcheckPath`
(Next `/` 307-redirects through the country-code middleware, which Railway's healthcheck
would treat as non-200; rely on Railway's default readiness check instead).

**Assumption (documented in each file via a sibling note in the app README / STATUS):** each
Railway service's **root directory** is set to its app folder (`backend/`, `storefront/`).
This is already true of the live deploy; the files encode it reproducibly. `railway.json`
captures only safe, dashboard-independent settings (builder, start command, restart policy,
backend healthcheck) — it does not attempt to encode env vars or service wiring.

**Verify (WB-040):** both files are valid JSON and a fresh Railway service pointed at an app
dir builds + starts from the committed config without manual start-command entry.

---

## Testing

New Jest specs under `backend/src/lib/__tests__/` (picked up by the existing
`testMatch: src/**/*.test.ts`):

- `resolve-dev-max-rows.test.ts` — unset → undefined; `"500"` → 500; `"0"`/`"-1"`/`"abc"` →
  undefined; whitespace.
- `resolve-cors.test.ts` — value passthrough; unset+prod throws (message names the var);
  unset+non-prod returns devDefault (assert a `console.warn` spy fired).
- `module-status.test.ts` — all-off env → every row `enabled:false`; representative all-on
  env → expected rows `enabled:true`; assert **no secret value** appears in
  `formatModuleStatusReport` output.

Add `"test:config": "jest src/lib"` to `backend/package.json` scripts.

## Docs / cleanup

- `backend/.env.template`: un-comment `VENDOR_SYNC_DEV_MAX_ROWS=1000` (opt-in note); add a
  note that `ADMIN_CORS`/`AUTH_CORS`/`STORE_CORS` are **required in production** (backend
  throws if unset).
- BACKLOG: flip WB-010, WB-027, WB-039, WB-040 → `done` with a `done:` line each.
- STATUS: bump "Last verified" to 2026-06-21; update the Config/Infra pillar row.
- Move this spec + its plan `in-progress → done` on completion.
- Run `/doc-review` before the doc-affecting commit.

## Out of scope

- WB-016 (partial-apply retry) — the remaining true NO-GO blocker; needs its own spec.
- Any change to how modules are *wired* (only adds a status log).
- Storefront deploy config beyond `railway.json` (env validation already exists in
  `check-env-variables.js`).
- Encoding Railway env vars or service relationships in committed config.
