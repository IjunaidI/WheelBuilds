# WB-041 · Fail-loud feed guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make vendor-sync fail loud instead of silently syncing the bundled sample CSV as the live catalog, with an explicit `VENDOR_ALLOW_SAMPLE_FEED=true` opt-in.

**Architecture:** A single guard in `resolveFeed` (the one chokepoint both the wheels and tires adapters pass through) throws `SampleFeedNotAllowedError` when no live feed (SFTP or a non-sample `feedPath`) is configured and the sample is not explicitly allowed. The opt-in flag is plumbed as a vendor-sync **module option** (read in `medusa-config.js`) and passed into `resolveFeed` as an explicit argument, keeping the resolver a pure, unit-testable function. The existing `run()` try/catch turns a thrown guard into a `failed` run with an actionable message.

**Tech Stack:** MedusaJS 2.13.6 backend, TypeScript, Jest 29 + `@swc/jest` (no DB, run via `pnpm test:sync`), Node 22 / pnpm 9.10.

**Spec:** [docs/in-progress/specs/2026-06-20-vendor-sync-fail-loud-feed-guard-design.md](../specs/2026-06-20-vendor-sync-fail-loud-feed-guard-design.md) · Backlog [WB-041](../../future/BACKLOG.md)

## Global Constraints

- **No DB migration** — pure config/control-flow + one new env var.
- **The guard lives only in `resolveFeed`** so wheels and tires are covered identically; do not add per-adapter logic.
- **No `NODE_ENV` coupling** — the opt-in is the `VENDOR_ALLOW_SAMPLE_FEED` flag only.
- **Flag is a module option, not an ambient `process.env` read inside the module** — read it once in `medusa-config.js`, pass it through options → `run()` → `resolveFeed(...)`.
- Tests run with `pnpm test:sync` (jest, `--passWithNoTests`); `@swc/jest` transpiles per-file and does **not** typecheck, so the build won't fail on types — correctness is runtime + tests.
- Imports resolve via `tsconfig` `paths: { "*": ["./src/*"] }` (e.g. `lib/constants`); do **not** use `@/` prefixes.
- After editing `medusa-config.js`, `rm -rf backend/.medusa/server` before restarting the backend (stale-config trap) — relevant only for manual smokes, not the unit tests.

**Before starting:** the repo is on `main`. Create a branch first:

```bash
cd backend && git checkout -b fix/vendor-sync-fail-loud-feed
```

---

### Task 1: Fail-loud guard in `resolveFeed`, wired end-to-end

**Files:**
- Create: `backend/src/modules/vendor-sync/__tests__/resolve-feed.test.ts`
- Modify: `backend/src/modules/vendor-sync/feed-source/resolve-feed.ts` (whole file)
- Modify: `backend/src/lib/constants.ts:110` (add export)
- Modify: `backend/medusa-config.js` (import the new const + pass `allowSampleFeed` option)
- Modify: `backend/src/modules/vendor-sync/service.ts` (`VendorSyncModuleOptions`, `run()` options, compute `allowSample`, pass to `resolveFeed`, WARN on sample use)

**Interfaces:**
- Produces:
  - `resolveFeed(cfg: FeedConfig, lastSeen: LastSeen | null, opts: { allowSample: boolean; vendorCode: string }): Promise<ResolvedFeed>`
  - `class SampleFeedNotAllowedError extends Error`
  - `isSampleFeedPath(feedPath: string): boolean`
  - `SAMPLE_FEED_FILENAMES: Set<string>`
  - `VendorSyncModuleOptions.allowSampleFeed?: boolean`
  - `run()` gains `options.allowSample?: boolean`
- Consumes: existing `FeedConfig` / `LastSeen` / `ResolvedFeed` from `feed-source/types.ts`; existing `downloadNewestViaSftp` from `feed-source/sftp.ts`.

- [ ] **Step 1: Write the failing guard test**

Create `backend/src/modules/vendor-sync/__tests__/resolve-feed.test.ts`:

