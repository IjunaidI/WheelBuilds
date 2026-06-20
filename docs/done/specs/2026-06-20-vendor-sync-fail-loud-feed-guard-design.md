# WB-041 · Fail-loud feed guard (no more silent sample-CSV sync) — design

> Status: done (2026-06-20) · Author: 2026-06-20 · Backlog: [WB-041](../../future/BACKLOG.md)
> Part of the deploy-hardening sweep. WB-016 (bounded partial-apply retry) is split into its own
> spec — see "Relationship to WB-016" below.

## Problem

When a vendor is **enabled** but neither SFTP nor a local `feedPath` is configured, vendor-sync
**silently** syncs the bundled repo-root sample CSV as if it were the live catalog:

- [`resolve-feed.ts:16`](../../../backend/src/modules/vendor-sync/feed-source/resolve-feed.ts#L16)
  returns `{ kind: "default" }` when neither `sftp` nor `feedPath` is present.
- [`service.ts:182-185`](../../../backend/src/modules/vendor-sync/service.ts#L182-L185) then builds the
  adapter with `undefined` deps, so the adapter constructor falls back to its `DEFAULT_CSV_PATH`
  ([wheels `index.ts:19,26`](../../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/index.ts#L19),
  [tires `index.ts:19,26`](../../../backend/src/modules/vendor-sync/adapters/wheelpros-tires/index.ts#L19)) —
  the repo-root `wheelInvPriceData.csv` / `tireInvPriceData.csv`.
- The fetch succeeds with only an info-level "fetched" log. **No error, no warning.**

Why this is deploy-critical (confirmed by the 2026-06-20 verification + adversarial review):

1. A production deploy that forgets/misconfigures the `VENDOR_WHEELPROS_*_SFTP_*` env vars syncs
   the small bundled sample as the live catalog.
2. The 5% mass-discontinue guard ([`service.ts:292-306`](../../../backend/src/modules/vendor-sync/service.ts#L292-L306))
   that would normally catch a catastrophic shrink is **bypassed when the current catalog is empty**
   (`currentCount === 0`) — i.e. exactly the first-deploy / fresh-DB moment.
3. The RunDate short-circuit then re-affirms that stale sample state on every subsequent 12h cron tick.

There is also a **relocated** form of the same bug: `.env.template` literally suggests
`VENDOR_WHEELPROS_WHEEL_FEED_PATH=./wheelInvPriceData.csv`. A prod that copies that line gets a
"real `feedPath`" classification and silently syncs the sample with no warning — the bug just moves
from `{kind:"default"}` to `{kind:"file"}`.

## Goal

Make vendor-sync **fail loud** rather than silently sync the bundled sample. The bundled sample may
be used **only** when explicitly opted in via `VENDOR_ALLOW_SAMPLE_FEED=true`. No `NODE_ENV`
coupling (the `NODE_ENV=staging` foot-gun — cf. WB-027 — is deliberately avoided).

**Non-goals (out of scope for this spec):** partial-apply retry (WB-016), the dead `applyConcurrency`
(WB-014), `devMaxRows`/`NODE_ENV` staging trap (WB-027), durable archiving (WB-017). This spec is
the feed-source guard only.

## Decision (settled)

Selected approach: **explicit opt-in to the sample** (chosen 2026-06-20).

- A feed is "real" when SFTP config is present **OR** an explicit non-sample `feedPath` is configured.
- Otherwise vendor-sync **throws** unless `VENDOR_ALLOW_SAMPLE_FEED=true`, in which case it uses the
  bundled sample and logs a **prominent warning** every run.
- Fail-loud by default in prod **and** staging; dev/CI opt in via the flag.

Rejected: `NODE_ENV=production` gate (leaves the staging trap open); per-vendor `requireRealFeed`
flag (more config surface, easy to forget).

## Architecture

The single guard lives in `resolveFeed` — the one chokepoint both adapters pass through — so wheels
and tires are covered uniformly and no per-adapter logic can drift. The opt-in flag is plumbed as a
**module option** (like every other vendor setting) and passed into `resolveFeed` as an explicit
argument, so the resolver stays a pure function of its inputs (no `process.env` read deep in the
module) and is unit-testable without I/O.

### 1. Flag plumbing (option, not ambient env)

- [`backend/src/lib/constants.ts`](../../../backend/src/lib/constants.ts#L104-L110) — add
  `export const VENDOR_ALLOW_SAMPLE_FEED = process.env.VENDOR_ALLOW_SAMPLE_FEED` in the vendor-sync block.
- [`backend/medusa-config.js`](../../../backend/medusa-config.js#L192-L213) — import it and add
  `allowSampleFeed: VENDOR_ALLOW_SAMPLE_FEED === 'true'` to the vendor-sync module `options` (beside
  `discontinueThreshold`, `dryRun`, `devMaxRows`).
- [`service.ts` `VendorSyncModuleOptions`](../../../backend/src/modules/vendor-sync/service.ts#L22-L37) —
  add `allowSampleFeed?: boolean`.

### 2. The guard in `resolveFeed` (pure, arg-driven)

New signature:

```ts
resolveFeed(
  cfg: FeedConfig,
  lastSeen: LastSeen | null,
  opts: { allowSample: boolean; vendorCode: string },
): Promise<ResolvedFeed>
```

Resolution logic (replaces [`resolve-feed.ts:11-17`](../../../backend/src/modules/vendor-sync/feed-source/resolve-feed.ts#L11-L17)):

1. `cfg.sftp` present → `downloadNewestViaSftp(cfg.sftp, lastSeen)` (unchanged; `allowSample` is
   irrelevant when a real SFTP feed exists).
2. `cfg.feedPath` present:
   - if `isSampleFeedPath(cfg.feedPath)` **and** `!allowSample` → **throw** `SampleFeedNotAllowedError`.
   - else → `{ kind: "file", … }` (unchanged shape).
3. Neither sftp nor feedPath:
   - if `!allowSample` → **throw** `SampleFeedNotAllowedError`.
   - else → `{ kind: "default" }` (adapter uses its bundled `DEFAULT_CSV_PATH`).

Supporting pieces (in the `feed-source/` layer):

- `SAMPLE_FEED_FILENAMES = new Set(["wheelInvPriceData.csv", "tireInvPriceData.csv"])` — the bundled
  sample basenames. `isSampleFeedPath(p)` = `SAMPLE_FEED_FILENAMES.has(path.basename(p))`.
  (Basename comparison, not `__dirname` arithmetic — resilient and matches how the samples are named.
  False-positive risk: a live feed coincidentally named identically would throw with an actionable
  "set `VENDOR_ALLOW_SAMPLE_FEED`" message — recoverable, acceptable.)
- `class SampleFeedNotAllowedError extends Error` (exported, for assertable tests). Message names the
  exact remedy:
  > `[vendor-sync] No live feed configured for "<vendorCode>": set SFTP (VENDOR_WHEELPROS_*_SFTP_HOST + creds) or a real VENDOR_WHEELPROS_*_FEED_PATH. To intentionally use the bundled SAMPLE CSV (dev/CI only), set VENDOR_ALLOW_SAMPLE_FEED=true.`

### 3. Caller wiring + prominent warn

In [`service.ts run()`](../../../backend/src/modules/vendor-sync/service.ts#L109-L185):

- Extend the `run()` options to `{ dryRun?: boolean; container?: MedusaContainer; allowSample?: boolean }`.
- Compute `const allowSample = options?.allowSample ?? this.options_.allowSampleFeed ?? false`.
- Pass `{ allowSample, vendorCode }` as the third arg to `resolveFeed(...)`.
- After resolution, when the bundled sample is actually in use — `feed.kind === "default"` **or** a
  `feedPath` that `isSampleFeedPath` recognizes (both only survive the guard when `allowSample` is
  true) — log a **WARN**:
  > `[vendor-sync] [<runId>] USING BUNDLED SAMPLE FEED for <vendorCode> — VENDOR_ALLOW_SAMPLE_FEED is enabled; this is NOT live inventory.`
  This is defense-in-depth: even if the flag is mistakenly left on in prod, every run shouts.
  (As-shipped: the WARN keyed off both signals — driving it off `feed.kind === "default"` alone would
  miss the common dev config `feedPath=./wheelInvPriceData.csv`; raised by code review, fixed.)

A thrown `SampleFeedNotAllowedError` is caught by the **existing** try/catch
([`service.ts:366-383`](../../../backend/src/modules/vendor-sync/service.ts#L366-L383)): the run is
marked `failed` with the actionable message, the in-progress guard is released
(`clearCancelled_`), and the cron moves on. No new error-handling code is required.

### 4. CLI dry-run keeps working (explicit intent, not ambient env)

[`vendor-sync-dry-run.ts`](../../../backend/src/scripts/vendor-sync-dry-run.ts) is a manual dev/ops
preview tool. It must use the sample without depending on the caller's shell having the env var:

- Pass `allowSample: true` into `run(vendorCode, { dryRun: true, allowSample: true, container })`.
  (Harmless in prod: when SFTP is configured, `allowSample` is ignored because the real feed wins.)
- Add `Error message:` (`run.error_message`) to the printed summary so a failed resolution explains
  *why* instead of just `Status: failed`.

### 5. `.env.template` (uncommented escape hatch + corrected sample note)

The enabled-vendor dev path today *is* the `{kind:"default"}` sample, so the flag must ship as an
**active, uncommented** line — a commented flag would hand every dev a hard throw + empty catalog.

In [`backend/.env.template`](../../../backend/.env.template#L43-L72), in the Vendor Sync block:

```
# Sample-feed escape hatch: permit the bundled wheelInvPriceData.csv / tireInvPriceData.csv
# when no SFTP/feed path is configured. dev/CI only — MUST be unset (or false) in production,
# where a real SFTP feed or feed path is required (vendor-sync will fail loudly otherwise).
VENDOR_ALLOW_SAMPLE_FEED=true
```

Also amend the existing feed-path comment to flag that `./wheelInvPriceData.csv` /
`./tireInvPriceData.csv` are the **bundled samples**, gated by `VENDOR_ALLOW_SAMPLE_FEED`.

## Data flow (after change)

```
cron / admin POST /runs / CLI dry-run
        │ run(vendor, { allowSample? })
        ▼
  allowSample = arg ?? options.allowSampleFeed ?? false
        ▼
  resolveFeed(cfg, lastSeen, { allowSample, vendorCode })
        ├─ sftp        → downloadNewestViaSftp(...)            (real feed)
        ├─ feedPath
        │   ├─ sample basename & !allowSample → THROW          (relocated-bug guard)
        │   └─ else                            → { kind:"file" }
        └─ neither
            ├─ !allowSample → THROW                            (silent-sample guard)
            └─ allowSample  → { kind:"default" } + WARN log    (intentional sample)
        ▼
  THROW → caught at service.ts:366 → run status=failed, message names the fix
```

## Error handling

- The guard throws a typed `SampleFeedNotAllowedError`; the existing `run()` catch records it as a
  `failed` run with `error_message` and releases the in-progress guard. **No stuck-run risk** (the
  catch path is the same one that already handles SFTP/parse failures).
- **Accepted trade-off:** a persistently-misconfigured prod will mint one `failed` run per 12h tick
  with a clear, identical message. This is desirable fail-loud behavior (visible + actionable in the
  admin runs list and the cron error log), not noise to suppress. A future refinement
  (pre-run-row config validation / de-dupe) is explicitly **out of scope** for WB-041.

## Testing

New pure unit test [`backend/src/modules/vendor-sync/__tests__/resolve-feed.test.ts`] (jest, no DB;
mock `./sftp`'s `downloadNewestViaSftp` so importing the resolver pulls no `ssh2`):

| Case | `allowSample` | Expectation |
|---|---|---|
| no sftp / no feedPath | `false` | throws `SampleFeedNotAllowedError`; message contains the env-var names |
| no sftp / no feedPath | `true`  | resolves `{ kind: "default" }` |
| real `feedPath` (e.g. `/feeds/live.csv`) | `false` | resolves `{ kind: "file" }` (no throw) |
| `feedPath` = `./wheelInvPriceData.csv` | `false` | throws (relocated-sample gate) |
| `feedPath` = `./tireInvPriceData.csv` | `true`  | resolves `{ kind: "file" }` (allowed) |
| `feedPath` = `feeds\wheelInvPriceData.csv` (backslash) | `false` | throws (basename normalizes separators; raised by code review) |
| `sftp` present | either | delegates to mocked `downloadNewestViaSftp`; `allowSample` ignored |

As-shipped: **8** cases (the 7 above + the backslash-detection case).

Regression coverage that the silent-sample path (which had **no** test) is now gated. `pnpm test:sync`
must stay green (all existing tests pass explicit fixture paths; none touch `resolveFeed` or the
default-path adapters — confirmed by the mapping pass).

Manual smoke: `pnpm vendor-sync:dry-run wheelpros-wheels` still previews the sample (passes
`allowSample: true`); the same with vendors enabled but `VENDOR_ALLOW_SAMPLE_FEED` unset and no
SFTP/feedPath prints `Status: failed` + the actionable `Error message:`.

## Touch-point summary

| File | Change | Migration |
|---|---|---|
| `backend/src/lib/constants.ts` | export `VENDOR_ALLOW_SAMPLE_FEED` | — |
| `backend/medusa-config.js` | pass `allowSampleFeed` into vendor-sync options | — |
| `backend/src/modules/vendor-sync/service.ts` | `VendorSyncModuleOptions.allowSampleFeed?`; `run()` opts + `allowSample`; pass into `resolveFeed`; WARN on sample use | — |
| `backend/src/modules/vendor-sync/feed-source/resolve-feed.ts` | arg-driven guard; `SampleFeedNotAllowedError`; `isSampleFeedPath` / `SAMPLE_FEED_FILENAMES` | — |
| `backend/src/scripts/vendor-sync-dry-run.ts` | pass `allowSample: true`; print `error_message` | — |
| `backend/.env.template` | uncommented `VENDOR_ALLOW_SAMPLE_FEED=true` + sample-path note | — |
| `backend/src/modules/vendor-sync/__tests__/resolve-feed.test.ts` | **new** pure guard tests | — |

**No DB migration.** Pure config/control-flow + a new env var.

## Relationship to WB-016

WB-016 (bounded partial-apply retry) was promoted to its own spec because the adversarial review
found a correct retry needs apply-idempotency prerequisites (adopt-by-`external_id` for new groups;
atomic changed-group writes) plus an `apply_attempt` migration — otherwise retrying duplicates or
strands products. It ships **after** WB-041 and does not block it. This guard and WB-016 are
independent: WB-041 governs *which feed* is synced; WB-016 governs *what happens when groups fail to
apply* from whatever feed was synced.

## Verification (closes WB-041)

- Backend started with a vendor enabled but no SFTP/feedPath and `VENDOR_ALLOW_SAMPLE_FEED` unset →
  the run ends `failed` with the actionable message (not a silent sample sync).
- `grep` shows `resolveFeed` never returns `{ kind: "default" }` for an enabled vendor without the
  flag; the guard test file asserts every branch.
- With `VENDOR_ALLOW_SAMPLE_FEED=true`, the sample is used **and** a prominent WARN is logged.
- Both adapters (wheels + tires) are covered by the single `resolveFeed` guard.
