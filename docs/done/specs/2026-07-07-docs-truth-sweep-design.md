# Docs truth sweep — make the docs (and two lying code paths) match the repo (G9 cluster 6) — Design

> Status: **in-progress** (spec). Session = epic **G9** (audit remediation), cluster **docs-truth-sweep**.
> Proposed backlog id: **WB-075** (under the WB-069 umbrella).
> Remediates **5 ops-docs findings + the doc-drift sweep**, re-verified against current `main` 2026-07-07 —
> **all HOLD** (WB-070/071/072 merged since and made several docs MORE stale).
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)
> Umbrella: [docs/future/plans/2026-07-06-audit-remediation-theme.md](../../future/plans/2026-07-06-audit-remediation-theme.md)
> Raw findings: [audit-findings-ops-docs.md](../../future/plans/2026-07-06-audit-findings-ops-docs.md)

## 1. Context

The G9 audit's lowest-severity but most-pervasive class: **docs and comments that describe a repo that no
longer exists**, plus two code paths whose behavior contradicts the contract the docs claim. After three
merged clusters this session (WB-070/071/072), the drift widened — `README.md` still says checkout is "out
of scope" and tire grouping is unbuilt; `STATUS.md`'s Tests block still shows 244/66/200 (actual 312/98/214);
a done spec describes fit-view UX that WB-072 inverted; a dead `resolveSelectedVariant` file rots (and
contributes 2 of the 14 baseline tsc errors); the newsletter subscribe races to a 500 against its own unique
index; and `module-status` logs a module DISABLED that `medusa-config` actually registered.

The remediation principle (G9 theme): **the docs and the env/ops surface tell the truth about the code as it
is today; where a comment promises a behavior, the code either delivers it or the comment goes.** This is the
**final** cluster — it also re-baselines the tsc/test counts the earlier clusters shifted, so the repo's
self-description is correct when the epic closes.

### The findings this cluster closes

| # | Sev | One-line | Kind | Where |
|---|---|---|---|---|
| DOC1 | LOW | `resolveSelectedVariant` is dead code kept green by its own test (+2 of the 14 baseline tsc errors) | code (delete) | `product-detail/data/resolve-variant.ts` (+test) |
| DOC2 | LOW | newsletter subscribe is non-atomic list-then-create → concurrent dup POST 500s on the unique index | code | `backend/.../newsletter/service.ts` + `route.ts` |
| DOC3 | LOW | `.env.template` promises a `MEILISEARCH_MASTER_KEY` fallback no code implements | doc | `backend/.env.template` |
| DOC4 | LOW | `module-status.ts` trims env values; `medusa-config.js` uses raw truthiness → module registered but logged DISABLED | code | `backend/src/lib/module-status.ts` |
| DOC5 | LOW | done fitment-aware-PDP spec describes `hasFit:false`→"show everything" + a `defaults` object; WB-072 inverted this | doc | `docs/done/specs/2026-07-01-fitment-aware-pdp-design.md` |
| DRIFT | — | `STATUS.md` Tests block, `README.md` (checkout/tires/admin/reverse-fitment/catalog size), `storefront/CLAUDE.md` baseline-error list | doc | those files |

### Current-state facts (grounded, re-verified 2026-07-07)

