# WB-115 · Dead-image exclusion — implementation plan

Spec: [`2026-07-20-dead-image-exclusion.md`](../specs/2026-07-20-dead-image-exclusion.md)

Backend-only. 5 tasks, sequential. Tasks 1–2 are pure + unit-tested with no I/O;
task 3 wires them in; task 4 is the live dry-run gate; task 5 is closeout.

**Global gates** (every task): `pnpm test:sync` green (382 baseline, must not
drop) and `npx medusa build` clean.

---

## Task 1 — pure core: skip reason + circuit breaker

**Files:** `backend/src/modules/vendor-sync/pipeline/stage.ts`,
new `backend/src/modules/vendor-sync/pipeline/__tests__/image-gate.test.ts`

1. Extend `stageSkipReason` to accept `imageReachable?: boolean` and return the
   new `"image-unreachable"` reason. Order matters: empty URL still returns
   `"no-image"` first; `imageReachable === false` returns `"image-unreachable"`;
   `undefined` (not checked) must be treated as **reachable** — fail open.
2. Add pure `shouldTrustImageChecks(checked: number, dead: number, maxRatio: number): boolean`
   — false when `checked > 0 && dead / checked > maxRatio`.
3. Extend `StageResult` with `skippedImageUnreachableCount` and
   `imageChecksDistrusted: boolean`.

**Tests:** full truth table for `stageSkipReason` (incl. `undefined` → staged,
and empty-URL-beats-unreachable precedence); `shouldTrustImageChecks` at, just
under, and just over the threshold, plus the `checked === 0` case.

**Do not** touch `stageFeed` yet. Keep both functions pure and synchronous.

---

## Task 2 — the reachability checker + its cache

**Files:** new `backend/src/modules/vendor-sync/pipeline/image-reachability.ts`,
new model `backend/src/modules/vendor-sync/models/vendor-image-check.ts`,
migration, tests.

1. Model `vendor_image_check`: `url` (PK, text), `last_status` (int, nullable),
   `last_checked_at` (timestamp), `consecutive_failures` (int, default 0).
   Generate the migration with `medusa db:generate` — see the CLAUDE.md note on
   module-scoped snapshots being tracked.
2. `createImageReachabilityChecker({ service, logger, fetchImpl, ttlDays, concurrency })`
   returning `check(urls: string[]): Promise<Map<string, boolean>>`:
   - in-memory Map first (per-run dedupe), then the DB cache
   - cache hit and `last_status` is a success and `last_checked_at` within
     `ttlDays` (default 7) → reachable without a network call
   - known-dead → **always re-check** (so recovery is automatic)
   - network: `HEAD`, `concurrency` default 24, per-request timeout (default 10s)
   - **fail open**: only `404`/`410` → `false`. Timeout, DNS error, `5xx`,
     `429`, or any throw → `true`.
   - persist each outcome; bump/reset `consecutive_failures`
3. Pure helper `classifyImageResponse(status | error) -> "dead" | "alive"`,
   exported for testing.

**Tests** (inject `fetchImpl`, no real network): 404 → dead; 410 → dead;
200 → alive; 500/429/timeout/throw → **alive** (the fail-open guard — assert
each explicitly); TTL fresh → no fetch; TTL stale → refetch; known-dead →
refetch even when fresh; concurrency cap respected; duplicate URLs fetched once.

---

## Task 3 — wire into `stageFeed`

**File:** `backend/src/modules/vendor-sync/pipeline/stage.ts`

1. Thread a checker into `stageFeed` (optional param — when absent, behave
   exactly as today, so existing tests and callers are unaffected).
2. Per existing `BATCH_SIZE` batch: collect the batch's unique non-empty image
   URLs → `await checker.check(...)` → pass each row's verdict into
   `stageSkipReason` → filter → insert. Preserves streaming/bounded memory.
3. Accumulate `checked`/`dead` totals. **After** staging, apply
   `shouldTrustImageChecks`; if distrusted, log an error, set
   `imageChecksDistrusted`, and — because rows were already filtered — the run
   must be aborted rather than applied. Surface it as a hard failure so the
   caller does not proceed to diff/apply on a distrusted run.
4. Config: read `imageCheck: { enabled, maxDeadRatio, ttlDays, concurrency, timeoutMs }`
   from the vendor-sync module options in `medusa-config.js`, env-overridable
   (`VENDOR_SYNC_IMAGE_CHECK_ENABLED` default **true**,
   `VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO` default `0.40`). Include the kill switch
   so this can be turned off in production without a redeploy of logic.
5. Log the new skip count alongside the existing no-image/invalid-price counts.

**Tests:** `stageFeed` with a stub checker — rows with dead URLs are not
inserted and are counted; with no checker, behavior is byte-identical to today;
distrusted run raises rather than silently staging a gutted feed.

---

## Task 4 — live dry-run gate (no apply)

**Not a code task — a verification gate. Report numbers, change nothing.**

1. `pnpm vendor-sync:dry-run wheelpros-wheels`, then `wheelpros-tires`.
2. Report: rows skipped `image-unreachable` per vendor; the dead/checked ratio
   (must be under 0.40 or the breaker fires); how many groups land in
   `discontinuedGroups` vs `changedGroups.removed_part_numbers`.
3. **Expected:** ≈664 products' worth of rows skipped across both vendors
   (267 wheels / 397 tires), and the wheel side should show a meaningful number
   of *partial* group changes (decision 2 working) rather than everything
   landing in `discontinuedGroups`.
4. If the numbers materially disagree with the spec's probe, **stop and report**
   — do not apply.

Apply is a separate, explicitly-approved step (see Deploy in the spec).

---

## Task 5 — docs closeout

1. `docs/future/BACKLOG.md`: add WB-115, status `done`.
2. `docs/STATUS.md`: bump "Last verified", note the catalog-size change and the
   deploy ordering (deploy → dry-run → inspect → apply).
3. Move spec + plan `docs/in-progress/` → `docs/done/`.
4. Root `CLAUDE.md`: under vendor-sync, document the image reachability gate,
   the fail-open rule, the circuit breaker, and the `vendor_image_check` cache.
5. `storefront/src/lib/util/has-image.ts`: comment noting it is an emptiness
   check, **not** reachability — reachability is enforced at staging.
6. Run `/doc-review` before committing.

---

## Risks

| Risk | Mitigation |
|---|---|
| CDN outage delists the whole catalog | Fail open + 0.40 circuit breaker + `ENABLED` kill switch (task 2/3 tests assert each fail-open branch) |
| First run is slow (1,896 HEADs) | Concurrency 24 + 7-day cache; one-time cost |
| Vendor rate-limits our HEADs | `429` is fail-open; concurrency capped |
| A dead image recovers but product stays hidden | Known-dead URLs re-check every run |
| Cron applies this before a human reviews | Task 4 dry-run gate; apply is separately approved |
