# Project Status — Wheel Builds

> **Last verified: 2026-06-21.** This is the source-of-truth dashboard. Keep it current after
> every session (see [CLAUDE.md → Documentation workflow](../CLAUDE.md)). Backlog: [future/BACKLOG.md](future/BACKLOG.md).

## Tests
- Backend (Jest): 237 passing (4 skipped)
- Storefront (Vitest): 42 passing

## Where each pillar stands

| Pillar | Maturity | State (one line) | Governing doc | Open backlog |
|---|---|---|---|---|
| Vendor import | working-with-gaps | Full fetch→stage→diff→apply; live SFTP wired; missing feed now fails loud (WB-041) unless `VENDOR_ALLOW_SAMPLE_FEED=true`; feed truncation now explicit opt-in (WB-027); ~248 wheels applied. Tires not grouped/indexed. | [done/plans/2026-05-18-vendor-sync-plan.md](done/plans/2026-05-18-vendor-sync-plan.md) · [reference/vendor-sync-implementation.md](reference/vendor-sync-implementation.md) | WB-005, WB-011..WB-018, WB-024..WB-026 |
| Fitment (wheel-size) | working-with-gaps | Live by_model lookups durably DB-cached + quota guard; reverse-fitment confirmed-models list live (WB-009 done); no TTL/expiry, no warm cron. | [done/plans/2026-05-30-wheel-size-fitment-garage.md](done/plans/2026-05-30-wheel-size-fitment-garage.md) | WB-007, WB-008, WB-019, WB-020 |
| Garage | working-with-gaps | Guest+authed garage, single-active index, merge. Authed mutations resolve by client_id (WB-002 done). | [done/plans/2026-06-01-plan-2-garage-hardening.md](done/plans/2026-06-01-plan-2-garage-hardening.md) | WB-022, WB-032 |
| Discovery (Meili) | production-ready | Faceted search, `?fit=` filter, FITS badges. Category facet dead; no result cache. | [done/specs/2026-05-28-fitment-ready-catalog-search-design.md](done/specs/2026-05-28-fitment-ready-catalog-search-design.md) | WB-021, WB-046 |
| Home | working-with-gaps | New/brands/style rails live on Meili; featured/gallery/newsletter fabricated. | [done/plans/2026-06-16-home-catalog-wiring.md](done/plans/2026-06-16-home-catalog-wiring.md) | WB-004, WB-023, WB-028 |
| PDP | working-with-gaps | Live price/stock, variant grid, vehicle band. Add-to-cart + Buy Now wired (WB-001 done); bolt-pattern row gates the grid (WB-003 done); reverse-fitment confirmed-models list live (WB-009 done). | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-029, WB-030 |
| Cart / Checkout | working-with-gaps | Boilerplate reskinned; direct-nav stall; express-pay/affirm chrome; gift-card stubbed. | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-033, WB-034, WB-035, WB-036 |
| Account / Order | working-with-gaps | No garage tab; dead "what's next" cards; leftover Medusa copy. | [done/plans/2026-05-23-storefront-phase2.md](done/plans/2026-05-23-storefront-phase2.md) | WB-032, WB-047 |
| Config / Infra | working-with-gaps | Conditional modules now log enabled/disabled at startup (WB-010); CORS fails loud in prod / localhost-default in dev (WB-039); committed per-app railway.json (WB-040). Resolved-config secret dump removed (WB-049). | [../CLAUDE.md](../CLAUDE.md) | — |

## Active work
- On branch `feat/deploy-config-hardening` (unmerged): **Session 1 — Deploy & config hardening** shipped — **WB-027** (devMaxRows explicit opt-in), **WB-039** (CORS fail-loud-in-prod), **WB-010** (startup module status report), **WB-040** (per-app railway.json). 3 new pure helpers in `backend/src/lib/` + 12 Jest cases; full backend suite 237 pass / 4 skipped.
- Earlier on `fix/vendor-sync-fail-loud-feed`: **WB-049** (secrets-to-stdout removed) and **WB-041** (fail-loud feed guard) shipped; 2026-06-20 verification re-confirmed **WB-001/002/003/009** genuinely done.
- **Deploy readiness:** of the four 2026-06-05 NO-GO blockers, WB-002 + WB-003 + **WB-049** are fixed and **WB-041** is closed; only **WB-016** (partial-apply marked completed → cron RunDate strands failed groups) remains.
- Next up: **WB-016** (bounded partial-apply retry) — needs its own spec: a correct retry requires apply-idempotency prerequisites (adopt-by-`external_id` for new groups, atomic changed-group writes) + an `apply_attempt` migration, else retrying duplicates/strands products. Feature alternative: **WB-004** (home Featured/Gallery). **WB-005** (tires) is XL + spec-gated; defer.

## Map
- Shipped: [done/](done/) · Drafts: [future/](future/) · Living refs: [reference/](reference/) · Backlog: [future/BACKLOG.md](future/BACKLOG.md)
