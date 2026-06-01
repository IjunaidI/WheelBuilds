# Plan 3 — Live Vendor SFTP Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the CSV import from a hardcoded local-sample-file demo into a real, scheduled pull of the newest matching feed file from the vendor's SFTP server — reusing the existing `stage → diff → apply` pipeline unchanged — with filename/mtime delta detection to skip re-downloading unchanged feeds, and finally threading the long-dead `feedPath` config knob.

**Architecture:** We do NOT rewrite the adapters. We add a small `feed-source` layer that resolves a feed config to a local CSV path: for SFTP it lists the remote dir, picks the newest matching file (pure, tested), short-circuits if it matches the last run (pure delta, tested), downloads to a temp path, and hands that path to the existing `WheelProsWheelAdapter` via its already-present `deps.csvPath`. `resolveAdapter` is finally called WITH deps. A new nullable `source_modify_time` column on `vendor_feed_run` records the last-seen remote mtime for delta. Local-file mode (and the bare default) remain supported for back-compat.

**Tech Stack:** MedusaJS 2.13.6, `ssh2-sftp-client` (new dependency), Jest + @swc/jest. Pure selection/delta logic is unit-tested; the thin SFTP I/O wrapper is verified manually against a real server.

> **Prerequisite from Plan 1/general:** the catalog must still be populated by `apply`. This plan only changes the SOURCE of the CSV (SFTP vs local file); everything downstream (`stage`, `diff`, `apply`, Meilisearch indexing) is unchanged.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `backend/package.json` | Add `ssh2-sftp-client` + `@types/ssh2-sftp-client` | Modify |
| `backend/src/modules/vendor-sync/feed-source/types.ts` | `SftpConfig`, `FeedConfig`, `RemoteFile`, `LastSeen`, `ResolvedFeed` | Create |
| `backend/src/modules/vendor-sync/feed-source/pick-newest.ts` | Pure: newest file matching a pattern | Create |
| `backend/src/modules/vendor-sync/__tests__/pick-newest.test.ts` | Jest | Create |
| `backend/src/modules/vendor-sync/feed-source/is-new-feed.ts` | Pure: name/mtime delta decision | Create |
| `backend/src/modules/vendor-sync/__tests__/is-new-feed.test.ts` | Jest | Create |
| `backend/src/modules/vendor-sync/feed-source/sftp.ts` | Thin SFTP I/O: list + pick + delta + download | Create |
| `backend/src/modules/vendor-sync/feed-source/resolve-feed.ts` | Route local-file vs SFTP vs default | Create |
| `backend/src/modules/vendor-sync/models/vendor-feed-run.ts` | Add `source_modify_time` column | Modify |
| `backend/src/modules/vendor-sync/migrations/` | Generated migration + refreshed snapshot | Create (generated) |
| `backend/src/modules/vendor-sync/service.ts` | Resolve feed before `resolveAdapter`; delta short-circuit; record mtime | Modify |
| `backend/medusa-config.js` | Build per-vendor `sftp` config from env | Modify |
| `backend/.env.template` | Document SFTP env vars | Modify |

---

### Task 1: Add the SFTP client dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install**

Run (from `backend/`):

```bash
npx -y pnpm@9.10.0 add ssh2-sftp-client
npx -y pnpm@9.10.0 add -D @types/ssh2-sftp-client
```

- [ ] **Step 2: Verify**

Confirm `ssh2-sftp-client` appears under `dependencies` and `@types/ssh2-sftp-client` under `devDependencies` in `backend/package.json`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml
git commit -m "chore(vendor-sync): add ssh2-sftp-client for live feed pulls"
```

---

### Task 2: Pure helper — pick the newest matching feed file

**Files:**
- Create: `backend/src/modules/vendor-sync/feed-source/types.ts`
- Create: `backend/src/modules/vendor-sync/feed-source/pick-newest.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/pick-newest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/pick-newest.test.ts`:

```ts
import { pickNewestFeed } from "../feed-source/pick-newest"

const f = (name: string, modifyTime: number) => ({ name, modifyTime, size: 100 })