```ts
import { resolveFeed, SampleFeedNotAllowedError } from "../feed-source/resolve-feed"

// Mock the SFTP I/O so importing resolveFeed pulls no ssh2 native binding.
jest.mock("../feed-source/sftp", () => ({
  downloadNewestViaSftp: jest.fn(async () => ({
    kind: "unchanged",
    sourceName: "remote.csv",
    modifyTime: 123,
  })),
}))

const VENDOR = "wheelpros-wheels"

describe("resolveFeed WB-041 fail-loud guard", () => {
  it("throws when no sftp/feedPath and sample not allowed", async () => {
    await expect(
      resolveFeed({}, null, { allowSample: false, vendorCode: VENDOR })
    ).rejects.toBeInstanceOf(SampleFeedNotAllowedError)
  })

  it("error names the opt-in env var", async () => {
    await expect(
      resolveFeed({}, null, { allowSample: false, vendorCode: VENDOR })
    ).rejects.toThrow(/VENDOR_ALLOW_SAMPLE_FEED=true/)
  })

  it("returns {kind:'default'} when no feed but sample allowed", async () => {
    const r = await resolveFeed({}, null, { allowSample: true, vendorCode: VENDOR })
    expect(r).toEqual({ kind: "default" })
  })

  it("returns {kind:'file'} for a real (non-sample) feedPath", async () => {
    const r = await resolveFeed(
      { feedPath: "/feeds/live.csv" },
      null,
      { allowSample: false, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "file", csvPath: "/feeds/live.csv", sourceName: "live.csv" })
  })

  it("throws when feedPath IS the bundled sample and sample not allowed", async () => {
    await expect(
      resolveFeed(
        { feedPath: "./wheelInvPriceData.csv" },
        null,
        { allowSample: false, vendorCode: VENDOR }
      )
    ).rejects.toBeInstanceOf(SampleFeedNotAllowedError)
  })

  it("allows the sample feedPath when sample is allowed", async () => {
    const r = await resolveFeed(
      { feedPath: "./tireInvPriceData.csv" },
      null,
      { allowSample: true, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "file", csvPath: "./tireInvPriceData.csv" })
  })

  it("delegates to sftp regardless of allowSample", async () => {
    const r = await resolveFeed(
      { sftp: { host: "h", username: "u", remoteDir: "/d", filePattern: ".*" } as any },
      null,
      { allowSample: false, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "unchanged" })
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd backend && pnpm test:sync -- resolve-feed`
Expected: FAIL — `SampleFeedNotAllowedError` is not exported and `resolveFeed` does not accept a 3rd argument / does not throw.

- [ ] **Step 3: Implement the guard in `resolve-feed.ts`**

Replace the entire contents of `backend/src/modules/vendor-sync/feed-source/resolve-feed.ts`:

```ts
import * as path from "path"
import { FeedConfig, LastSeen, ResolvedFeed } from "./types"
import { downloadNewestViaSftp } from "./sftp"

/** Basenames of the bundled sample CSVs that ship at the repo root. */
export const SAMPLE_FEED_FILENAMES = new Set([
  "wheelInvPriceData.csv",
  "tireInvPriceData.csv",
])

/** True when a feed path points at one of the bundled sample CSVs (by basename). */
export function isSampleFeedPath(feedPath: string): boolean {
  return SAMPLE_FEED_FILENAMES.has(path.basename(feedPath))
}

/** Thrown when vendor-sync would sync the bundled sample CSV without an explicit opt-in. */
export class SampleFeedNotAllowedError extends Error {
  constructor(vendorCode: string) {
    super(
      `[vendor-sync] No live feed configured for "${vendorCode}": set SFTP ` +
        `(VENDOR_WHEELPROS_*_SFTP_HOST + credentials) or a real VENDOR_WHEELPROS_*_FEED_PATH. ` +
        `To intentionally use the bundled SAMPLE CSV (dev/CI only), set VENDOR_ALLOW_SAMPLE_FEED=true.`
    )
    this.name = "SampleFeedNotAllowedError"
  }
}

export interface ResolveFeedOptions {
  /** Whether the bundled sample CSV may be used when no live feed is configured. */
  allowSample: boolean
  /** Vendor code, for actionable error messages. */
  vendorCode: string
}

/**
 * Resolve a vendor's feed config to a concrete CSV path (or a short-circuit).
 *   - sftp present     -> pull the newest remote file (with delta short-circuit)
 *   - feedPath present -> use that local file, UNLESS it is the bundled sample and !allowSample
 *   - neither          -> "default" (the adapter's bundled sample) ONLY when allowSample;
 *                         otherwise throw SampleFeedNotAllowedError (WB-041 fail-loud guard)
 */
export async function resolveFeed(
  cfg: FeedConfig,
  lastSeen: LastSeen | null,
  opts: ResolveFeedOptions
): Promise<ResolvedFeed> {
  if (cfg.sftp) return downloadNewestViaSftp(cfg.sftp, lastSeen)

  if (cfg.feedPath) {
    if (isSampleFeedPath(cfg.feedPath) && !opts.allowSample) {
      throw new SampleFeedNotAllowedError(opts.vendorCode)
    }
    return {
      kind: "file",
      csvPath: cfg.feedPath,
      sourceName: path.basename(cfg.feedPath),
      modifyTime: null,
    }
  }

  if (!opts.allowSample) {
    throw new SampleFeedNotAllowedError(opts.vendorCode)
  }
  return { kind: "default" }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd backend && pnpm test:sync -- resolve-feed`
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Export the env var from `constants.ts`**

