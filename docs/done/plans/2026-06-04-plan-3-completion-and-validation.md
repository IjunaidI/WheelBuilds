# Plan 3 — Live Vendor SFTP Feed: Completion & Validation Record

> Companion to [`2026-06-01-plan-3-live-vendor-sftp-feed.md`](./2026-06-01-plan-3-live-vendor-sftp-feed.md). This is the as-built record: every task, its files, its commit, the exact verification command + observed output, the deviations from the plan, the live-run results, and a from-scratch re-validation checklist.

- **Date completed:** 2026-06-04
- **Branch:** `feat/vendor-sftp-feed` → fast-forward merged into `main` (`69a0a95` → `34c153b`), **local only — not pushed to `origin`**.
- **Commits:** 9 (one per task, plan's exact messages).
- **Goal achieved:** the vendor CSV import is no longer a hardcoded local sample file — `service.run()` resolves the newest matching file from the vendor SFTP server, downloads it, skips it when unchanged (name+mtime delta), and feeds the existing `stage → diff → apply → index` pipeline unchanged.

---

## 1. Outcome at a glance

| Item | Result |
|---|---|
| Unit tests (`src/modules/vendor-sync`) | **172 passed**, 4 skipped (1 integration suite), incl. 7 new tests |
| `tsc --noEmit` on new code | clean (only 2 **pre-existing** errors remain in `pipeline/bootstrap.ts` + `pipeline/stage.ts`, unrelated) |
| Live SFTP fetch (dry-run pass 1) | ✅ pulled real 14.1 MB `wheelInvPriceData.csv`, 41,787 rows → 34,777 staged → 2,941 new groups |
| Live delta short-circuit (dry-run pass 2) | ✅ `stage=short-circuited reason=sftp-unchanged` in 7.4 s |
| `source_modify_time` migration | ✅ applied to prod DB (`trolley.proxy.rlwy.net`) |
| Catalog-writing `vendor-sync:apply` | ⛔ intentionally **NOT run** (gated) — prod catalog has no wheels yet |
| Push to `origin/main` | ⛔ not pushed |

---

## 2. How it was executed (process)

Each task ran through a **multi-agent Workflow**: an implementer agent (file edits only) → a spec-compliance reviewer → a code-quality reviewer, with fix loops. Subagents were forbidden from running any shell/git/test/build/DB command; **the orchestrator (main loop) ran every test, `tsc`, commit, `db:generate`/`db:migrate`, and the SFTP dry-runs.** TDD (real `jest` RED→GREEN) was used for the two pure helpers. Implementer agents transcribed code by reading the specific task section of the plan (the canonical source) to avoid escaping drift.

---

## 3. Task-by-task record

> Verification commands run from `backend/` (use `npx -y pnpm@9.10.0 <script>` if `pnpm` is not on PATH).

### Task 1 — add `ssh2-sftp-client` · commit `5337f5a`
- **Files:** `backend/package.json`, `backend/pnpm-lock.yaml`
- **Did:** `pnpm add ssh2-sftp-client` (→ `^12.1.1`, dependencies) + `pnpm add -D @types/ssh2-sftp-client` (→ `9.0.6`, devDependencies).
- **Verify:** `grep ssh2-sftp-client backend/package.json` → present in both blocks.
- **Note:** ssh2's optional native crypto binding fails to compile on this Windows box (no MSVC / Visual Studio C++). This is harmless — ssh2 falls back to a pure-JS crypto implementation, which connected to the vendor server fine (see §5). On Railway's Linux builder the native binding should compile.

### Task 2 — pure `pickNewestFeed` + feed-source types · commit `6ac94cc`
- **Files:** `feed-source/types.ts`, `feed-source/pick-newest.ts`, `__tests__/pick-newest.test.ts`
- **TDD:** test written first → `npx jest src/modules/vendor-sync/__tests__/pick-newest.test.ts` RED (`Cannot find module '../feed-source/pick-newest'`) → impl → GREEN (3 passed).

### Task 3 — pure `isNewFeed` delta helper · commit `bd68fda`
- **Files:** `feed-source/is-new-feed.ts`, `__tests__/is-new-feed.test.ts`
- **TDD:** RED (`Cannot find module '../feed-source/is-new-feed'`) → impl → GREEN (4 passed).

### Task 4 — SFTP downloader · commit `cc6877d`
- **Files:** `feed-source/sftp.ts` (exports `async downloadNewestViaSftp(cfg, lastSeen)`)
- **Verify:** `npx tsc --noEmit` → no `feed-source/*` errors (the `@types/ssh2-sftp-client` `Client` type resolves). Thin I/O boundary; decision logic lives in the unit-tested pure helpers; real exercise is §5.

### Task 5 — `resolveFeed` router · commit `64b9caa`
- **Files:** `feed-source/resolve-feed.ts` (sftp → download; feedPath → local file; neither → `{kind:'default'}`)
- **Verify:** `npx tsc --noEmit` → clean for `feed-source/*`.

### Task 6 — `source_modify_time` column + migration · commit `f3f3917`
- **Files:** `models/vendor-feed-run.ts` (`source_modify_time: model.text().nullable()`), `migrations/Migration20260604001450.ts`, `migrations/.snapshot-vendor-sync-module.json`
- **Did:** agent edited the model only; orchestrator ran `npx medusa db:generate vendorSyncModuleService` for the snapshot, then **hand-authored** the migration body (see deviation §4.2). Column is `text` (not number) because epoch-ms overflows `int4`.
- **Verify:** `npx jest src/modules/vendor-sync` → 172 passed (no regression from the model change).

### Task 7 — wire per-vendor SFTP config from env · commit `b64143d`
- **Files:** `src/lib/constants.ts` (14 new env exports), `medusa-config.js` (`buildSftp` + `wheelSftp`/`tireSftp` + `sftp:` on both vendor entries), `service.ts` (`SftpConfig` import + widened `vendors` value type)
- **Repo-specific deviation:** `medusa-config.js` reads env via named imports from `lib/constants`, **not** `process.env` directly, so the 14 vars were added to `constants.ts` too (the plan only named `medusa-config.js`).
- **Verify:** `npx tsc --noEmit` → no new errors; `filePattern` stays a string so `JSON.stringify(medusaConfig)` serializes cleanly.

### Task 8 — thread resolved feed into run loop · commit `c3a4562`
- **Files:** `service.ts` (added `resolveFeed` import; replaced `const adapter = resolveAdapter(vendorCode)` with the feed-resolution block: load last completed run → `lastSeen` → `resolveFeed` → early-return on `empty`/`unchanged` → `resolveAdapter(vendorCode, {csvPath})` → record `source_modify_time`)
- **Verify:** `npx jest src/modules/vendor-sync` → 172 passed; `npx tsc --noEmit` → no new errors (discriminated-union narrowing on `feed.kind` type-checks).

### Task 9 — document SFTP env + live verification · commit `34c153b` (docs) + live run
- **Files:** `backend/.env.template` (documents both feed sources; **empty SFTP placeholders only**)
- **Secret-leak scan:** `grep -nE "wheelpros\.com|metroplex|Metroplex1" backend/.env.template` → empty.
- **Live verification:** see §5. The catalog-writing `apply` step was gated and not run.

---

## 4. Deviations from the plan (important for validators)

### 4.1 Pre-existing overreach was reset
The first task's Workflow ran with a broken parameter channel (`args` did not reach the script), so its reviewer/fix agents implemented far beyond their task and left a large pile of **uncommitted, unreviewed** changes in the working tree — including a migration with a **fabricated timestamp** (`Migration20260601120000.ts`). This was detected (an unexpected test pass) and **all uncommitted overreach was reset** (`git checkout --` the tracked files, `rm` the untracked ones). Tasks 3–9 were then redone cleanly with a baked-in per-task config. The final committed code is byte-equivalent to the plan; nothing from the broken-prompt run was committed.

### 4.2 `db:generate` is a footgun for this module → migration hand-authored
`medusa db:generate vendorSyncModuleService` connects to the DB and diffs this module's (vendor-only) entities against the **full** prod schema, so it emits a migration whose `up()` is `drop table … cascade` for the **entire Medusa schema** (cart, order, product, payment, …). Applying that would have destroyed the prod DB — which is exactly why `db:migrate` was gated. Resolution:
- The **snapshot** update from `db:generate` is correct and was kept (it also caught up prior `group_key`/`failed_part_numbers` snapshot drift — those columns already exist in prod).
- The **poison migration was deleted** and replaced with a hand-authored minimal `Migration20260604001450.ts`:
  ```sql
  -- up()
  alter table if exists "vendor_feed_run" add column if not exists "source_modify_time" text null;
  -- down()
  alter table if exists "vendor_feed_run" drop column if exists "source_modify_time";
  ```
  This matches this module's existing migrations (`Migration20260517220005`, `…0521150000`, `…0522100000`), which are all hand-authored. **Lesson for future schema changes to vendor-sync: hand-write the migration; take only the snapshot from `db:generate`.**

### 4.3 `constants.ts` added to Task 7 (see §3, Task 7).

---

## 5. Live SFTP verification (the real proof)

Source: `sftp://metroplex@sftp.wheelpros.com:22/CommonFeed/USD/WHEEL/`, pattern `wheelInvPriceData\.csv$`. Creds were placed in **gitignored** `backend/.env` (never committed).

**Pass 1** — `pnpm run vendor-sync:dry-run wheelpros-wheels`:
```
stage=fetched   vendor=wheelpros-wheels file=wheelInvPriceData.csv bytes=14102226 archiveKey=…\static\vendor-feeds\wheelpros-wheels\2026-06-04-0044.csv
Staging complete: 41787 rows parsed, 34777 staged, 6924 skipped (no image)
stage=diffed    newGroups=2941 changedGroups=12 discontinuedGroups=1 newParts=34741 changedParts=9 discontinuedParts=1
stage=completed vendor=wheelpros-wheels dryRun=true durationMs=634039
Run ID: 01KT81B5GNK3QRN78CK48CCSGJ   Status: completed
```
Proves: SFTP connected (pure-JS crypto), pulled the **real remote file** (not the local sample), staged + diffed against current state — no Medusa catalog mutation.

**Pass 2** — same command again:
```
stage=short-circuited reason=sftp-unchanged vendor=wheelpros-wheels file=wheelInvPriceData.csv durationMs=7438
Status: completed
```
Proves: delta detection works — same name+mtime as the last completed run → skipped download/staging entirely (7.4 s vs 634 s).

---

## 6. Prod DB / migration state

- `npx medusa db:migrate` was run against prod **with explicit user go-ahead**. It reported exactly **one** pending schema migration applied: `Migration20260604001450` (the `source_modify_time` ALTER). Everything else was already up to date. (A `create-super-admin-role` post-migration *script* also ran — idempotent Medusa internal, harmless.)
- The migration also auto-applies on the next Railway deploy via `init-backend`, so a deploy of `main` will not double-apply (the `if not exists` guards make it idempotent regardless).

---

## 7. Intentionally NOT done (open gates / follow-ups)

1. **`vendor-sync:apply` not run.** The prod catalog has **no wheels** until an apply runs. To populate it: `pnpm run vendor-sync:apply 01KT81B5GNK3QRN78CK48CCSGJ` (re-diffs against current state first), or let the 12 h cron tick after deploy. This WRITES ~2,941 product groups / 34,741 parts + brand collections/categories/inventory and triggers Meilisearch indexing.
2. **Not pushed** to `origin/main` (local merge only, consistent with Plans 1 & 2).
3. **Temporary SFTP credentials** live in gitignored `backend/.env` and are to be **rotated** by the owner.
4. **Deferred per the plan's own notes:** durable feed archiving to object storage (currently local `static/vendor-feeds`), an admin dashboard UI for runs, and turning tires into grouped products.

---

## 8. Re-validation checklist (validate from scratch)

All from `backend/`. Items marked ⚠ touch the network / prod DB.

1. **Code present & merged**
   - `git log --oneline 69a0a95..34c153b` → the 9 commits `5337f5a … 34c153b`.
   - `git rev-parse main` → `34c153b…`.
2. **Unit tests**
   - `npx jest --passWithNoTests src/modules/vendor-sync` → **172 passed**, 4 skipped.
   - `npx jest src/modules/vendor-sync/__tests__/pick-newest.test.ts` → 3 passed.
   - `npx jest src/modules/vendor-sync/__tests__/is-new-feed.test.ts` → 4 passed.
3. **Type check** — `npx tsc --noEmit` → only the 2 known pre-existing errors (`pipeline/bootstrap.ts:184`, `pipeline/stage.ts:83`); nothing under `feed-source/`, `service.ts`, `models/`, `migrations/`.
4. **Migration is the safe one** — open `src/modules/vendor-sync/migrations/Migration20260604001450.ts`; `up()` is a single `add column if not exists "source_modify_time"`. It must NOT contain any `drop table`.
5. **No secrets in the template** — `grep -nE "wheelpros\.com|metroplex|Metroplex1" .env.template` → empty.
6. ⚠ **Live SFTP fetch** — set the 7 `VENDOR_WHEELPROS_WHEEL_SFTP_*` vars + `VENDOR_WHEELPROS_WHEELS_ENABLED=true` in `.env`, then `rm -rf .medusa/server && pnpm run vendor-sync:dry-run wheelpros-wheels`. Expect `stage=fetched … file=wheelInvPriceData.csv bytes>0`.
7. ⚠ **Delta short-circuit** — run the dry-run a 2nd time → `stage=short-circuited reason=sftp-unchanged`.
8. ⚠ **DB column exists** — the dry-run only succeeds if `source_modify_time` exists on `vendor_feed_run` (i.e. the migration is applied). If you see `column "source_modify_time" … does not exist`, run `npx medusa db:migrate`.
9. ⚠ **(optional) catalog apply** — `pnpm run vendor-sync:apply <run-id>` then confirm products land (Medusa admin `/app` + Meilisearch wheel docs).

---

## 9. Files added / changed (net)

```
backend/package.json, pnpm-lock.yaml                    (Task 1)
backend/src/modules/vendor-sync/feed-source/
  types.ts, pick-newest.ts, is-new-feed.ts, sftp.ts, resolve-feed.ts   (Tasks 2-5)
backend/src/modules/vendor-sync/__tests__/
  pick-newest.test.ts, is-new-feed.test.ts                (Tasks 2-3)
backend/src/modules/vendor-sync/models/vendor-feed-run.ts             (Task 6)
backend/src/modules/vendor-sync/migrations/
  Migration20260604001450.ts, .snapshot-vendor-sync-module.json       (Task 6)
backend/src/lib/constants.ts                            (Task 7)
backend/medusa-config.js                                (Task 7)
backend/src/modules/vendor-sync/service.ts              (Tasks 7-8)
backend/.env.template                                   (Task 9)
```

Untouched by design: the `stage → diff → apply → index` pipeline, the price-unit convention (dollars in Medusa / cents in Meilisearch), and the wheel grouping rules. Plan 3 changed only the **source** of the CSV.