describe("pickNewestFeed", () => {
  it("returns the newest file matching the pattern", () => {
    const files = [f("inv-2026-05-01.csv", 1000), f("inv-2026-05-03.csv", 3000), f("inv-2026-05-02.csv", 2000)]
    expect(pickNewestFeed(files, /^inv-.*\.csv$/)?.name).toBe("inv-2026-05-03.csv")
  })
  it("ignores files that do not match the pattern", () => {
    const files = [f("readme.txt", 9000), f("inv-2026-05-01.csv", 1000)]
    expect(pickNewestFeed(files, /^inv-.*\.csv$/)?.name).toBe("inv-2026-05-01.csv")
  })
  it("returns null when nothing matches", () => {
    expect(pickNewestFeed([f("readme.txt", 9000)], /^inv-.*\.csv$/)).toBeNull()
    expect(pickNewestFeed([], /.*/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx jest src/modules/vendor-sync/__tests__/pick-newest.test.ts`
Expected: FAIL — cannot find module `../feed-source/pick-newest`.

- [ ] **Step 3: Create the types and the helper**

Create `backend/src/modules/vendor-sync/feed-source/types.ts`:

```ts
/** SFTP connection + selection config for one vendor feed. */
export interface SftpConfig {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
  remoteDir: string
  /** Regex SOURCE string (compiled at use). Defaults to '.*\\.csv$'. */
  filePattern: string
}

/** Where one vendor's feed comes from. SFTP wins over feedPath. */
export interface FeedConfig {
  feedPath?: string
  sftp?: SftpConfig
}

export interface RemoteFile {
  name: string
  /** Epoch milliseconds. */
  modifyTime: number
  size: number
}

export interface LastSeen {
  name: string
  modifyTime: number
}

export type ResolvedFeed =
  | { kind: "file"; csvPath: string; sourceName: string; modifyTime: number | null }
  | { kind: "unchanged"; sourceName: string; modifyTime: number }
  | { kind: "empty" }
  | { kind: "default" }
```

Create `backend/src/modules/vendor-sync/feed-source/pick-newest.ts`:

```ts
import { RemoteFile } from "./types"

/** The newest (max modifyTime) file whose name matches `pattern`, or null. */
export function pickNewestFeed(files: RemoteFile[], pattern: RegExp): RemoteFile | null {
  const matches = files.filter((f) => pattern.test(f.name))
  if (!matches.length) return null
  return matches.reduce((a, b) => (b.modifyTime > a.modifyTime ? b : a))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `backend/`): `npx jest src/modules/vendor-sync/__tests__/pick-newest.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/feed-source/types.ts backend/src/modules/vendor-sync/feed-source/pick-newest.ts backend/src/modules/vendor-sync/__tests__/pick-newest.test.ts
git commit -m "feat(vendor-sync): pure pickNewestFeed selector + feed-source types"
```

---

### Task 3: Pure helper — is this remote file new vs the last run?

**Files:**
- Create: `backend/src/modules/vendor-sync/feed-source/is-new-feed.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/is-new-feed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/vendor-sync/__tests__/is-new-feed.test.ts`:

```ts
import { isNewFeed } from "../feed-source/is-new-feed"

describe("isNewFeed", () => {
  it("is new when there is no prior run", () => {
    expect(isNewFeed({ name: "inv.csv", modifyTime: 100 }, null)).toBe(true)
  })
  it("is new when the name changed", () => {
    expect(isNewFeed({ name: "inv-2.csv", modifyTime: 100 }, { name: "inv-1.csv", modifyTime: 100 })).toBe(true)
  })
  it("is new when the modify time changed", () => {
    expect(isNewFeed({ name: "inv.csv", modifyTime: 200 }, { name: "inv.csv", modifyTime: 100 })).toBe(true)
  })
  it("is NOT new when name and modify time both match", () => {
    expect(isNewFeed({ name: "inv.csv", modifyTime: 100 }, { name: "inv.csv", modifyTime: 100 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `npx jest src/modules/vendor-sync/__tests__/is-new-feed.test.ts`
Expected: FAIL — cannot find module `../feed-source/is-new-feed`.

- [ ] **Step 3: Create the helper**

Create `backend/src/modules/vendor-sync/feed-source/is-new-feed.ts`:

```ts
import { LastSeen } from "./types"

/** True if the remote file differs from what the last completed run ingested. */
export function isNewFeed(
  remote: { name: string; modifyTime: number },
  lastSeen: LastSeen | null
): boolean {
  if (!lastSeen) return true
  return remote.name !== lastSeen.name || remote.modifyTime !== lastSeen.modifyTime
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `backend/`): `npx jest src/modules/vendor-sync/__tests__/is-new-feed.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/vendor-sync/feed-source/is-new-feed.ts backend/src/modules/vendor-sync/__tests__/is-new-feed.test.ts
git commit -m "feat(vendor-sync): pure isNewFeed delta helper for SFTP feeds"
```

---

### Task 4: SFTP downloader (thin I/O wrapper)

**Files:**
- Create: `backend/src/modules/vendor-sync/feed-source/sftp.ts`

**Note on testing:** this file is the thin I/O boundary (connect/list/download). Its decision logic lives entirely in the already-tested `pickNewestFeed` + `isNewFeed`. It is verified manually against a real server in Task 9, not via a unit test (which would require an SFTP server fixture).

- [ ] **Step 1: Create the downloader**

Create `backend/src/modules/vendor-sync/feed-source/sftp.ts`:

```ts
import Client from "ssh2-sftp-client"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"
import { pickNewestFeed } from "./pick-newest"
import { isNewFeed } from "./is-new-feed"
import { SftpConfig, RemoteFile, LastSeen, ResolvedFeed } from "./types"

/**
 * List the remote dir, pick the newest matching file, short-circuit if it
 * matches the last run, otherwise download it to a temp path named after the
 * remote file (so descriptor.sourceFilename carries the real name for delta).
 */
export async function downloadNewestViaSftp(
  cfg: SftpConfig,
  lastSeen: LastSeen | null
): Promise<ResolvedFeed> {
  const client = new Client()
  try {
    await client.connect({
      host: cfg.host,
      port: cfg.port ?? 22,
      username: cfg.username,
      password: cfg.password,
      privateKey: cfg.privateKey,
    })

    const entries = await client.list(cfg.remoteDir)
    const files: RemoteFile[] = entries
      .filter((e: any) => e.type === "-")
      .map((e: any) => ({ name: e.name, modifyTime: e.modifyTime, size: e.size }))

    const pattern = new RegExp(cfg.filePattern || ".*\\.csv$")
    const newest = pickNewestFeed(files, pattern)
    if (!newest) return { kind: "empty" }

    if (!isNewFeed(newest, lastSeen)) {
      return { kind: "unchanged", sourceName: newest.name, modifyTime: newest.modifyTime }
    }

    const dir = path.join(os.tmpdir(), "vendor-sync")
    fs.mkdirSync(dir, { recursive: true })
    const localPath = path.join(dir, path.basename(newest.name))
    await client.fastGet(path.posix.join(cfg.remoteDir, newest.name), localPath)

    return { kind: "file", csvPath: localPath, sourceName: newest.name, modifyTime: newest.modifyTime }
  } finally {
    await client.end().catch(() => {})
  }
}
```

- [ ] **Step 2: Type-check**

Run (from `backend/`): `npx tsc --noEmit`
Expected: no errors in `feed-source/*` (the `@types/ssh2-sftp-client` from Task 1 provides the `Client` types).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/vendor-sync/feed-source/sftp.ts
git commit -m "feat(vendor-sync): SFTP downloader (list -> pick newest -> delta -> fastGet)"
```

---

### Task 5: Feed resolver — route local-file vs SFTP vs default

**Files:**
- Create: `backend/src/modules/vendor-sync/feed-source/resolve-feed.ts`

- [ ] **Step 1: Create the resolver**

Create `backend/src/modules/vendor-sync/feed-source/resolve-feed.ts`:

```ts
import * as path from "path"
import { FeedConfig, LastSeen, ResolvedFeed } from "./types"
import { downloadNewestViaSftp } from "./sftp"

/**
 * Resolve a vendor's feed config to a concrete CSV path (or a short-circuit).
 *   - sftp present     -> pull the newest remote file (with delta short-circuit)
 *   - feedPath present -> use that local file (delta handled by the RunDate short-circuit)
 *   - neither          -> "default": let the adapter use its built-in DEFAULT_CSV_PATH
 */
export async function resolveFeed(cfg: FeedConfig, lastSeen: LastSeen | null): Promise<ResolvedFeed> {
  if (cfg.sftp) return downloadNewestViaSftp(cfg.sftp, lastSeen)
  if (cfg.feedPath) {
    return { kind: "file", csvPath: cfg.feedPath, sourceName: path.basename(cfg.feedPath), modifyTime: null }
  }
  return { kind: "default" }
}
```

- [ ] **Step 2: Type-check and commit**

Run (from `backend/`): `npx tsc --noEmit` — expected: clean for `feed-source/*`.

```bash
git add backend/src/modules/vendor-sync/feed-source/resolve-feed.ts
git commit -m "feat(vendor-sync): resolveFeed router for local-file / sftp / default sources"
```

---

### Task 6: Add `source_modify_time` to the run model + migration

**Files:**
- Modify: `backend/src/modules/vendor-sync/models/vendor-feed-run.ts`
- Create (generated): a new migration + refreshed `.snapshot-vendor-sync-module.json`

**Why:** the SFTP delta needs to remember the last-seen remote mtime. Stored as text (not number) because epoch-ms overflows PostgreSQL `int4`.

- [ ] **Step 1: Add the column to the model**

In `backend/src/modules/vendor-sync/models/vendor-feed-run.ts`, add a field after `source_archive_key` (line 7):

```ts
  source_filename: model.text(),
  source_archive_key: model.text().nullable(),
  source_modify_time: model.text().nullable(),
```

- [ ] **Step 2: Generate the migration + refresh the tracked snapshot**

Run (from `backend/`):

```bash
npx medusa db:generate vendorSyncModuleService
```

(The module name `vendorSyncModuleService` is the `VENDOR_SYNC_MODULE` constant in `backend/src/modules/vendor-sync/index.ts` — confirm if the CLI reports "unknown module".)

Expected: a new `Migration<timestamp>.ts` appears under `backend/src/modules/vendor-sync/migrations/` whose `up()` runs roughly:

```sql
alter table if exists "vendor_feed_run" add column if not exists "source_modify_time" text null;
```

and `.snapshot-vendor-sync-module.json` is updated to include the new column.

- [ ] **Step 3: Apply the migration**

Run (from `backend/`): `npx medusa db:migrate`
Expected: the new migration runs without error.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/vendor-sync/models/vendor-feed-run.ts backend/src/modules/vendor-sync/migrations
git commit -m "feat(vendor-sync): track source_modify_time on runs for SFTP delta detection"
```

---

### Task 7: Wire per-vendor SFTP config from env

**Files:**
- Modify: `backend/medusa-config.js`
- Modify: `backend/src/modules/vendor-sync/service.ts` (options type only)

- [ ] **Step 1: Extend the module options type**

In `backend/src/modules/vendor-sync/service.ts`, add the import and extend the `vendors` value type (lines 18-27):

```ts
import { SftpConfig } from "./feed-source/types"

export interface VendorSyncModuleOptions {
  discontinueThreshold?: number
  applyConcurrency?: number
  archiveBucket?: string
  dryRun?: boolean
  vendors?: Record<
    string,
    { enabled?: boolean; feedPath?: string; sftp?: SftpConfig }
  >
}
```

- [ ] **Step 2: Build the SFTP config in medusa-config.js**

At the top of `backend/medusa-config.js`, where the existing `VENDOR_WHEELPROS_*` env vars are read, add reads for the new SFTP vars (mirror the existing `VENDOR_WHEELPROS_WHEEL_FEED_PATH` line). Then, just before the `vendors:` block (around line 155), build the config objects:

```js
    const buildSftp = (host, port, user, pass, key, dir, pattern) =>
      host ? {
        host,
        port: port ? parseInt(port, 10) : 22,
        username: user,
        password: pass || undefined,
        privateKey: key || undefined,
        remoteDir: dir,
        filePattern: pattern || '.*\\.csv$',
      } : undefined

    const wheelSftp = buildSftp(
      VENDOR_WHEELPROS_WHEEL_SFTP_HOST, VENDOR_WHEELPROS_WHEEL_SFTP_PORT, VENDOR_WHEELPROS_WHEEL_SFTP_USER,
      VENDOR_WHEELPROS_WHEEL_SFTP_PASSWORD, VENDOR_WHEELPROS_WHEEL_SFTP_PRIVATE_KEY,
      VENDOR_WHEELPROS_WHEEL_SFTP_DIR, VENDOR_WHEELPROS_WHEEL_SFTP_PATTERN)
    const tireSftp = buildSftp(
      VENDOR_WHEELPROS_TIRE_SFTP_HOST, VENDOR_WHEELPROS_TIRE_SFTP_PORT, VENDOR_WHEELPROS_TIRE_SFTP_USER,
      VENDOR_WHEELPROS_TIRE_SFTP_PASSWORD, VENDOR_WHEELPROS_TIRE_SFTP_PRIVATE_KEY,
      VENDOR_WHEELPROS_TIRE_SFTP_DIR, VENDOR_WHEELPROS_TIRE_SFTP_PATTERN)
```

Then add `sftp` to each vendor entry in the existing `vendors` block:

```js
        vendors: {
          'wheelpros-wheels': {
            enabled: VENDOR_WHEELPROS_WHEELS_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_WHEEL_FEED_PATH,
            sftp: wheelSftp,
          },
          'wheelpros-tires': {
            enabled: VENDOR_WHEELPROS_TIRES_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_TIRE_FEED_PATH,
            sftp: tireSftp,
          },
        },
```

> Make sure the new `VENDOR_WHEELPROS_*_SFTP_*` identifiers are added wherever the file destructures `process.env` (same place `VENDOR_WHEELPROS_WHEEL_FEED_PATH` is read). `filePattern` is stored as a STRING (not a RegExp) so `JSON.stringify(medusaConfig)` at the bottom of the file still serializes cleanly.

- [ ] **Step 3: Type-check and commit**

Run (from `backend/`): `npx tsc --noEmit` — expected: clean for the touched files.

```bash
git add backend/medusa-config.js backend/src/modules/vendor-sync/service.ts
git commit -m "feat(vendor-sync): wire per-vendor SFTP config from env"
```

---

### Task 8: Thread the resolved feed into the run loop

**Files:**
- Modify: `backend/src/modules/vendor-sync/service.ts`

**Why:** this is where the dead `feedPath` finally gets used and SFTP downloads happen. The resolution runs before `resolveAdapter`, with an early short-circuit when the SFTP feed is unchanged (cheaper than the existing RunDate short-circuit, which needs the file content).

- [ ] **Step 1: Add the import**

Near the top of `backend/src/modules/vendor-sync/service.ts`, with the other pipeline imports:

```ts
import { resolveFeed } from "./feed-source/resolve-feed"
```

- [ ] **Step 2: Resolve the feed and pass it to the adapter**

In `run()`, find the start of the `try {` block and the line `const adapter = resolveAdapter(vendorCode)` (≈ line 137). Replace that single line with the feed-resolution block:

```ts
      // 3. Resolve the feed source (local file or SFTP newest) with delta short-circuit
      const vendorOpts = (this.options_.vendors ?? {})[vendorCode] ?? {}
      const [lastForDelta] = await (this as any).listVendorFeedRuns(
        { vendor_code: vendorCode, status: "completed" },
        { order: { started_at: "DESC" }, take: 1 }
      )
      const lastSeen = lastForDelta?.source_filename
        ? { name: lastForDelta.source_filename, modifyTime: Number(lastForDelta.source_modify_time ?? 0) }
        : null

      const feed = await resolveFeed(
        { feedPath: vendorOpts.feedPath, sftp: vendorOpts.sftp },
        lastSeen
      )

      if (feed.kind === "empty") {
        this.logger_.warn(`[vendor-sync] [${runId}] no feed file found for ${vendorCode}`)
        await (this as any).updateVendorFeedRuns({
          id: runId, status: "completed", error_message: "no feed file found", finished_at: new Date(),
        })
        return { runId }
      }

      if (feed.kind === "unchanged") {
        const durationMs = Date.now() - startTime
        this.logger_.info(
          `[vendor-sync] [${runId}] stage=short-circuited reason=sftp-unchanged vendor=${vendorCode} file=${feed.sourceName} durationMs=${durationMs}`
        )
        await (this as any).updateVendorFeedRuns({
          id: runId, status: "completed",
          source_filename: feed.sourceName, source_modify_time: String(feed.modifyTime),
          finished_at: new Date(),
        })
        return { runId }
      }

      const adapter = resolveAdapter(
        vendorCode,
        feed.kind === "file" ? { csvPath: feed.csvPath } : undefined
      )

      if (feed.kind === "file" && feed.modifyTime != null) {
        await (this as any).updateVendorFeedRuns({ id: runId, source_modify_time: String(feed.modifyTime) })
      }
```

Everything below (the fetch step at ≈ line 139 onward) is unchanged — `descriptor.sourceFilename` is the basename of the resolved path, which for SFTP equals the remote filename (the downloader names the temp file after it), so the existing run-row update keeps recording the right `source_filename`.

- [ ] **Step 3: Run the vendor-sync unit suite (no regressions)**

Run (from `backend/`): `npx -y pnpm@9.10.0 run test:sync`
Expected: all existing pure-function tests pass (the new `pick-newest` / `is-new-feed` tests are included under `src/modules/vendor-sync`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/vendor-sync/service.ts
git commit -m "feat(vendor-sync): resolve SFTP/local feed in run loop + skip unchanged feeds"
```

---

### Task 9: Document SFTP env + manual live verification

**Files:**
- Modify: `backend/.env.template`

- [ ] **Step 1: Document the SFTP env vars**

In `backend/.env.template`, under the `# --- Vendor Sync ...` block, replace the feed-path comments with both options:

```bash
# --- Vendor Sync (WheelPros Wheels + Tires) ---
# VENDOR_WHEELPROS_WHEELS_ENABLED=false
# VENDOR_WHEELPROS_TIRES_ENABLED=false
#
# Feed source — choose ONE per vendor:
#   (a) Local file (dev / fallback):
# VENDOR_WHEELPROS_WHEEL_FEED_PATH=./wheelInvPriceData.csv
# VENDOR_WHEELPROS_TIRE_FEED_PATH=./tireInvPriceData.csv
#   (b) Live SFTP pull (production) — if *_SFTP_HOST is set it WINS over the feed path.
#       The job lists *_SFTP_DIR, downloads the newest file matching *_SFTP_PATTERN,
#       and skips re-download when name+mtime are unchanged since the last run.
# VENDOR_WHEELPROS_WHEEL_SFTP_HOST=
# VENDOR_WHEELPROS_WHEEL_SFTP_PORT=22
# VENDOR_WHEELPROS_WHEEL_SFTP_USER=
# VENDOR_WHEELPROS_WHEEL_SFTP_PASSWORD=
# VENDOR_WHEELPROS_WHEEL_SFTP_PRIVATE_KEY=
# VENDOR_WHEELPROS_WHEEL_SFTP_DIR=/outbound
# VENDOR_WHEELPROS_WHEEL_SFTP_PATTERN=.*\.csv$
# (repeat the seven *_TIRE_SFTP_* vars for tires)
#
# VENDOR_SYNC_FEED_ARCHIVE_BUCKET=vendor-feeds
# VENDOR_SYNC_DISCONTINUE_THRESHOLD=0.05
# VENDOR_SYNC_APPLY_CONCURRENCY=8
# VENDOR_SYNC_DRY_RUN=false
```

- [ ] **Step 2: Manual live verification (run once against the real SFTP server)**

Set the `*_WHEEL_SFTP_*` vars + `VENDOR_WHEELPROS_WHEELS_ENABLED=true` in `backend/.env`, then (from `backend/`):

```bash
rm -rf .medusa/server   # stale-config trap
npx -y pnpm@9.10.0 run vendor-sync:dry-run wheelpros-wheels
```

Confirm the log shows `stage=fetched ... file=<the real remote filename>` (not `wheelInvPriceData.csv`) and a non-zero byte count. Then run it a SECOND time and confirm it logs `stage=short-circuited reason=sftp-unchanged` (delta detection working). Apply with `vendor-sync:apply <run-id>` and confirm wheels land in the catalog.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.template
git commit -m "docs(env): document SFTP vendor-feed configuration"
```

---

## Self-Review Notes

- **Spec coverage:** dependency (T1), pure selection (T2) + delta (T3), SFTP I/O (T4), resolver (T5), delta column (T6), config (T7), run-loop threading + dead-feedPath fix (T8), env docs + live check (T9). The `resolveAdapter(vendorCode)`-with-no-deps bug (the dead `feedPath`) is fixed in T8.
- **Type consistency:** `ResolvedFeed` discriminated union (`file | unchanged | empty | default`) is produced by `resolveFeed`/`downloadNewestViaSftp` and consumed in `service.run`; `SftpConfig.filePattern` is a string everywhere (compiled to RegExp only inside `sftp.ts`); `source_modify_time` is text in the model and `String(modifyTime)` / `Number(...)` at the boundaries.
- **Back-compat:** with no SFTP and no `feedPath`, `resolveFeed` returns `{ kind: "default" }` and `resolveAdapter(vendorCode, undefined)` uses the existing `DEFAULT_CSV_PATH` — current behavior is unchanged until SFTP env is set.
- **Honest testing limit:** `sftp.ts` (network I/O) and the migration are verified manually (T9 / T6), not by unit tests; all selection/delta logic is unit-tested.
- **Deferred:** durable feed archiving to object storage (currently local `static/vendor-feeds`), an admin dashboard UI for runs, and turning tires into grouped products remain follow-ups (see master plan).