In `backend/src/lib/constants.ts`, immediately after line 110 (`export const VENDOR_SYNC_DRY_RUN = process.env.VENDOR_SYNC_DRY_RUN`), add:

```ts
export const VENDOR_ALLOW_SAMPLE_FEED = process.env.VENDOR_ALLOW_SAMPLE_FEED
```

- [ ] **Step 6: Pass `allowSampleFeed` into the vendor-sync module options in `medusa-config.js`**

In `backend/medusa-config.js`, add `VENDOR_ALLOW_SAMPLE_FEED` to the destructured `import { … } from 'lib/constants'` block (the one ending at line 50).

Then in the vendor-sync module `options` object, immediately after the `dryRun: VENDOR_SYNC_DRY_RUN === 'true',` line (line 198), add:

```js
        allowSampleFeed: VENDOR_ALLOW_SAMPLE_FEED === 'true',
```

- [ ] **Step 7: Declare the option on `VendorSyncModuleOptions` in `service.ts`**

In `backend/src/modules/vendor-sync/service.ts`, in the `VendorSyncModuleOptions` interface, immediately after `devMaxRows?: number` (line 32), add:

```ts
  /** WB-041: permit the bundled sample CSV when no live feed is configured (dev/CI only). */
  allowSampleFeed?: boolean
```

- [ ] **Step 8: Thread `allowSample` through `run()` and into `resolveFeed`, and WARN on sample use**

In `backend/src/modules/vendor-sync/service.ts`:

(a) Extend the `run()` options type (lines 109-112) to:

```ts
  async run(
    vendorCode: string,
    options?: { dryRun?: boolean; container?: MedusaContainer; allowSample?: boolean }
  ): Promise<{ runId: string }> {
```

(b) Immediately after `const isDryRun = options?.dryRun ?? this.options_.dryRun ?? false` (line 113), add:

```ts
    const allowSample =
      options?.allowSample ?? this.options_.allowSampleFeed ?? false
```

(c) Replace the `resolveFeed(...)` call (lines 156-159) with the 3-arg form plus the sample WARN:

```ts
      const feed = await resolveFeed(
        { feedPath: vendorOpts.feedPath, sftp: vendorOpts.sftp },
        lastSeen,
        { allowSample, vendorCode }
      )

      if (feed.kind === "default") {
        // Reached only when allowSample === true (the guard throws otherwise).
        this.logger_.warn(
          `[vendor-sync] [${runId}] USING BUNDLED SAMPLE FEED for ${vendorCode} — ` +
            `VENDOR_ALLOW_SAMPLE_FEED is enabled; this is NOT live inventory.`
        )
      }
```

- [ ] **Step 9: Run the full vendor-sync suite to confirm no regression**

Run: `cd backend && pnpm test:sync`
Expected: PASS — the new `resolve-feed` cases plus all previously-passing tests green (no test references the silent default path, so nothing else changes).

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/vendor-sync/feed-source/resolve-feed.ts \
        backend/src/modules/vendor-sync/__tests__/resolve-feed.test.ts \
        backend/src/lib/constants.ts \
        backend/medusa-config.js \
        backend/src/modules/vendor-sync/service.ts
