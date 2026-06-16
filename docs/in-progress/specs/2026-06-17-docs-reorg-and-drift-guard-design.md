# Design — Docs as a reliable, self-maintaining source of truth

> Status: in-progress · Author: 2026-06-17 · Supersedes the ad-hoc root-level doc layout.

## Problem

The project's planning docs have drifted from the code and are scattered across two
conventions (UPPER_SNAKE files at the repo root + a dated `docs/superpowers/{plans,specs}/`
tree). A 2026-06-17 multi-agent audit (10 subsystems, every high-stakes claim re-verified
against code) found concrete drift that would actively mislead a future agent:

- `VENDOR_SYNC_OPEN_QUESTIONS.md` is entirely pre-rename (`teraflex` / `VENDOR_TERAFLEX_*`);
  the live names are `wheelpros` / `VENDOR_WHEELPROS_*`.
- `VENDOR_SYNC_PLAN.md` still documents the **old** `amount: msrpUsd * 100` cents math
  (contradicts the settled dollars-in-Medusa convention — a reader would reintroduce the 100× bug),
  documents **plural** feed-path env vars (`..._WHEELS_FEED_PATH`) while the code reads **singular**
  (`..._WHEEL_FEED_PATH`), and prescribes a bullmq cleanup that is already done.
- Test counts are stale in 4 docs; the master roadmap's "remaining: run apply once" is done
  (~248 wheels applied 2026-06-16); the home-catalog plan calls an already-fixed bug open.

Because we intend to **rely on these docs completely for future plans and development**, drift
is not cosmetic — it is a correctness hazard. There is also no single place that says "where do
we stand" and no agent-actionable backlog: the only backlog today is the master roadmap's
"Plan 4+" list, which is missing the blockers the audit found (dead PDP Add-to-Cart, the authed
garage 404).

## Goals

1. One coherent docs tree, foldered by lifecycle status (done / in-progress / future), that an
   agent can navigate without tribal knowledge.
2. Correct the drift so nothing misleads or copy-pastes wrong — while preserving the historical
   record (corrections are annotated, not silently rewritten).
3. A live **STATUS.md** dashboard (where every pillar stands) and an authoritative,
   agent-actionable **future/BACKLOG.md** (severity-ranked, stable IDs, file:line evidence,
   explicit verify criteria).
4. A **keep-in-sync convention** in root `CLAUDE.md` so docs are updated after every session.
5. A **drift-review skill** (`/doc-review`) we run after development to catch drift early.

## Non-goals

- No code/behavior changes. This is a docs + one skill effort. (The audit's *findings* are
  captured as backlog items; fixing them is future work, not this spec.)
- No touching test fixtures/handles that still carry `teraflex` (those are code; logged as a
  backlog item, see WB-044).
- No automated Stop/commit hook in this pass — the sync rule is a CLAUDE.md convention the agent
  follows. A hook may be added later (open question O2).

## Target structure

```
docs/
  README.md                  # how this folder works (lifecycle + where new docs go)
  STATUS.md                  # LIVE dashboard: every pillar's state + links to everything
  done/
    plans/                   # shipped plans (historical; corrected where misleading)
    specs/                   # shipped specs + decision records + research findings
  in-progress/
    plans/                   # the active plan(s)
    specs/                   # the active spec(s)  <- this design lives here until merged
  future/
    BACKLOG.md               # authoritative, agent-actionable backlog (from the audit)
    plans/                   # drafted-but-not-started plans
    specs/                   # drafted-but-not-started specs
  reference/
    vendor-sync-implementation.md   # LIVING architecture ref (kept current, not dated)
```

**Stays put** (entry points / code-adjacent, kept current in place): root `CLAUDE.md`,
`README.md`, `RUN_LOCAL.md`, `storefront/{CLAUDE,DESIGN,README}.md`, every `backend/**/README.md`.

`reference/` holds living, non-dated, cross-cutting docs. `VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md`
goes here because root `CLAUDE.md` points at it "for the full picture" — it describes the *current*
shipped architecture, so it is maintained, not archived.

## Migration mapping

All moves use `git mv` (preserve history). All inbound links updated.

