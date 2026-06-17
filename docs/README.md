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