git commit -m "feat(vendor-sync): fail loud instead of silently syncing the sample feed (WB-041)"
```

---

### Task 2: CLI dry-run keeps working + surfaces the failure reason

**Files:**
- Modify: `backend/src/scripts/vendor-sync-dry-run.ts:20-23, 33-46`

**Interfaces:**
- Consumes: `run(vendorCode, { dryRun, allowSample, container })` from Task 1.

Rationale: the dry-run is a manual dev/ops preview. Passing `allowSample: true` lets it use the bundled sample without depending on the caller's shell having the env var (harmless in prod, where a real SFTP feed wins and `allowSample` is ignored). Printing `error_message` means a fail-loud throw explains *why* instead of a bare `Status: failed`.

- [ ] **Step 1: Pass `allowSample: true` from the dry-run script**

In `backend/src/scripts/vendor-sync-dry-run.ts`, replace the `run(...)` call (lines 20-23):

```ts
  const { runId } = await (vendorSyncService as any).run(vendorCode, {
    dryRun: true,
    allowSample: true,
    container,
  })
```

- [ ] **Step 2: Add the error message to the summary**

In the same file, in the summary block, immediately after the `Status:` line (line 39), add:

```ts
  if (run.error_message) {
    logger.info(`Error message:       ${run.error_message}`)
  }
```

- [ ] **Step 3: Manual smoke — sample still works via dry-run**

With a vendor enabled and **no** SFTP/feedPath configured (and `VENDOR_ALLOW_SAMPLE_FEED` unset in the shell), run:

```bash
cd backend && pnpm vendor-sync:dry-run wheelpros-wheels
```

Expected: the run does NOT fail — it previews the bundled sample (because the script passes `allowSample: true`); the summary shows `Status: completed` (or `awaiting_approval`) and parsed row counts.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/vendor-sync-dry-run.ts
git commit -m "feat(vendor-sync): dry-run opts into the sample feed + prints failure reason (WB-041)"
```

---

### Task 3: `.env.template` escape hatch (uncommented) + sample-path note

**Files:**
- Modify: `backend/.env.template:43-50`

Rationale: the enabled-vendor dev path today *is* the `{kind:"default"}` sample, so the flag must ship as an **active, uncommented** line — a commented flag would hand every dev a hard throw + empty catalog after Task 1.

- [ ] **Step 1: Add the uncommented flag and correct the sample-path comment**

In `backend/.env.template`, immediately after the `# VENDOR_WHEELPROS_TIRES_ENABLED=false` line (line 45), insert:

```
#
# Sample-feed escape hatch: permit the bundled wheelInvPriceData.csv / tireInvPriceData.csv
# (the ./*.csv paths below ARE those samples) when no SFTP/feed path is configured.
# dev/CI ONLY — MUST be unset (or false) in production, where vendor-sync fails loudly
# unless a real SFTP feed or feed path is configured.
VENDOR_ALLOW_SAMPLE_FEED=true
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.template
git commit -m "docs(vendor-sync): document VENDOR_ALLOW_SAMPLE_FEED escape hatch (WB-041)"
```

---

### Task 4: Verify end-to-end and update docs

**Files:**
- Modify: `docs/future/BACKLOG.md` (WB-041 → done)
- Modify: `docs/STATUS.md` (Vendor import row + Config/Infra row + Active work + Last verified)
- Move: `docs/in-progress/specs/2026-06-20-vendor-sync-fail-loud-feed-guard-design.md` → `docs/done/specs/`
- Move: `docs/in-progress/plans/2026-06-20-vendor-sync-fail-loud-feed-guard.md` → `docs/done/plans/`

- [ ] **Step 1: Full suite green**

Run: `cd backend && pnpm test:sync`
Expected: PASS (all green, including `resolve-feed.test.ts`).

- [ ] **Step 2: Manual fail-loud smoke**

