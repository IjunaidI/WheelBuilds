# Project Status — Wheel Builds

> **Last verified: 2026-06-21.** This is the source-of-truth dashboard. Keep it current after
> every session (see [CLAUDE.md → Documentation workflow](../CLAUDE.md)). Backlog: [future/BACKLOG.md](future/BACKLOG.md).

## Tests
- Backend (Jest): 253 passing (4 skipped)
- Storefront (Vitest): 42 passing

## Where each pillar stands

| Pillar | Maturity | State (one line) | Governing doc | Open backlog |
|---|---|---|---|---|
| Vendor import | working-with-gaps | Full fetch→stage→diff→apply; live SFTP wired; missing feed fails loud (WB-041); feed truncation explicit opt-in (WB-027); partial apply now retries safely + bounded (WB-016: partially_failed/exhausted + idempotent adopt); ~248 wheels applied. Tires not grouped/indexed. | [done/plans/2026-05-18-vendor-sync-plan.md](done/plans/2026-05-18-vendor-sync-plan.md) · [reference/vendor-sync-implementation.md](reference/vendor-sync-implementation.md) | WB-005, WB-011..WB-015, WB-017, WB-018, WB-024..WB-026 |
| Fitment (wheel-size) | working-with-gaps | Live by_model lookups durably DB-cached + quota guard; reverse-fitment confirmed-models list live (WB-009 done); no TTL/expiry, no warm cron. | [done/plans/2026-05-30-wheel-size-fitment-garage.md](done/plans/2026-05-30-wheel-size-fitment-garage.md) | WB-007, WB-008, WB-019, WB-020 |
| Garage | working-with-gaps | Guest+authed garage, single-active index, merge. Authed mutations resolve by client_id (WB-002 done). | [done/plans/2026-06-01-plan-2-garage-hardening.md](done/plans/2026-06-01-plan-2-garage-hardening.md) | WB-022, WB-032 |
| Discovery (Meili) | production-ready | Faceted search, `?fit=` filter, FITS badges. Category facet dead; no result cache. | [done/specs/2026-05-28-fitment-ready-catalog-search-design.md](done/specs/2026-05-28-fitment-ready-catalog-search-design.md) | WB-021, WB-046 |
| Home | working-with-gaps | New/brands/style rails live on Meili; featured/gallery/newsletter fabricated. | [done/plans/2026-06-16-home-catalog-wiring.md](done/plans/2026-06-16-home-catalog-wiring.md) | WB-004, WB-023, WB-028 |
| PDP | working-with-gaps | Live price/stock, variant grid, vehicle band. Add-to-cart + Buy Now wired (WB-001 done); bolt-pattern row gates the grid (WB-003 done); reverse-fitment confirmed-models list live (WB-009 done). | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-029, WB-030 |
| Cart / Checkout | working-with-gaps | Boilerplate reskinned; direct-nav stall; express-pay/affirm chrome; gift-card stubbed. | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-033, WB-034, WB-035, WB-036 |
| Account / Order | working-with-gaps | No garage tab; dead "what's next" cards; leftover Medusa copy. | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-032, WB-047 |
| Config / Infra | working-with-gaps | Conditional modules now log enabled/disabled at startup (WB-010); CORS fails loud in prod / localhost-default in dev (WB-039); committed per-app railway.json (WB-040). Resolved-config secret dump removed (WB-049). | [../CLAUDE.md](../CLAUDE.md) | — |

## Active work
- On branch `feat/vendor-sync-partial-apply-retry` (unmerged): **Session 2 — WB-016 bounded partial-apply retry** shipped — `partially_failed`/`exhausted` statuses, RunDate short-circuit honors them, `apply_attempt_count` + `applyMaxAttempts` bound, idempotent adopt-by-`external_id`/SKU, shared `finalizeApply`, migration. 4 new pure/seam helpers + 16 Jest cases; full backend suite 253 pass / 4 skipped.
- Merged to `main`: **Session 1 — Deploy & config hardening** — **WB-027** (devMaxRows opt-in), **WB-039** (CORS fail-loud-in-prod), **WB-010** (startup module status), **WB-040** (per-app railway.json). Earlier: **WB-049** (secrets-to-stdout removed), **WB-041** (fail-loud feed guard); **WB-001/002/003/009** verified done.
- **Deploy readiness:** all four 2026-06-05 NO-GO blockers now resolved (WB-002, WB-003, WB-049, WB-016) and WB-041 closed → **backend is deploy-ready** (live boot-against-DB smoke for WB-016's migration recommended post-merge).
- Next up (features): **WB-004** (home Featured/Gallery), **WB-005** (tires grouping+indexing, XL), or vendor-sync move-to-queue (WB-011..WB-013). Fitment hardening: WB-007/008/019/020.

## Map
- Shipped: [done/](done/) · Drafts: [future/](future/) · Living refs: [reference/](reference/) · Backlog: [future/BACKLOG.md](future/BACKLOG.md)
