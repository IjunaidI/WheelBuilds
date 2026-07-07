# Docs truth sweep (WB-075) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Docs + the env/ops surface tell the truth about current `main`; the two lying code paths (newsletter race, module-status log) deliver their contracts; dead code is gone and the tsc/test baselines are re-measured and re-documented. Final cluster — closes the G9 epic.

**Architecture:** Two focused backend code fixes (newsletter atomic upsert, module-status truthiness) + one deletion (dead resolve-variant) + doc edits (`.env.template`, one done spec addendum, `STATUS.md`, `README.md`, `storefront/CLAUDE.md`). Runs LAST so counts are final.

**Tech Stack:** MedusaJS 2.13.6 backend (`test:sync`), Next.js 15 storefront (`tsc`).

**Spec:** [docs/in-progress/specs/2026-07-07-docs-truth-sweep-design.md](../specs/2026-07-07-docs-truth-sweep-design.md)

## Global Constraints
- Backend cmds from `backend/`, storefront from `storefront/`. `npx -y pnpm@9.10.0` if pnpm missing.
- Backend gate: `pnpm test:sync` + `medusa build` exit 0. Storefront gate: `npx tsc --noEmit` (re-measure baseline).
- Do NOT change `medusa-config.js` truthiness or the Meili index. Do NOT rewrite done-spec history (addendum only). Do NOT run any script against prod DB.
- `/doc-review` before the final doc commit.
- Commit `fix(docs): <what> (WB-075 DOC<n>)` / `docs(g9): <what> (WB-075)` + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Delete dead `resolveSelectedVariant` + re-measure tsc baseline (DOC1, LOW)

**Files:** Delete `storefront/src/modules/product-detail/data/resolve-variant.ts` + `resolve-variant.test.ts`.