| Fact | Evidence |
|---|---|
| `resolveSelectedVariant` referenced ONLY by itself + its test (5 self-hits); hero uses `resolveLeafVariant`. Its test has 2 `tsc` errors (missing `centerBoreMm`/`loadRatingLb` on the fixture) baked into the 14-baseline. | [resolve-variant.ts:9](../../../storefront/src/modules/product-detail/data/resolve-variant.ts#L9), [group-sizes.ts:158](../../../storefront/src/modules/product-detail/data/group-sizes.ts#L158) |
| `subscribe()` = `listNewsletterSubscriptions({email})` → `createNewsletterSubscriptions(...)`, no transaction/upsert; `route.ts` has no try/catch. Concurrent dup insert vs the partial unique index throws uncaught → 500 (contract is "always 201"). | [newsletter/service.ts:14-16](../../../backend/src/modules/newsletter/service.ts#L14), [newsletter/route.ts:16-21](../../../backend/src/api/store/newsletter/route.ts#L16) |
| `.env.template:29-30` says MASTER_KEY "Required if ADMIN_KEY not set" + "admin key will be fetched using master key" — zero implementation (grep: only the template + audit doc); config gates Meili on `MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY` only. | [.env.template:29-30](../../../backend/.env.template#L29), [medusa-config.js:236](../../../backend/medusa-config.js#L236) |
| `module-status.has()` requires `env[k].trim() !== ''`; `medusa-config.js` uses untrimmed truthiness (MinIO `:117`, WHEEL_SIZE `:220`, Meili `:236`). Whitespace-only value → registered but logged DISABLED. `module-status.test.ts` asserts current behavior. | [module-status.ts:13](../../../backend/src/lib/module-status.ts#L13) |
| done spec `:78` says `hasFit:false`→"Callers then show everything" + a `FitView.defaults` object; current `fit-view.ts` has NO `defaults` field, and `hero/index.tsx:190-206` renders a red "doesn't fit… reference only" banner. WB-072 (per-variant bore+offset, offset trim) landed on top. | [fitment-aware-pdp-design.md:78](../../done/specs/2026-07-01-fitment-aware-pdp-design.md#L78), [fit-view.ts:14-25,94-113](../../../storefront/src/modules/product-detail/data/fit-view.ts#L14) |
| `STATUS.md` Tests block (lines 6-11): test:sync 244, test:fitment 66, vitest 200 — actual **312 / 98 / 214** (the prose changelog lines 28-30 already state the right numbers). | [STATUS.md:6-11](../../STATUS.md#L6) |
| `README.md`: "194 backend + 31 storefront tests"; "Checkout — currently out of scope"; "[ ] Tire grouping"; "[ ] Admin dashboard UI for runs"; "[ ] PDP reverse-fitment"; "~248 wheels". All shipped/wrong. Frozen ~pre-Phase-2. | [README.md](../../../README.md) |
| `.superpowers/` is git-ignored (own nested `.gitignore` = `*`), NOT committed — clean, nothing to do. | `git status --ignored` |

## 2. Goals / non-goals

**Goals**
- The two lying code paths tell the truth: newsletter subscribe is idempotent/atomic (always 201, no race
  500) (DOC2); `module-status` mirrors `medusa-config`'s registration condition (DOC4).
- Dead code is gone (DOC1) and the tsc/test baselines are re-measured and re-documented (14→ the new count).
- The false env promise (DOC3), the stale done spec (DOC5), the `STATUS.md` Tests block, `README.md`, and
  `storefront/CLAUDE.md`'s baseline-error list all match current `main`.
- On epic close, `STATUS.md`/`BACKLOG.md` record WB-073/074/075 done and the G9 epic complete.

**Non-goals**
- No behavior change to Meilisearch registration itself (DOC4 aligns the LOG to config, doesn't change what
  loads) — the load-bearing `medusa-config.js` truthiness stays as-is.
- No `README.md` stylistic rewrite — correct the specific false claims only.
- No history rewrite of done specs (DOC5 is an addendum note, not a redo).
- The other two G9 clusters — separate specs (this cluster runs LAST, after they merge, so its re-baseline
  is accurate).

## 3. Chosen approach

Two code fixes (DOC2, DOC4), one code deletion (DOC1), the rest doc edits (DOC3, DOC5, DRIFT). Code fixes
are test-gated; deletion triggers a tsc re-baseline that feeds the doc edits; doc edits are self-verified
against grep/current code. Runs LAST in the epic so counts are final.

**Decisions (made now for batch approval — flag any you'd change):**
- **DOC1 (delete, don't just re-point):** delete `resolve-variant.ts` **and** `resolve-variant.test.ts` —
  dead in prod (hero uses `resolveLeafVariant`) and the source of 2 baseline tsc errors. This drops the
  storefront tsc baseline **14 → 12**; Task-final re-measures and updates every "14-baseline" reference.
- **DOC2 (atomic + always-201):** rewrite `subscribe()` as an idempotent upsert — `INSERT … ON CONFLICT
  (email) WHERE deleted_at IS NULL DO NOTHING` (or catch the unique-violation and treat as success),
  mirroring WB-070's `ON CONFLICT` pattern — and ensure `route.ts` returns 201 for both new and
  already-subscribed. No 500 on a concurrent dup.
- **DOC4 (align log to config):** drop the `.trim()` in `module-status.has()` so it mirrors
  `medusa-config.js`'s raw truthiness (a registered module never logs DISABLED); update
  `module-status.test.ts`. *(Chosen over trimming in `medusa-config.js` — that file is load-bearing and its
  truthiness is intentional; the honest fix is to make the LOG match what config actually does.)*
- **DOC3 (correct the promise):** rewrite the `.env.template` comment to state the real contract
  (`MEILISEARCH_HOST` + `MEILISEARCH_ADMIN_KEY` required; no master-key fallback exists) — or drop the
  master-key line entirely.
- **DOC5 (addendum, not rewrite):** append a dated "**Superseded by WB-072**" addendum to the done spec
  correcting the `hasFit:false` behavior (red "reference only" banner, no `defaults` object) — preserve the
  historical record, don't rewrite it.
- **DRIFT (targeted truth-fixes):** `STATUS.md` Tests block → the re-measured counts; `README.md` → correct
  the enumerated false claims (test counts, checkout live, tire grouping shipped, admin console shipped,
  reverse-fitment shipped, catalog size) without a stylistic rewrite; `storefront/CLAUDE.md` baseline-error
  list → the re-measured file list + count (post-DOC1).

## 4. Interfaces & isolation

- **DOC2** is the only non-trivial code change — the atomic upsert is a focused service-method rewrite +
  a route status guard; unit-tested (a dup subscribe returns 201, no throw).
- **DOC4** is a one-line semantics change + its test.
- **DOC1** is a deletion whose only ripple is the tsc baseline (re-measured, then documented).
- DOC3/DOC5/DRIFT are pure prose, each verified against a grep or the current code they describe.

## 5. Testing

- **Backend `test:sync`:** newsletter `subscribe()` is idempotent — a second subscribe for the same email
  returns success (201-equivalent), no throw (DOC2); `module-status.has()` treats a whitespace-only value
  the same as `medusa-config` would (DOC4, updated `module-status.test.ts`).
- **Storefront `tsc`:** after DOC1 deletion, `npx tsc --noEmit` yields the new baseline (expected 12); that
  exact number + file list is what `storefront/CLAUDE.md`/`STATUS.md` are updated to.
- **Doc edits:** `/doc-review` before the final commit; each DRIFT fix re-checked against current code/grep.

## 6. Deploy notes

- **No migration, no new env.** DOC2 uses the EXISTING newsletter partial unique index (WB-070/G4-era). DOC4
  changes only startup LOG output, not which modules load.
- Runs LAST so `STATUS.md`/`README.md`/`CLAUDE.md` counts are final and the G9 epic can be marked complete.

## 7. Risks & trade-offs

- **DOC2** must use the real conflict target (the `email` partial unique index `WHERE deleted_at IS NULL`);
  confirm the exact index name/predicate before writing the `ON CONFLICT`. A resubscribe after a soft-delete
  must still work (re-activate rather than silently no-op) — verify against the current soft-delete behavior.
- **DOC1 re-baseline** must be applied consistently — every "14" reference (`storefront/CLAUDE.md`,
  `STATUS.md`) updates to the re-measured number in the SAME task, or the docs re-drift immediately.
- **DOC4** flips a startup log line; the risk is only cosmetic-log, but `module-status.test.ts` asserts the
  old behavior — update it in lockstep.
- **README.md** is the stalest doc; scope discipline (correct false claims, don't rewrite prose) keeps this
  from ballooning into an open-ended rewrite.