| Current | New path | Status |
|---|---|---|
| `docs/superpowers/plans/2026-05-28-fitment-ready-catalog-search.md` | `docs/done/plans/` (same name) | done |
| `docs/superpowers/plans/2026-05-30-wheel-size-fitment-garage.md` | `docs/done/plans/` | done |
| `docs/superpowers/plans/2026-06-01-master-fitment-store-roadmap.md` | `docs/done/plans/` | done |
| `docs/superpowers/plans/2026-06-01-plan-1-fitment-end-to-end.md` | `docs/done/plans/` | done |
| `docs/superpowers/plans/2026-06-01-plan-2-garage-hardening.md` | `docs/done/plans/` | done |
| `docs/superpowers/plans/2026-06-01-plan-3-live-vendor-sftp-feed.md` | `docs/done/plans/` | done |
| `docs/superpowers/plans/2026-06-04-plan-3-completion-and-validation.md` | `docs/done/plans/` | done |
| `docs/superpowers/plans/2026-06-16-home-catalog-wiring.md` | `docs/done/plans/` | done |
| `docs/superpowers/specs/2026-05-28-fitment-ready-catalog-search-design.md` | `docs/done/specs/` | done |
| `docs/superpowers/specs/2026-05-30-wheel-size-fitment-garage-design.md` | `docs/done/specs/` | done |
| `docs/superpowers/specs/2026-05-30-wheel-size-task1-findings.md` | `docs/done/specs/` | done |
| `docs/superpowers/specs/2026-06-16-home-catalog-wiring-design.md` | `docs/done/specs/` | done |
| `VENDOR_SYNC_PLAN.md` | `docs/done/plans/2026-05-18-vendor-sync-plan.md` | done |
| `VENDOR_SYNC_OPEN_QUESTIONS.md` | `docs/done/specs/2026-05-18-vendor-sync-open-questions.md` | done |
| `STOREFRONT_PHASE2_PLAN.md` | `docs/done/plans/2026-05-23-storefront-phase2.md` | done |
| `VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md` | `docs/reference/vendor-sync-implementation.md` | living |

After the move, `docs/superpowers/` is empty and is removed.

### Inbound links to fix
- Root `CLAUDE.md`: two links to `VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md` →
  `docs/reference/vendor-sync-implementation.md`.
- `docs/done/plans/2026-05-23-storefront-phase2.md`: its "Read in order" table links to the
  vendor-sync summary, the moved spec/plan paths, and the impl summary.
- `docs/done/plans/2026-05-18-vendor-sync-plan.md` ↔ open-questions cross-references (`OQ#`).
- `backend/src/modules/vendor-sync/README.md` if it links the summary.
- Any `docs/superpowers/...` path referenced from the moved docs themselves.

## Drift corrections (correct-in-place + dated note)

Each corrected file gets one banner line at the top:
`> _Corrected 2026-06-17 — see docs/STATUS.md. Original was pre-rename / pre-cents-fix; preserved as historical record below._`

| Doc | Fix |
|---|---|
| open-questions (moved) | `teraflex`→`wheelpros`; `VENDOR_TERAFLEX_*`→`VENDOR_WHEELPROS_*`; `dry-run teraflex`→`wheelpros-wheels`/`wheelpros-tires` |
| vendor-sync-plan (moved) | §5.1 & R2 `amount: msrpUsd * 100` → `amount: msrpUsd` (dollars-in-Medusa); §9 plural feed-path vars → singular `VENDOR_WHEELPROS_WHEEL_FEED_PATH` / `..._TIRE_FEED_PATH`; R3/§15.7 bullmq cleanup → "done / no longer applicable" |
| vendor-sync-implementation (moved) | stale test count → actual; confirm "apply has run end-to-end" |
| storefront-phase2 (moved) | stale test count; its deferred-backlog section points to `future/BACKLOG.md` for the live list |
| master-roadmap (moved) | status line "remaining: run apply once" → done (apply ran 2026-06-16, ~248 wheels); apply-container bug fixed (`edfd89a`) |
| home-catalog-wiring (moved) | closing note: apply-container bug "tracked separately" → fixed in `edfd89a` |
| `README.md` (in place) | test counts (194 backend / 31 storefront); tick `[ ] first catalog-writing apply` → done |
| `backend/src/modules/vendor-sync/README.md` (in place) | `VENDOR_SYNC_APPLY_CONCURRENCY` → "reserved / currently unread (apply is sequential)" |

Exact current test counts are re-confirmed during implementation (run `npx jest` in `backend/`,
`npx vitest run` in `storefront/`) rather than hard-coded from the audit, so STATUS/README ship correct.

## STATUS.md — the live dashboard

First doc any agent reads. Contains:
- A header with **Last verified: YYYY-MM-DD** and current branch position note.
- The **pillar table** (vendor-sync, fitment, garage, discovery, home, PDP, cart/checkout,
  account/order, config/infra): each row = one-line state + maturity (`production-ready` /
  `working-with-gaps` / `partial` / `stubbed`) + link to the governing done-doc + open BACKLOG IDs.
