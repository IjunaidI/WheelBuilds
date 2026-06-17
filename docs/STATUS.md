# Project Status — Wheel Builds

> **Last verified: 2026-06-17.** This is the source-of-truth dashboard. Keep it current after
> every session (see [CLAUDE.md → Documentation workflow](../CLAUDE.md)). Backlog: [future/BACKLOG.md](future/BACKLOG.md).

## Tests
- Backend (Jest): 201 passing (4 skipped)
- Storefront (Vitest): 31 passing

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
- None in progress. Docs reorg + drift guard shipped — see [done/plans/2026-06-17-docs-reorg-and-drift-guard.md](done/plans/2026-06-17-docs-reorg-and-drift-guard.md).
- Next up: **WB-001** (PDP add-to-cart / buy-now wiring) — see [future/BACKLOG.md](future/BACKLOG.md).

## Map
- Shipped: [done/](done/) · Drafts: [future/](future/) · Living refs: [reference/](reference/) · Backlog: [future/BACKLOG.md](future/BACKLOG.md)