With a vendor enabled, **no** SFTP/feedPath, and `VENDOR_ALLOW_SAMPLE_FEED` unset, trigger a run the way prod does (cron path / admin `POST /admin/vendor-sync/runs`, or `medusa exec` of `service.run('wheelpros-wheels')` without `allowSample`). Confirm the run ends `status: failed` with `error_message` naming the missing env vars — **not** a silent sample sync. Then set `VENDOR_ALLOW_SAMPLE_FEED=true`, re-run, and confirm the sample is used **and** the `USING BUNDLED SAMPLE FEED` WARN is logged. (Remember `rm -rf backend/.medusa/server` after any `medusa-config.js`/env change before restart.)

- [ ] **Step 3: Flip WB-041 to done in the backlog**

In `docs/future/BACKLOG.md`, under `### WB-041`, set `status: done`, point `evidence` at the guard, and add a `done:` line. Replace the `status`/`evidence`/`refs` lines:

```
- status: done
- area: backend/vendor-sync/feed-source
- evidence: backend/src/modules/vendor-sync/feed-source/resolve-feed.ts (resolveFeed guard + SampleFeedNotAllowedError)
```
and append before `- refs:`:
```
- done: 2026-06-20 — single fail-loud guard in resolveFeed (covers both adapters); bundled sample permitted only when VENDOR_ALLOW_SAMPLE_FEED=true, otherwise throws SampleFeedNotAllowedError (run → failed with an actionable message). feedPath pointing at a sample CSV is gated too. dry-run opts into the sample + prints error_message. Verified by resolve-feed.test.ts (7 cases) + a live fail-loud/allow smoke. No migration.
```
and set:
```
- refs: done/specs/2026-06-20-vendor-sync-fail-loud-feed-guard-design.md · done/plans/2026-06-20-vendor-sync-fail-loud-feed-guard.md
```

- [ ] **Step 4: Update STATUS.md**

In `docs/STATUS.md`: (a) the **Vendor import** pillar row — append to its state cell "Fail-loud feed guard: no live feed ⇒ run fails (WB-041 done) unless `VENDOR_ALLOW_SAMPLE_FEED=true`." and drop WB-041 from its Open-backlog cell. (b) the **Config / Infra** row — note the silent-sample gap is closed. (c) the **Active work** section — mark WB-041 done and set next up to **WB-016** (the dedicated retry spec). Confirm "Last verified" reads `2026-06-20`.

- [ ] **Step 5: Move the spec + plan to done**

```bash
git mv docs/in-progress/specs/2026-06-20-vendor-sync-fail-loud-feed-guard-design.md docs/done/specs/
git mv docs/in-progress/plans/2026-06-20-vendor-sync-fail-loud-feed-guard.md docs/done/plans/
```
Update the status banner at the top of the moved spec from `in-progress` to `done`.

- [ ] **Step 6: Run /doc-review**

Run the `/doc-review` skill to catch any drift (banned/stale tokens, evidence-line mismatches). Fix anything it flags.

- [ ] **Step 7: Commit the docs**

```bash
git add docs/
git commit -m "docs(vendor-sync): close WB-041 — backlog, STATUS, move spec+plan to done"
```

---

## Self-Review

**Spec coverage:** the guard in `resolveFeed` (Task 1, Steps 3) + the `{kind:"default"}` and sample-`feedPath` branches cover §"The guard"; flag plumbing as a module option (Task 1, Steps 5-8) covers §"Flag plumbing"; the WARN covers §"prominent warn"; dry-run (Task 2) covers §"CLI dry-run"; `.env.template` (Task 3) covers §"env template"; the test matrix (Task 1, Step 1) matches the spec's testing table; the fail-loud-via-existing-catch behavior is covered by Task 1 Step 8 + the Task 4 manual smoke. No spec section is left without a task.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every command shows expected output.

**Type consistency:** `resolveFeed(cfg, lastSeen, { allowSample, vendorCode })`, `SampleFeedNotAllowedError`, `isSampleFeedPath`, `SAMPLE_FEED_FILENAMES`, `allowSampleFeed?` (option) and `allowSample?` (`run()` arg) are named identically in the test (Step 1), the implementation (Steps 3, 7, 8), the config (Step 6), and the dry-run consumer (Task 2). The option key `allowSampleFeed` (module/config) is deliberately distinct from the per-call `allowSample` (run arg); `run()` maps one to the other in Step 8(b).