- [ ] **Step 1 — confirm dead:** `git grep -n "resolveSelectedVariant" storefront/src` shows ONLY those two files (hero uses `resolveLeafVariant` from `group-sizes.ts`). If any prod caller exists, STOP and reduce to a doc re-point instead.
- [ ] **Step 2 — measure baseline before:** `cd storefront && npx tsc --noEmit 2>&1 | wc -l`-style count of the current baseline errors (expect 14) and note the two `resolve-variant.test.ts` errors in the list.
- [ ] **Step 3 — delete** both files. Re-run `npx tsc --noEmit`; confirm the count dropped by exactly 2 (expect 12) and the remaining errors are the SAME set minus the two deleted. Record the new count + file list (feeds Task 6). `npx vitest run` still green (the deleted test isn't referenced elsewhere).
- [ ] **Step 4:** Commit `fix(docs): delete dead resolveSelectedVariant (clears 2 baseline tsc errors) (WB-075 DOC1)`.

### Task 2: Newsletter subscribe — atomic, always 201 (DOC2, LOW)

**Files:** Modify `backend/src/modules/newsletter/service.ts` (`subscribe`) + `backend/src/api/store/newsletter/route.ts`. Test: newsletter service test (in `test:sync`).

- [ ] **Step 1 — read** `subscribe()` (`service.ts:14-16`), `route.ts:16-21`, the migration's partial unique index (exact name + `WHERE deleted_at IS NULL` predicate), the module's soft-delete behavior, and how the module runs raw SQL (mirror WB-070's `ON CONFLICT` usage — grep the vendor-sync/fitment services for the pattern).
- [ ] **Step 2 — failing test:** two `subscribe(sameEmail)` calls both succeed (no throw); the second is a no-op/idempotent (still one active row); a resubscribe after soft-delete re-activates rather than dead-ends.
- [ ] **Step 3 — implement:** rewrite `subscribe()` as an atomic upsert — `INSERT … ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING` (using the confirmed index predicate), or catch the unique-violation and treat as success; re-activate on a soft-deleted match. `route.ts` returns 201 for both new + already-subscribed (add a try/catch if any path can still throw). Honors the documented "always 201" contract.
- [ ] **Step 4:** `pnpm test:sync` + `medusa build`. Commit `fix(docs): atomic idempotent newsletter subscribe (always 201) (WB-075 DOC2)`.

### Task 3: `module-status` mirrors `medusa-config` truthiness (DOC4, LOW)

**Files:** Modify `backend/src/lib/module-status.ts` (`has`) + `backend/src/lib/module-status.test.ts`.

- [ ] **Step 1 — read** `has()` (`module-status.ts:13`, the `.trim() !== ''`) + the three `medusa-config.js` call sites (raw truthiness) + `module-status.test.ts`'s current assertions.
- [ ] **Step 2 — implement:** drop the `.trim()` so `has(k)` mirrors `medusa-config`'s untrimmed truthiness (a registered module never logs DISABLED). Update `module-status.test.ts` to assert the aligned behavior (a whitespace-only value now reports the same as config would register).
- [ ] **Step 3:** `pnpm test:sync` + `medusa build`. Commit `fix(docs): module-status log mirrors medusa-config registration (WB-075 DOC4)`.

### Task 4: Correct the `.env.template` master-key promise (DOC3, LOW)

**Files:** Modify `backend/.env.template` (lines ~29-30).

- [ ] **Step 1 — confirm:** `git grep -n "MEILISEARCH_MASTER_KEY" backend/` shows only the template line (no code path).
- [ ] **Step 2 — implement:** rewrite the comment to the real contract — `MEILISEARCH_HOST` + `MEILISEARCH_ADMIN_KEY` are what enable Meili; there is no master-key fallback — or delete the master-key line. No false promise.
- [ ] **Step 3:** Commit `fix(docs): correct .env.template Meilisearch key promise (WB-075 DOC3)`.

### Task 5: Addendum to the stale done fitment-aware-PDP spec (DOC5, LOW)

**Files:** Modify `docs/done/specs/2026-07-01-fitment-aware-pdp-design.md`.

- [ ] **Step 1 — read** the stale section (`:78`, the `hasFit:false`→"show everything" + `FitView.defaults` claim) + current `fit-view.ts` + `hero/index.tsx:190-206` to state the shipped behavior accurately.
- [ ] **Step 2 — implement:** append a dated "**Addendum (2026-07-07) — superseded by WB-072**" note: `hasFit:false` now renders a red "doesn't fit your {vehicle} — reference only" banner (not "show everything"); there is no `FitView.defaults` object; WB-072 added per-variant bore+offset pairing + offset trimming. Don't edit the historical body.
- [ ] **Step 3:** Commit `docs(g9): addendum correcting done fitment-aware-PDP spec (WB-075 DOC5)`.

### Task 6: Doc-drift sweep — STATUS Tests block, README, storefront/CLAUDE.md (DRIFT)

**Files:** Modify `docs/STATUS.md`, `README.md`, `storefront/CLAUDE.md`.

- [ ] **Step 1 — measure:** run `cd backend && pnpm test:sync` + `pnpm test:fitment` and `cd storefront && npx vitest run` to capture CURRENT counts (expect 312 / 98 / 214) + carry the Task-1 tsc baseline (expect 12 + its file list).
- [ ] **Step 2 — STATUS.md:** update the "## Tests" block (lines ~6-11) to the measured 312 / 98 / 214; update any "14-baseline" tsc reference to the Task-1 number.
- [ ] **Step 3 — README.md:** correct the enumerated false claims ONLY (no stylistic rewrite): test counts; "Checkout out of scope" → live (+ WB-071 hardened); "[ ] Tire grouping" → shipped (WB-005, live); "[ ] Admin dashboard UI for runs" → shipped (WB-006); "[ ] PDP reverse-fitment" → shipped (WB-009/WB-065); "~248 wheels"/"next milestone smoke test" → current catalog size + live status.
- [ ] **Step 4 — storefront/CLAUDE.md:** update the "Pre-existing TS errors" baseline list to the Task-1 re-measured file list + count (remove `order-completed-template.tsx`, remove the now-deleted `resolve-variant.test.ts`).
- [ ] **Step 5:** `/doc-review`. Commit `docs(g9): truth-sweep STATUS/README/CLAUDE test-counts + shipped features (WB-075 DRIFT)`.

### Task 7: Close the G9 epic
- [ ] Flip WB-073 / WB-074 / WB-075 to `done` in [BACKLOG.md](../../future/BACKLOG.md) (and the WB-069 umbrella if all children done); update `docs/STATUS.md` "Last verified" + any pillar row; note the G9 epic complete.
- [ ] Move all three clusters' spec+plan from `docs/in-progress/` → `docs/done/` (git mv).
- [ ] `/doc-review`. Commit `docs(g9): close audit-remediation epic — WB-073/074/075 done (WB-075)`.

## Self-Review
Spec coverage: DOC1→T1, DOC2→T2, DOC4→T3, DOC3→T4, DOC5→T5, DRIFT→T6, epic-close→T7. All mapped. Ordering is load-bearing: T1 (delete + re-measure baseline) BEFORE T6 (documents the new baseline); T6 measures final test counts AFTER T2/T3 code changes land. DOC2's `ON CONFLICT` uses the existing index (confirmed in T2 step 1) — no migration. No history rewrite (T5 addendum). No prod-DB runs. No placeholders — each task pins the file:line and the exact edit; the two code tasks are test-gated, the doc tasks verified against grep/current code.
