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

Run: `grep -rniE --exclude='*docs-reorg-and-drift-guard*' --exclude=STATUS.md --exclude=BACKLOG.md "teraflex|msrpUsd \* 100|VENDOR_WHEELPROS_(WHEELS|TIRES)_FEED_PATH" docs/ CLAUDE.md README.md backend/src/modules/*/README.md`
Drift-tracking docs legitimately QUOTE these tokens — the reorg spec/plan (`*docs-reorg-and-drift-guard*`),
`STATUS.md`, `BACKLOG.md`, and this `SKILL.md` itself — so they are excluded above (and `.claude/` is
out of the scan path). Any remaining hit outside an annotated historical block = DRIFT.

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