- **Test status** (backend / storefront, passing counts).
- **Navigation**: links to `future/BACKLOG.md`, `done/`, `in-progress/`, `reference/`.
- A short "how to keep this current" pointer to the CLAUDE.md convention.

## future/BACKLOG.md — agent-actionable annotation

Every item uses a fixed, greppable template so an agent can pick one up and verify it:

```markdown
### WB-001 · PDP cannot transact (Add to Cart is toast-only)   [BLOCKER]
- status: todo            # todo | in-progress | done | wont-fix
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/components/hero/purchase-panel.tsx:43-68
- problem: handleAddToCart/BuyNow/Save only fire a sonner toast; no line item is created.
- fix: call lib/data/cart.ts addToCart with the resolved variant id; remove the toast-only path.
- verify: adding to cart from the PDP persists a cart line item; no toast-only branch remains.
- refs: —          # links to in-progress/future spec+plan once scoped
```

Rules:
- **Stable IDs** `WB-NNN`, never reused. Plans, commits, and STATUS reference items by ID.
- Grouped: **Blockers → High → Medium → Low**, then a **Move-to-queue / de-hardcode** group,
  then **Deferred (Plan 4+)** folded from the master roadmap.
- `evidence` is always a `file:line` (or `file:line-range`) that a check can re-open.
- `verify` is a concrete, checkable condition (the drift-review skill uses it).

### Seed inventory (from the verified audit)

Materialized into the template above during implementation. Verifier-corrected items noted.

**Blockers**
- WB-001 PDP cannot transact (Add to Cart toast-only) — `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx:43-68`
- WB-002 Authed garage update/delete/activate 404 (PK vs client_id) — `backend/src/api/store/customer/vehicles/[id]/route.ts:5,11,23` vs `storefront/src/lib/garage/medusa-garage.ts:15,58,67,76`

**High**
- WB-003 PDP variant grid collapses bolt patterns — `storefront/src/modules/product-detail/data/get-product.ts:53-100`; `.../hero/index.tsx:45-47`
- WB-004 Home FEATURED BLOCKS + BUILD GALLERY fabricated content — `storefront/src/modules/home/components/featured-blocks/index.tsx:17-60`; `.../build-gallery/index.tsx:6-15`
- WB-005 Tires never grouped + never indexed in Meili — `backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts:56`; `.../pipeline/apply.ts:314-326`; `.../search/build-search-document.ts:36`
- WB-006 No admin UI for vendor-sync (API/CLI only) — `backend/src/admin/` (boilerplate)
- WB-007 `hub_bore_mm` INTEGER truncates fractional bore on cached reads — `backend/src/modules/wheel-size/migrations/Migration20260601111311.ts:13`
- WB-008 No fitment cache TTL + no warm/refresh cron — `backend/src/modules/wheel-size/service.ts:52-83`
- WB-009 `product.fitment = []` (reverse-fitment "N confirmed models") — `storefront/src/modules/product-detail/data/get-product.ts:159`
- WB-010 No startup warning for silently-disabled modules — `backend/medusa-config.js:114-275`

**Move-to-queue (synchronous-in-request / non-durable → background job)**
- WB-011 Manual trigger runs full sync in-request — `backend/src/api/admin/vendor-sync/runs/route.ts:63-69`
- WB-012 Approve-and-apply blocks the request (heaviest apply) — `.../runs/[id]/approve/route.ts:28`
- WB-013 Replay run / replay sku block the request — `.../runs/[id]/replay/route.ts:26`
- WB-014 Apply loop sequential; `applyConcurrency` is dead config — `backend/src/modules/vendor-sync/pipeline/apply.ts:148-201`
- WB-015 CSV read fully into memory + parsed before yielding — `backend/src/modules/vendor-sync/adapters/wheelpros-wheels/parse.ts:18-24`
- WB-016 Failed parts never auto-retried (cron RunDate then skips feed) — `backend/src/modules/vendor-sync/service.ts:354-362,219-242`
- WB-017 Feed archives → ephemeral disk; `archiveBucket` unused — `backend/src/modules/vendor-sync/utils/archive.ts:12-39`
- WB-018 Stock freshness bound to 12h run; no stock-only fast path — `backend/src/jobs/vendor-sync-tick.ts:33-36`
- WB-019 wheel-size lookup synchronous on first miss — `backend/src/modules/wheel-size/service.ts:64`
- WB-020 Quota counter non-atomic read-modify-write — `backend/src/modules/wheel-size/service.ts:38-46`
- WB-021 Discovery + home Meili queries uncached (no TTL/revalidate) — `storefront/src/modules/discovery/data/get-products.ts:137-202`; `.../home/data/get-home-catalog.ts:22`
- WB-022 Guest→login garage merge = N best-effort client POSTs — `storefront/src/lib/garage/index.ts:38-43`
- WB-023 Newsletter signup is a fake `setTimeout`, nothing persisted — `storefront/src/modules/home/components/newsletter/index.tsx:14-26`

