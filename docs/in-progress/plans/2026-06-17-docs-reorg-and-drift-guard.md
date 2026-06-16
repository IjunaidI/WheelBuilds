# Docs Reorg + Drift Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize all planning docs into a status-foldered `docs/` tree, correct the drift, add a live `STATUS.md` + agent-actionable `future/BACKLOG.md`, codify a keep-in-sync convention in `CLAUDE.md`, and ship a `/doc-review` drift skill.

**Architecture:** Pure docs + one project skill. Files move with `git mv` (history preserved). Stale-but-historical docs are corrected in place with a dated banner. Two new live dashboards (`STATUS.md`, `future/BACKLOG.md`) become the source of truth; a `/doc-review` skill checks docs against code.

**Tech Stack:** Markdown, git, ripgrep/grep, Bash (Git Bash on Windows), Claude Code skills (`.claude/skills/`).

**Spec:** [`docs/in-progress/specs/2026-06-17-docs-reorg-and-drift-guard-design.md`](../specs/2026-06-17-docs-reorg-and-drift-guard-design.md)

## Global Constraints

- **No code/behavior changes.** Nothing under `backend/src` or `storefront/src` behavior changes. Backlog items are *recorded*, not fixed.
- **Preserve history.** Every relocation uses `git mv`, never delete-and-recreate.
- **Correct-in-place + dated banner.** Each corrected historical doc gets, at the very top:
  `> _Corrected 2026-06-17 — see [docs/STATUS.md](...). Original was pre-rename / pre-cents-fix; preserved as historical record below._` (adjust the relative link per the doc's depth).
- **Stable IDs.** Backlog items use `WB-NNN`; never renumber or reuse.
- **New specs/plans path.** `docs/in-progress/specs|plans/` — the `docs/superpowers/` path is retired.
- **Branch, don't touch main.** All work on branch `docs/reorg-and-drift-guard`.
- **Commit trailer.** Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  (shown in Task 1; applied to every commit thereafter).
- **Windows shell.** Commands are POSIX sh (Git Bash tool). Use forward slashes.

---

### Task 1: Branch + scaffold the docs tree

**Files:**
- Create dir: `docs/done/plans/`, `docs/done/specs/`, `docs/in-progress/plans/`, `docs/in-progress/specs/`, `docs/future/plans/`, `docs/future/specs/`, `docs/reference/`
- Create: `docs/future/plans/.gitkeep`, `docs/future/specs/.gitkeep`, `docs/done/plans/.gitkeep`, `docs/done/specs/.gitkeep` (placeholders so empty dirs track; removed automatically as real files land)
- Already present (uncommitted): `docs/in-progress/specs/2026-06-17-docs-reorg-and-drift-guard-design.md`, `docs/in-progress/plans/2026-06-17-docs-reorg-and-drift-guard.md` (this file)

**Interfaces:**
- Produces: the directory skeleton every later task writes into.

- [ ] **Step 1: Create the branch off main**

```bash
git checkout -b docs/reorg-and-drift-guard
```

- [ ] **Step 2: Create the directory skeleton**

```bash
cd e:/medusajs-2.0-for-railway-boilerplate
mkdir -p docs/done/plans docs/done/specs docs/in-progress/plans docs/in-progress/specs docs/future/plans docs/future/specs docs/reference
touch docs/done/plans/.gitkeep docs/done/specs/.gitkeep docs/future/plans/.gitkeep docs/future/specs/.gitkeep
```

- [ ] **Step 3: Verify the skeleton and that the spec+plan are present**

Run: `find docs -type d | sort && ls docs/in-progress/specs docs/in-progress/plans`
Expected: the seven dirs listed; the spec and this plan present under `in-progress`.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs: scaffold status-foldered docs tree + reorg spec & plan

Adds docs/{done,in-progress,future}/{plans,specs}/ + docs/reference/.
Spec and implementation plan for the reorg land in in-progress/.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrate every doc with `git mv`

**Files (move):**
- `docs/superpowers/plans/*.md` (8 files) → `docs/done/plans/` (same names)
- `docs/superpowers/specs/*.md` (4 files) → `docs/done/specs/` (same names)
- `VENDOR_SYNC_PLAN.md` → `docs/done/plans/2026-05-18-vendor-sync-plan.md`
- `VENDOR_SYNC_OPEN_QUESTIONS.md` → `docs/done/specs/2026-05-18-vendor-sync-open-questions.md`
- `STOREFRONT_PHASE2_PLAN.md` → `docs/done/plans/2026-05-23-storefront-phase2.md`
- `VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md` → `docs/reference/vendor-sync-implementation.md`
- `docs/superpowers/Wheel-Builds-Sales-Pitch.pdf` + `docs/superpowers/wheel-builds-sales-pitch.html` (currently untracked) → `docs/reference/` and **track them in git** (they are living marketing reference).
- Remove now-empty `docs/superpowers/` and the `done/` `.gitkeep`s that are now redundant.

**Interfaces:**
- Produces: final resting paths for all docs (Task 3 fixes links to them).

- [ ] **Step 1: Move the superpowers plans + specs (sibling dirs preserve internal `../specs` links)**

```bash
cd e:/medusajs-2.0-for-railway-boilerplate
git mv docs/superpowers/plans/*.md docs/done/plans/
git mv docs/superpowers/specs/*.md docs/done/specs/
```

- [ ] **Step 2: Move + rename the four root docs**

```bash
git mv VENDOR_SYNC_PLAN.md            docs/done/plans/2026-05-18-vendor-sync-plan.md
git mv VENDOR_SYNC_OPEN_QUESTIONS.md  docs/done/specs/2026-05-18-vendor-sync-open-questions.md
git mv STOREFRONT_PHASE2_PLAN.md      docs/done/plans/2026-05-23-storefront-phase2.md
git mv VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md docs/reference/vendor-sync-implementation.md
```

- [ ] **Step 3: Relocate the (untracked) sales-pitch material into reference/ and remove the empty superpowers tree**

```bash
git mv docs/superpowers/Wheel-Builds-Sales-Pitch.pdf docs/reference/ 2>/dev/null || mv docs/superpowers/Wheel-Builds-Sales-Pitch.pdf docs/reference/
git mv docs/superpowers/wheel-builds-sales-pitch.html docs/reference/ 2>/dev/null || mv docs/superpowers/wheel-builds-sales-pitch.html docs/reference/
git add docs/reference/Wheel-Builds-Sales-Pitch.pdf docs/reference/wheel-builds-sales-pitch.html
rmdir docs/superpowers/plans docs/superpowers/specs docs/superpowers 2>/dev/null
rm -f docs/done/plans/.gitkeep docs/done/specs/.gitkeep
```
(The sales-pitch files are untracked, so `git mv` may fail; the `|| mv` fallback then `git add` tracks them. After this, `docs/superpowers/` must be empty and removable.)

- [ ] **Step 4: Verify moves preserved history and the old tree is gone**

Run:
```bash
test ! -d docs/superpowers && echo "superpowers removed"
git status --porcelain | grep -E '^R' | wc -l        # expect 16 renames
git log --follow --oneline -1 -- docs/done/plans/2026-05-18-vendor-sync-plan.md
ls docs/done/plans docs/done/specs docs/reference
```
Expected: "superpowers removed"; 16 rename entries; the follow-log shows the original `VENDOR_SYNC_PLAN.md` history; the three target dirs list the moved files.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: relocate all plans/specs into status folders (git mv, history preserved)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix every inbound link and stale path

Links are now broken at these exact locations (from the pre-move grep). Fix each, then prove none remain.

**Files (modify):**
- `CLAUDE.md:31`, `CLAUDE.md:73`, `README.md:213` — links to the impl summary
- `docs/reference/vendor-sync-implementation.md:3,195,196` — links to plan + open-questions
- `docs/done/plans/2026-05-23-storefront-phase2.md` — read-order table + footer (depth +3)
- `docs/done/specs/2026-05-28-fitment-ready-catalog-search-design.md:5` — `STOREFRONT_PHASE2_PLAN.md` link
- `docs/done/specs/2026-05-30-wheel-size-fitment-garage-design.md:5` — `STOREFRONT_PHASE2_PLAN.md` link
- `docs/done/plans/2026-05-30-wheel-size-fitment-garage.md:95,164,172,1997` — `docs/superpowers/specs/...` paths
- `docs/done/plans/2026-06-16-home-catalog-wiring.md:11` — `docs/superpowers/specs/...` path
- `docs/done/plans/2026-05-28-fitment-ready-catalog-search.md:11` — `../specs/...` (verify still valid; no change expected)

**Interfaces:**
- Consumes: final paths from Task 2.

- [ ] **Step 1: Fix the stays-put files (root → reference/)**

In `CLAUDE.md` (both line 31 and the line-73 long bullet) and `README.md:213`, replace every
`[`VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md`](VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md)`
with
`[`vendor-sync-implementation`](docs/reference/vendor-sync-implementation.md)`.

- [ ] **Step 2: Fix the moved impl-summary's own cross-refs (now in `docs/reference/`)**

In `docs/reference/vendor-sync-implementation.md` lines 3, 195, 196, replace:
- `[`VENDOR_SYNC_PLAN.md`](VENDOR_SYNC_PLAN.md)` → `[`vendor-sync-plan`](../done/plans/2026-05-18-vendor-sync-plan.md)`
- `[`VENDOR_SYNC_OPEN_QUESTIONS.md`](VENDOR_SYNC_OPEN_QUESTIONS.md)` → `[`vendor-sync open-questions`](../done/specs/2026-05-18-vendor-sync-open-questions.md)`

- [ ] **Step 3: Fix the storefront-phase2 read-order table (depth root → `docs/done/plans/`, +3 levels)**

In `docs/done/plans/2026-05-23-storefront-phase2.md`:
- Root-file links gain `../../../`: `(CLAUDE.md)`→`(../../../CLAUDE.md)`, `(storefront/CLAUDE.md)`→`(../../../storefront/CLAUDE.md)`, `(storefront/DESIGN.md)`→`(../../../storefront/DESIGN.md)`.
- Source-file links gain `../../../`: e.g. `(backend/src/modules/vendor-sync/search/build-search-document.ts)` → `(../../../backend/src/modules/vendor-sync/search/build-search-document.ts)` (and every other `backend/...` / `storefront/...` link in the table).
- Impl summary: `(VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md)` → `(../../reference/vendor-sync-implementation.md)`.
- Spec1 design (now sibling `done/specs`): `(docs/superpowers/specs/2026-05-28-fitment-ready-catalog-search-design.md)` → `(../specs/2026-05-28-fitment-ready-catalog-search-design.md)`.
- Spec1 plan (same dir): `(docs/superpowers/plans/2026-05-28-fitment-ready-catalog-search.md)` → `(2026-05-28-fitment-ready-catalog-search.md)`.
- Footer line 139 `[spec](docs/superpowers/specs/...)` / `[plan](docs/superpowers/plans/...)` → `[spec](../specs/2026-05-28-fitment-ready-catalog-search-design.md)` / `[plan](2026-05-28-fitment-ready-catalog-search.md)`.

- [ ] **Step 4: Fix the two design specs' plan-reference links**

In `docs/done/specs/2026-05-28-fitment-ready-catalog-search-design.md:5` and
`docs/done/specs/2026-05-30-wheel-size-fitment-garage-design.md:5`, replace
`(../../../STOREFRONT_PHASE2_PLAN.md)` → `(../plans/2026-05-23-storefront-phase2.md)`.

- [ ] **Step 5: Fix root-relative `docs/superpowers/...` strings inside moved plans**

In `docs/done/plans/2026-05-30-wheel-size-fitment-garage.md` (lines ~95, 164, 172, 1997) and
`docs/done/plans/2026-06-16-home-catalog-wiring.md:11`, replace every literal
`docs/superpowers/specs/` → `docs/done/specs/` and `docs/superpowers/plans/` → `docs/done/plans/`.
(These are path strings / git-add commands in archived plans — update so no stale path remains.)

- [ ] **Step 6: Prove no stale references survive**

Run:
```bash
grep -rn "docs/superpowers/" docs/ CLAUDE.md README.md ; echo "exit:$?"
grep -rnE "\]\((\.\./)*VENDOR_SYNC_[A-Z_]+\.md\)|\]\((\.\./)*STOREFRONT_PHASE2_PLAN\.md\)" docs/ CLAUDE.md README.md ; echo "exit:$?"
```
Expected: both greps print nothing and `exit:1` (no matches). Any hit is a missed link — fix it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: repoint all inbound links to the new doc paths

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Apply drift corrections + dated banners

**Files (modify):**
- `docs/done/specs/2026-05-18-vendor-sync-open-questions.md`
- `docs/done/plans/2026-05-18-vendor-sync-plan.md`
- `docs/done/plans/2026-06-01-master-fitment-store-roadmap.md`
- `docs/done/plans/2026-06-16-home-catalog-wiring.md`
- `docs/reference/vendor-sync-implementation.md`
- `docs/done/plans/2026-05-23-storefront-phase2.md`

**Interfaces:** none (content edits).

- [ ] **Step 1: Banner each corrected doc**

At the very top of each file in the list above, immediately after the H1, insert:
```markdown
> _Corrected 2026-06-17 — see [docs/STATUS.md](<relative-path-to>/STATUS.md). Original was pre-rename / pre-cents-fix; preserved as historical record below._
```
Relative paths: from `docs/done/plans|specs/` use `../../STATUS.md`; from `docs/reference/` use `../STATUS.md`.

- [ ] **Step 2: open-questions — teraflex → wheelpros**

In `docs/done/specs/2026-05-18-vendor-sync-open-questions.md`, replace (case-sensitive, all occurrences):
- `VENDOR_TERAFLEX_FEED_PATH` → `VENDOR_WHEELPROS_WHEEL_FEED_PATH`
- `VENDOR_TERAFLEX_WHEELS_ENABLED` → `VENDOR_WHEELPROS_WHEELS_ENABLED`
- `VENDOR_TERAFLEX_TIRES_ENABLED` → `VENDOR_WHEELPROS_TIRES_ENABLED`
- `teraflex-tires` → `wheelpros-tires`, `teraflex-wheels` → `wheelpros-wheels`
- `vendor-sync:dry-run teraflex` → `vendor-sync:dry-run wheelpros-wheels`
- any remaining standalone `teraflex` (e.g. "TeraflexAdapter") → `wheelpros` / `WheelProsAdapter`

- [ ] **Step 3: vendor-sync-plan — cents math, env var names, bullmq**

In `docs/done/plans/2026-05-18-vendor-sync-plan.md`:
- §5.1 (~line 413): `amount: msrpUsd * 100` → `amount: msrpUsd  // dollars in Medusa (cents only in the Meili index)`
- Risk R2 (~line 653): `Currently using Math.round(msrpUsd * 100)` → `Stores dollars on the Medusa variant; the Meili transformer converts to integer cents.`
- §9 (~lines 547, 549): `VENDOR_WHEELPROS_WHEELS_FEED_PATH` → `VENDOR_WHEELPROS_WHEEL_FEED_PATH`, `VENDOR_WHEELPROS_TIRES_FEED_PATH` → `VENDOR_WHEELPROS_TIRE_FEED_PATH`
- R3 / §15.7 (~lines 654, 708): mark the bullmq-removal task `~~done~~ (no longer a direct dependency)`.

- [ ] **Step 4: roadmap + home-catalog status notes**

- `docs/done/plans/2026-06-01-master-fitment-store-roadmap.md:21`: change the "Remaining … run `vendor-sync:apply` once" line to: `**Done (2026-06-16):** apply ran end-to-end (~248 wheels live); the apply-container bug is fixed (edfd89a). See docs/STATUS.md.`
- `docs/done/plans/2026-06-16-home-catalog-wiring.md:804`: change the apply-container "tracked separately" note to: `Fixed in edfd89a (resolve-apply-container.ts); cron + admin-approve now apply.`

- [ ] **Step 5: stale test counts in moved docs**

In `docs/reference/vendor-sync-implementation.md` and `docs/done/plans/2026-05-23-storefront-phase2.md`, replace the stale test-count claims with a pointer rather than a hard number: `(test counts: see docs/STATUS.md)`. (Exact live numbers are written into STATUS.md in Task 5 after running the suites.)

- [ ] **Step 6: Prove the banned tokens are gone**

Run:
```bash
grep -rniE "teraflex|msrpUsd \* 100|VENDOR_WHEELPROS_(WHEELS|TIRES)_FEED_PATH" docs/ ; echo "exit:$?"
```
Expected: no matches (`exit:1`), OR matches only inside a "Corrected … historical" annotated block. Inspect any hit.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: correct drift in archived docs (wheelpros rename, dollars-not-cents, env var names) + dated banners

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Write `docs/STATUS.md` (the live dashboard)

**Files:**
- Create: `docs/STATUS.md`

**Interfaces:**
- Produces: `STATUS.md` — referenced by every banner, `README.md`, `CLAUDE.md`, and the skill.

- [ ] **Step 1: Get the real test counts**

```bash
cd e:/medusajs-2.0-for-railway-boilerplate/backend && npx jest 2>&1 | tail -5
cd e:/medusajs-2.0-for-railway-boilerplate/storefront && npx vitest run 2>&1 | tail -5
```
Record the "Tests: N passed" lines for both. (If a runner is misconfigured locally, note the count as "unverified" rather than guessing.)

- [ ] **Step 2: Write `docs/STATUS.md`**

Create `docs/STATUS.md` with this exact skeleton, filling the test counts from Step 1 and the pillar rows from the spec's audit:

```markdown
# Project Status — Wheel Builds

> **Last verified: 2026-06-17.** This is the source-of-truth dashboard. Keep it current after
> every session (see [CLAUDE.md → Documentation workflow](../CLAUDE.md)). Backlog: [future/BACKLOG.md](future/BACKLOG.md).

## Tests
- Backend (Jest): <N> passing
- Storefront (Vitest): <N> passing

## Where each pillar stands

| Pillar | Maturity | State (one line) | Governing doc | Open backlog |
|---|---|---|---|---|
| Vendor import | working-with-gaps | Full fetch→stage→diff→apply; live SFTP wired (falls back to sample CSV); ~248 wheels applied. Tires not grouped/indexed. | [done/plans/2026-05-18-vendor-sync-plan.md](done/plans/2026-05-18-vendor-sync-plan.md) · [reference/vendor-sync-implementation.md](reference/vendor-sync-implementation.md) | WB-005, WB-011..WB-018, WB-024..WB-027, WB-041 |
| Fitment (wheel-size) | working-with-gaps | Live by_model lookups durably DB-cached + quota guard; no TTL/expiry, no warm cron. | [done/plans/2026-05-30-wheel-size-fitment-garage.md](done/plans/2026-05-30-wheel-size-fitment-garage.md) | WB-007, WB-008, WB-019, WB-020 |
| Garage | working-with-gaps · 1 blocker | Guest+authed garage, single-active index, merge. Authed mutations 404 (PK vs client_id). | [done/plans/2026-06-01-plan-2-garage-hardening.md](done/plans/2026-06-01-plan-2-garage-hardening.md) | WB-002, WB-022, WB-032 |
| Discovery (Meili) | production-ready | Faceted search, `?fit=` filter, FITS badges. Category facet dead; no result cache. | [done/specs/2026-05-28-fitment-ready-catalog-search-design.md](done/specs/2026-05-28-fitment-ready-catalog-search-design.md) | WB-021, WB-046 |
| Home | working-with-gaps | New/brands/style rails live on Meili; featured/gallery/newsletter fabricated. | [done/plans/2026-06-16-home-catalog-wiring.md](done/plans/2026-06-16-home-catalog-wiring.md) | WB-004, WB-023, WB-028 |
| PDP | working-with-gaps · 1 blocker | Live price/stock, variant grid, vehicle band. Add-to-cart is toast-only; grid collapses bolt patterns; fitment=[]. | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-001, WB-003, WB-009, WB-029, WB-030 |
| Cart / Checkout | working-with-gaps | Boilerplate reskinned; direct-nav stall; express-pay/affirm chrome; gift-card stubbed. | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-033, WB-034, WB-035, WB-036 |
| Account / Order | working-with-gaps | No garage tab; dead "what's next" cards; leftover Medusa copy. | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-032, WB-047 |
| Config / Infra | working-with-gaps | Conditional modules; silent-off when env unset; no committed deploy config. | [../CLAUDE.md](../CLAUDE.md) | WB-010, WB-039, WB-040 |

## Active work
- In progress: [in-progress/](in-progress/) — docs reorg + drift guard (this effort).

## Map
- Shipped: [done/](done/) · Drafts: [future/](future/) · Living refs: [reference/](reference/) · Backlog: [future/BACKLOG.md](future/BACKLOG.md)
```

- [ ] **Step 3: Verify all STATUS links resolve**

Run (resolves each relative link against `docs/` and reports any that don't exist):
```bash
cd e:/medusajs-2.0-for-railway-boilerplate
grep -oE '\]\(([^)]+)\)' docs/STATUS.md | sed -E 's/^\]\(//; s/\)$//' | grep -v '^https\?://' | while read -r p; do
  [ -e "docs/$p" ] && echo "ok   $p" || echo "MISSING $p"
done
```
Expected: every line `ok`; no `MISSING`. (Links use `../CLAUDE.md` etc. relative to `docs/`, so resolving against `docs/` is correct.)

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: add STATUS.md live dashboard (pillar table + test counts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Write `docs/future/BACKLOG.md`

**Files:**
- Create: `docs/future/BACKLOG.md`

**Interfaces:**
- Consumes: the seed inventory in the spec (WB-001..WB-047).
- Produces: the canonical backlog every future plan pulls from.

- [ ] **Step 1: Write the header + template contract**

Create `docs/future/BACKLOG.md` starting with:
```markdown
# Backlog — Wheel Builds

> Source of truth for remaining work. Severity-grouped. Every item has a stable `WB-NNN` id —
> plans and commits reference items by id. Derived from the verified 2026-06-17 audit.
> Keep `status` current (see [../../CLAUDE.md](../../CLAUDE.md) → Documentation workflow).

**Item template**
```
### WB-NNN · <title>   [SEVERITY]
- status: todo            # todo | in-progress | done | wont-fix
- area: <subsystem>
- evidence: <file:line>
- problem: <what's wrong>
- fix: <intended change>
- verify: <a concrete, checkable condition>
- refs: <links to in-progress/future spec+plan, or —>
```
```

- [ ] **Step 2: Materialize every item**

For each WB-id in the spec's seed inventory (WB-001 through WB-047, grouped Blockers → High →
Move-to-queue → De-hardcode → Medium → Deferred → Low), write a full block using the template.
Copy `evidence` verbatim from the spec. Author `problem` / `fix` / `verify` from the spec text.
Set `status: todo` for all, `area:` from the subsystem, `refs: —`. For merged ids (WB-038 →
WB-016) write a one-line stub: `### WB-038 · … — merged into WB-016. See WB-016.`

Example (WB-001 and WB-002 must be present exactly as):
```markdown
### WB-001 · PDP cannot transact (Add to Cart is toast-only)   [BLOCKER]
- status: todo
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/components/hero/purchase-panel.tsx:43-68
- problem: handleAddToCart/BuyNow/Save only fire a sonner toast; no line item is created; Buy now routes to /checkout with an empty cart.
- fix: call lib/data/cart.ts addToCart with the resolved variant id; remove the toast-only path.
- verify: adding to cart from a PDP persists a cart line item; grep shows a real addToCart call, no toast-only branch.
- refs: —

### WB-002 · Authed garage update/delete/activate all 404 (PK vs client_id)   [BLOCKER]
- status: todo
- area: backend/customer-vehicle + storefront/garage
- evidence: backend/src/api/store/customer/vehicles/[id]/route.ts:5,11,23 ; storefront/src/lib/garage/medusa-garage.ts:15,58,67,76
- problem: backend [id] routes resolve by Medusa PK, but the storefront sends client_id as [id]; list/create mask it.
- fix: resolve the [id] routes by client_id (+customer_id), or have the storefront track and send the server PK; align activate().
- verify: a logged-in user can rename/delete/activate a vehicle and the change survives reload.
- refs: —
```

- [ ] **Step 3: Verify every backlog item is well-formed**

Run:
```bash
cd e:/medusajs-2.0-for-railway-boilerplate
grep -cE "^### WB-[0-9]{3} " docs/future/BACKLOG.md       # expect ~47
for k in status area evidence fix verify; do echo "$k: $(grep -c "^- $k:" docs/future/BACKLOG.md)"; done
grep -E "^### WB-(001|002) " docs/future/BACKLOG.md       # both blockers present
```
Expected: ~47 item headers; the field counts roughly match the item count; both blockers present.

- [ ] **Step 4: Commit**

```bash
git add docs/future/BACKLOG.md
git commit -m "docs: add authoritative future/BACKLOG.md (WB-001..WB-047, agent-actionable)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Write `docs/README.md` (navigation)

**Files:**
- Create: `docs/README.md`

- [ ] **Step 1: Write the navigation doc**

Create `docs/README.md`:
```markdown
# docs/ — how this folder works

Planning lives here. Code-adjacent docs (root `CLAUDE.md`/`README.md`, `storefront/*`,
`backend/**/README.md`) stay next to the code.

## Layout
- **[STATUS.md](STATUS.md)** — start here. Where every pillar stands. Source of truth.
- **[future/BACKLOG.md](future/BACKLOG.md)** — remaining work, `WB-NNN` ids, severity-grouped.
- **done/** — shipped specs (`done/specs/`) + plans (`done/plans/`). Historical; corrected-in-place with a dated banner where they would mislead.
- **in-progress/** — the spec + plan for work currently underway.
- **future/** — drafted-but-not-started specs/plans (besides the backlog).
- **reference/** — living, non-dated architecture refs (kept current).

## Lifecycle
1. Brainstorm → spec in `in-progress/specs/YYYY-MM-DD-<topic>-design.md`.
2. Plan → `in-progress/plans/YYYY-MM-DD-<topic>.md`.
3. Implement, referencing `WB-NNN` ids from the backlog.
4. On merge: move the spec+plan `in-progress → done`, flip the backlog items to `done`, bump STATUS "Last verified".
5. Run `/doc-review` before committing doc-affecting work.

New specs/plans go under `in-progress/` — the old `docs/superpowers/` path is retired.
```

- [ ] **Step 2: Verify links resolve**

Run: `cd e:/medusajs-2.0-for-railway-boilerplate && for p in STATUS.md future/BACKLOG.md done in-progress future reference; do [ -e "docs/$p" ] && echo "ok $p" || echo "MISSING $p"; done`
Expected: all `ok`.

- [ ] **Step 3: Commit**

```bash
git add docs/README.md
git commit -m "docs: add docs/README.md navigation + lifecycle guide

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: CLAUDE.md convention + in-place README / module-README fixes

**Files (modify):**
- `CLAUDE.md` (add a section)
- `README.md` (test counts + apply checkbox)
- `backend/src/modules/vendor-sync/README.md` (applyConcurrency note)

- [ ] **Step 1: Add the Documentation-workflow section to root `CLAUDE.md`**

Append this section to `CLAUDE.md` (after the Gotchas section):
```markdown
## Documentation workflow

Planning docs live under `docs/{done,in-progress,future}/{plans,specs}/`. [`docs/STATUS.md`](docs/STATUS.md)
is the source-of-truth dashboard; [`docs/future/BACKLOG.md`](docs/future/BACKLOG.md) is the backlog
(`WB-NNN` ids). [`docs/README.md`](docs/README.md) explains the layout.

**After any development or session:**
1. Flip the touched `WB-NNN` backlog item's `status` (and to `done` when verified).
2. Update `docs/STATUS.md`'s "Last verified" date and any pillar row you changed.
3. Move a completed spec/plan from `docs/in-progress/` → `docs/done/` when the work merges.
4. Run `/doc-review` before committing doc-affecting changes.

New specs/plans start in `docs/in-progress/specs|plans/` — **not** the retired `docs/superpowers/` path.
```

- [ ] **Step 2: Fix `README.md` in place**

- Update the stale test-count claim (README.md ~line 42 and ~135, "178 backend + 25 storefront") to the live counts from Task 5 Step 1.
- README.md ~line 116: change `- [ ] First catalog-writing apply against production (not yet run end-to-end)` to `- [x] First catalog-writing apply ran end-to-end (2026-06-16, ~248 wheels)`.

- [ ] **Step 3: Fix the vendor-sync module README**

In `backend/src/modules/vendor-sync/README.md:114`, change the `VENDOR_SYNC_APPLY_CONCURRENCY`
description to: `Reserved / currently unread — apply is sequential (decision A4). Setting this has no effect today.`

- [ ] **Step 4: Verify**

Run: `grep -n "Documentation workflow" CLAUDE.md && grep -n "ran end-to-end" README.md && grep -n "currently unread" backend/src/modules/vendor-sync/README.md`
Expected: one hit each.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md backend/src/modules/vendor-sync/README.md
git commit -m "docs: add keep-in-sync convention to CLAUDE.md; fix README counts + module README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Build the `/doc-review` skill + smoke test

**Files:**
- Create: `.claude/skills/doc-review/SKILL.md`

**Interfaces:**
- Consumes: `docs/STATUS.md`, `docs/future/BACKLOG.md`, the banned-token list.

- [ ] **Step 1: Write the skill**

Create `.claude/skills/doc-review/SKILL.md` with this exact content:
```markdown
---
name: doc-review
description: Detect documentation drift after development. Checks docs/STATUS.md and docs/future/BACKLOG.md against the code — flags banned/stale tokens, BACKLOG items whose evidence file:line no longer matches their status, and touched code areas whose docs were not updated. Reports drift and proposes edits; never silently rewrites. Use after finishing a dev task and before committing doc-affecting changes.
---

# /doc-review — documentation drift guard

The docs under `docs/` are the source of truth (see `docs/STATUS.md`). This skill catches drift
between them and the code. Default = fast (deterministic). `/doc-review deep` adds verifier subagents.

## Fast mode (default)
Run from the repo root; collect everything into one report. Do NOT edit docs without asking.

### 1. Banned / stale token scan
These must not appear in committed docs except inside an explicit "Corrected … historical" note:
- `teraflex` (renamed to wheelpros)
- `msrpUsd * 100` (Medusa stores dollars; cents only in the Meili index)
- `VENDOR_WHEELPROS_WHEELS_FEED_PATH` / `VENDOR_WHEELPROS_TIRES_FEED_PATH` (wrong plural names)

Run: `grep -rniE "teraflex|msrpUsd \* 100|VENDOR_WHEELPROS_(WHEELS|TIRES)_FEED_PATH" docs/ CLAUDE.md README.md backend/src/modules/*/README.md`
Any hit outside an annotated historical block = DRIFT.

### 2. BACKLOG evidence freshness
Parse each `### WB-NNN` item in `docs/future/BACKLOG.md` (status + evidence file:line).
- `test -e` each evidence file path → missing path = DRIFT.
- status: done → the fix should be present (old pattern gone). Old pattern still there = DRIFT (incorrectly closed).
- status: todo → if the cited file/line no longer shows the problem, flag "candidate done" so it can be closed.

### 3. Diff-vs-docs
`git diff --name-only HEAD` (+ unstaged). For each touched path under `backend/src` or
`storefront/src`, check whether a BACKLOG `area` or a STATUS pillar row covers it and whether that
doc was updated in the same diff. Touched code + untouched related doc = flag "doc not updated".

### 4. STATUS sanity
- `docs/STATUS.md` has a "Last verified" date.
- Every path STATUS links to exists (`test -e`).
- If STATUS quotes test counts, optionally re-run (`cd backend && npx jest`; `cd storefront && npx vitest run`) and compare.

### Report
Emit:
```
## /doc-review (fast)
✅ in sync: <n> checks passed
⚠️ drift:
  - <file:line> — <what mismatched> — suggested edit: <…>
```
Then ASK whether to apply the suggested edits. Never edit without confirmation.

## Deep mode (`/doc-review deep`)
Run fast mode, then dispatch a verifier subagent per high-severity BACKLOG item touched by the
current diff (or a sample): each re-opens the cited code and confirms the item's status, the way
the 2026-06-17 audit verified findings. Fold verdicts into the report.
```

- [ ] **Step 2: Smoke test — confirm the banned-token check catches drift (fail case)**

```bash
cd e:/medusajs-2.0-for-railway-boilerplate
echo "teraflex placeholder" > docs/.drift-smoke.md
grep -rniE "teraflex|msrpUsd \* 100|VENDOR_WHEELPROS_(WHEELS|TIRES)_FEED_PATH" docs/ ; echo "exit:$?"
```
Expected: the scan reports `docs/.drift-smoke.md:1: teraflex placeholder` and `exit:0` (match found) — proving the check fires.

- [ ] **Step 3: Remove the smoke file and confirm clean (pass case)**

```bash
rm docs/.drift-smoke.md
grep -rniE "teraflex|msrpUsd \* 100|VENDOR_WHEELPROS_(WHEELS|TIRES)_FEED_PATH" docs/ ; echo "exit:$?"
```
Expected: no matches, `exit:1` (clean).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/doc-review/SKILL.md
git commit -m "feat(skill): add /doc-review drift guard (fast + deep modes)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Final acceptance verification

**Files:** none (verification only).

- [ ] **Step 1: Walk the 8 acceptance criteria**

Run each and confirm:
```bash
cd e:/medusajs-2.0-for-railway-boilerplate
# 1 structure + superpowers gone
find docs -type d | sort ; test ! -d docs/superpowers && echo "AC1 ok"
# 2/3 no stale links/tokens
grep -rn "docs/superpowers/" docs/ CLAUDE.md README.md ; echo "AC2 grep exit:$?"
grep -rniE "teraflex|msrpUsd \* 100|VENDOR_WHEELPROS_(WHEELS|TIRES)_FEED_PATH" docs/ ; echo "AC3 grep exit:$?"
# 4 STATUS exists with date
grep -n "Last verified" docs/STATUS.md && echo "AC4 ok"
# 5 BACKLOG well-formed + blockers
grep -cE "^### WB-[0-9]{3} " docs/future/BACKLOG.md ; grep -E "^### WB-(001|002) " docs/future/BACKLOG.md && echo "AC5 ok"
# 6 CLAUDE.md convention
grep -n "Documentation workflow" CLAUDE.md && echo "AC6 ok"
# 7 skill exists
test -f .claude/skills/doc-review/SKILL.md && echo "AC7 ok"
```
Expected: AC1 ok; AC2/AC3 greps exit 1 (no matches); AC4/AC5/AC6/AC7 ok.

- [ ] **Step 2: Confirm git history preserved for a renamed doc**

Run: `git log --follow --oneline -- docs/done/plans/2026-05-18-vendor-sync-plan.md | tail -3`
Expected: commits predating the move are shown (history followed across the rename).

- [ ] **Step 3: Note the in-progress → done move (deferred to merge)**

The spec + this plan move `docs/in-progress/ → docs/done/` only when this branch merges — handled
by `superpowers:finishing-a-development-branch`. Do NOT move them mid-branch (they describe the
work currently in progress). Leave a note in the PR/merge checklist.

---

## Self-review (completed during planning)

- **Spec coverage:** structure (T1), migration (T2), link fixes (T3), drift corrections (T4),
  STATUS (T5), BACKLOG (T6), docs/README (T7), CLAUDE.md convention + in-place README fixes (T8),
  `/doc-review` skill (T9), acceptance (T10). All spec goals + acceptance criteria mapped.
- **Placeholders:** none — every step has concrete commands/content. `<N>` test counts are
  intentionally filled at execution time (Task 5 Step 1) because they must be real, not guessed.
- **Type/name consistency:** banned-token regex, WB-id scheme, banner text, and the new doc paths
  are identical across the spec, STATUS, BACKLOG, CLAUDE.md, and the skill.