**De-hardcode (literal → config / DB / admin / feed)**
- WB-024 Pricing MSRP-only, USD-only, no markup/MAP/margin rule — `backend/src/modules/vendor-sync/pipeline/apply.ts:357,417,710`
- WB-025 Bootstrap identity literals (region/channel/categories/warehouse/brand) — `backend/src/modules/vendor-sync/pipeline/bootstrap.ts`
- WB-026 Vendor roster is a fixed 2-entry object — `backend/medusa-config.js:200-211`
- WB-027 `devMaxRows` truncation keyed off `NODE_ENV` (staging trap) — `backend/medusa-config.js:81-83`
- WB-028 Storefront merchandising/policy copy hardcoded (trust strips, hero "STEP 01 OF 02", shop-by-style map, `<title>` "40+ brands") — `storefront/src/modules/home/...`
- WB-029 PDP placeholders (qty default 4, construction/origin/warranty "—", low-stock ≤4, ship copy) — `storefront/src/modules/product-detail/data/get-product.ts`; `.../hero/purchase-panel.tsx`
- WB-030 `normalizeFinish` hand-synced twin across apps — `storefront/src/modules/product-detail/data/get-product.ts:29-36` + `backend/src/modules/vendor-sync/search/normalize-finish.ts`
- WB-031 Seeded shipping options + placeholder `replyTo info@example.com` — `backend/src/scripts/seed.ts:247,285`; `backend/src/subscribers/order-placed.ts:24`

**Medium (other remaining)**
- WB-032 Account has no Garage tab/route — `storefront/src/modules/account/components/account-nav/index.tsx:117-152`
- WB-033 Direct nav to `/checkout` stalls (no default `?step=`) — `storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx:43-68`
- WB-034 Cart qty capped at hardcoded 10, ignores live stock — `storefront/src/modules/cart/components/item/index.tsx:45-47`
- WB-035 Express Pay / Affirm are non-functional chrome — `storefront/src/modules/checkout/components/express-pay/index.tsx`; `.../checkout-summary/index.tsx:183-189`
- WB-036 Gift card / discount-remove stubbed or buggy — `storefront/src/lib/data/cart.ts:244-285`; `.../discount-code/index.tsx:26-33`
- WB-037 Cancel flag is per-process in-memory (worker-mode split) — `backend/src/modules/vendor-sync/service.ts:56,84-94`
- WB-038 Partial-apply marked `completed` → next cron RunDate short-circuit skips the feed forever — **merged into WB-016** (same root cause; kept as a cross-ref to demonstrate the merge convention)
- WB-039 CORS undefined if env unset (no safe default) — `backend/src/lib/constants.ts:33-43`
- WB-040 No committed deploy config (railway.json/Dockerfile/Procfile) — repo root
- WB-041 SFTP has no fail-loud guard → silently syncs sample CSV if env unset — `backend/src/modules/vendor-sync/feed-source/resolve-feed.ts`; `.../adapters/wheelpros-wheels/index.ts:19`

**Deferred (Plan 4+, from master roadmap — still valid)**
- WB-042 Durable feed archiving to object storage (same root cause as WB-017)
- WB-043 wheel-size live-slug verification (no test proves dropdown slugs resolve against live `by_model`)
- WB-044 Rename `teraflex` test fixtures/handles — `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts:5,44`; `__fixtures__/*.csv` (code task)
- WB-045 License-plate lookup is a disabled stub — `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx:353-365`
- WB-046 Category facet is dead in discovery (no backend source) — `storefront/src/modules/discovery/data/get-products.ts:117,184`

**Low (doc/cosmetic)**
- WB-047 Stale "Medusa Store" / "test order" copy — `storefront/src/modules/order/components/onboarding-cta/index.tsx:11-23`; `.../checkout/components/review/index.tsx:42-45`

> IDs are illustrative-but-stable: implementation may add items discovered while writing the
> backlog, continuing the `WB-NNN` sequence. Overlaps (e.g. WB-016/WB-038, WB-017/WB-042) are
> merged with a cross-reference rather than duplicated.

## CLAUDE.md — keep-in-sync convention

A new short "## Documentation workflow" section in root `CLAUDE.md`, rule-style:

- Planning docs live under `docs/{done,in-progress,future}/{plans,specs}/`. New work's spec+plan
  start in `docs/in-progress/`; move to `docs/done/` when the work merges.
- `docs/STATUS.md` is the dashboard and `docs/future/BACKLOG.md` is the backlog — both are the
  source of truth; keep them current.
- **After any development or session:** flip the touched `WB-NNN` item's `status` (and tick it when
  done), update `STATUS.md`'s "Last verified" line, and move any completed spec/plan
  `in-progress → done`.
- Run `/doc-review` before committing doc-affecting changes.
- New specs/plans go to `docs/in-progress/specs|plans/` — **not** the retired `docs/superpowers/` path.

## The `/doc-review` skill

Project skill at `.claude/skills/doc-review/SKILL.md`, invoked after development. Tiered:

- **Fast (default):** deterministic, no subagents.
  - Grep for banned/stale tokens that must never reappear: `teraflex`, `msrpUsd * 100`,
    plural feed-path vars (`VENDOR_WHEELPROS_WHEELS_FEED_PATH` / `..._TIRES_FEED_PATH`).
  - For each `done` BACKLOG item: confirm its `verify` condition / fix is present (flag if the
    item is marked done but the old code pattern is still there).
  - For each `todo` BACKLOG item: confirm its `evidence` `file:line` still exists (flag stale or
    silently-fixed items so they can be closed).
  - Cross-check the current `git diff` touched areas against BACKLOG `area` tags + STATUS rows;
    flag touched subsystems whose docs/items were not updated.
  - Verify cheap STATUS claims (e.g. that referenced files exist).
- **Deep (`/doc-review deep`):** spawns verifier subagents (the audit pattern) to re-confirm a
  sample of findings against code for higher confidence.
- **Output:** a drift report — `✅ in sync` or `⚠️ drifted` with `file:line` and the specific
  mismatch — plus *proposed* doc edits. It reports and proposes; it does not silently rewrite docs.
- Built via the `superpowers:writing-skills` skill during implementation.

## Acceptance criteria

1. `docs/` matches the target structure; `docs/superpowers/` no longer exists; no moved doc lost
   git history (moves done with `git mv`).
2. No broken intra-repo doc links (`CLAUDE.md`, moved docs' cross-refs, storefront-phase2 read-order).
3. `grep -rn "teraflex" docs/` and `grep -rn "msrpUsd \* 100" docs/` return only intentional,
   clearly-annotated historical mentions (or nothing); the plural feed-path var names appear nowhere.
4. `STATUS.md` exists with the pillar table + a real "Last verified" date + correct test counts.
5. `future/BACKLOG.md` exists; every item conforms to the template (ID, status, area, evidence, fix,
   verify); blockers WB-001/WB-002 are present.
6. Root `CLAUDE.md` has the Documentation-workflow section.
7. `.claude/skills/doc-review/SKILL.md` exists; `/doc-review` runs the fast checks and reports
   drift; it correctly flags a deliberately-introduced drift token in a smoke test.
8. This design doc moves `in-progress → done` when the work merges.

## Risks & mitigations

- **Broken links after moves.** Mitigate: after moving, grep the repo for old paths
  (`docs/superpowers/`, `VENDOR_SYNC_*.md`, `STOREFRONT_PHASE2_PLAN.md`) and fix every hit; the
  acceptance check #2/#3 gate this.
- **Correcting history hides what was actually planned.** Mitigate: corrections are annotated with
  the dated banner and the original text is preserved beneath where practical (chosen policy:
  correct-in-place + dated note).
- **Backlog goes stale the moment code changes.** Mitigate: that is exactly what `/doc-review` +
  the CLAUDE.md convention exist to catch.
- **Skill default spec path.** `superpowers:brainstorming`/`writing-plans` default to
  `docs/superpowers/specs|plans/`. Mitigate: the CLAUDE.md convention documents the new path; future
  specs are filed under `docs/in-progress/`.

## Open questions

- **O1.** Review-skill name: `/doc-review` (chosen) vs `/drift-check`.
- **O2.** Add an automated Stop/pre-commit hook to enforce the sync rule later, or keep it a
  convention only? (Deferred; convention-only for now.)

## Out of scope

Fixing any backlog item (the audit findings) — those are tracked in `future/BACKLOG.md` and become
their own spec→plan cycles. This effort delivers the structure, the corrected docs, the dashboards,
the convention, and the review skill — nothing in `backend/src` or `storefront/src` behavior.
