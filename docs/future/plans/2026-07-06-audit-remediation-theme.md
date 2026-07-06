# Audit remediation — honest state & silent-failure elimination (G9)

> **Umbrella theme doc** for the 2026-07-06 full code + business-logic audit of every done spec/plan.
> The raw findings live in four sibling logs (below). This doc names the theme, ranks what's known,
> and defines how findings become specs/plans. **Nothing here is implemented yet.**

## Provenance

- Multi-agent audit (workflow run `wf_7e98d308-058`, 2026-07-03 → 2026-07-06, resumed across 8 usage windows).
- **27 reviewers**: one spec-conformance reviewer per done plan/spec unit in `docs/done/` (24 units) + 6 cross-cutting business-logic domains (money-pricing, vendor-sync integrity, fitment, cart-checkout, discovery-meili, admin-ops-security).
- **116 raw findings → 76 unique** after dedup + backlog matching (0 were already-tracked WB items).
- Adversarial verification (3-lens panel per high: refute / business-impact / concrete-repro; single refute-skeptic per medium) ran for 12 findings before usage limits ended the run: **9 CONFIRMED (all unanimous), 0 refuted, 3 errored, 47 pending, 17 lows below the cap**.

## The theme

Every confirmed or plausible finding is an instance of one failure family: **the system silently diverges from reality and keeps reporting success.** Concretely, five recurring classes:

1. **Persisted state diverges from the vendor's truth** — phantom warehouse stock, invisible DRAFT products, zombie SKU rows, stale prices/images in Meilisearch. The sync says "completed"; the catalog lies.
2. **Failures are swallowed, not surfaced** — stock-pass errors invisible to retry, garage writes with bare `.catch(() => {})`, `placeOrder` discarding cart-completion errors after the card is authorized, non-503 fitment errors dying silently.
3. **UI over-claims what the data supports** — FITS badges from bolt-pattern-only checks, per-dimension (not per-variant) size-window verdicts, fabricated counts (shop-by-style tiles, "New This Week"), fake `.00` cents on the checkout total.
4. **Public surfaces without guards** — vehicle-catalog routes bypassing the wheel-size quota meter, `pp_system_default` Manual Payment selectable in production, no vendor-level concurrency guard on approve/replay, newsletter without rate limits.
5. **Docs describing a repo that no longer exists** — CLAUDE.md/README/STATUS/BACKLOG drift, violating the drift-guard spec's own contract.

The remediation principle, stated once and reused by every child spec: **every surface must tell the truth about the catalog, the money, and the fit — and every failure must be loud and recoverable.**

## Finding logs (the raw material)

| Doc | Findings | High | Confirmed |
|---|---|---|---|
| [audit-findings-vendor-sync.md](2026-07-06-audit-findings-vendor-sync.md) | 21 | 9 | 9 (all of them) |
| [audit-findings-fitment-garage.md](2026-07-06-audit-findings-fitment-garage.md) | 26 | 8 | 0 (3 panels errored) |
| [audit-findings-storefront.md](2026-07-06-audit-findings-storefront.md) | 24 | 5 | 0 |
| [audit-findings-ops-docs.md](2026-07-06-audit-findings-ops-docs.md) | 5 | 0 | 0 |

## What is already proven (9/9 confirmed, all HIGH, all vendor-sync lifecycle)

1. **Phantom stock** — changed-SKU path overwrites `normalized` before the stock pass; per-warehouse sellouts are never zeroed → oversell risk (`apply.ts:503`).
2. **Discontinued → reappear = permanent DRAFT** — adopted but never republished; silent catalog loss reported as success (`apply.ts:279`).
3. **Zombie null-variant rows** — `persistAdoptedGroup` writes current rows with `medusa_variant_id=null` and a matching hash; groups wedge on later runs (`apply.ts:886`).
4. **Re-listed removed variant keeps stale price** + `discontinued: true` metadata never cleared.
5. **Stock-pass errors invisible to finalize/retry** — run "completed" with the hash already advanced; no self-heal.
6. **Price/variant changes never emit `product.updated`** — Meilisearch keeps stale prices and facets indefinitely.
7. **Dry-run marks the feed "completed"** — both short-circuits then skip the next real sync (the documented preview procedure disables that day's sync).
8. **Approving a stale `awaiting_approval` run rolls the catalog back** to that run's old feed snapshot.
9. **No vendor-level concurrency guard on approve/replay** — two apply loops can mutate the same vendor's catalog concurrently.

## Highest-priority unverified (verify first, then fix)

- **Fitment truth**: cache key drops year (trim-slug variant of the confirmed-class bug); `customer_vehicle.hub_bore_mm` INTEGER truncation (authed garage corrupts bore the WB-007 fix saved); `fitsVehicle` per-dimension windows over-claim; PDP "confirmed models" bolt+bore-only; fit-mode never filters the offset axis; finish-switch desyncs the bolt-pattern chip.
- **Money/checkout**: `placeOrder` swallows completion errors after card auth; **Manual Payment (`pp_system_default`) selectable in production**; checkout total rounds then displays fake `.00`; PDP prices read the default region while add-to-cart uses the cart region.
- **Garage/auth**: logout→login shows the previous customer's garage (stale instance); `RoutingGarage.subscribe` pins listeners to the mount-time provider; concurrent create/activate races.

## How findings become work (the conversion contract)

1. **Do not implement from the logs.** Each cluster gets a design spec + plan (brainstorm → `superpowers:writing-plans`) in `docs/in-progress/`, referencing finding numbers from the logs.
2. **Suggested clusters** (one spec+plan each, roughly one session each):
   - `sync-lifecycle-integrity` — confirmed findings 1–9 (they share root causes: state written at the wrong phase, no republish path, no dry-run marker, no run-level lock).
   - `fitment-truth` — cache-key/TTL/verdict findings across backend + storefront.
   - `checkout-money-honesty` — placeOrder/Manual-Payment/rounding/region findings.
   - `garage-session-integrity` — provider lifecycle + merge/race findings.
   - `discovery-honest-signals` — facet counts, NEW chip, metadata fallbacks.
   - `docs-truth-sweep` — CLAUDE.md/README/STATUS/BACKLOG corrections (small, mechanical, do first).
3. **Verification debt**: 47 findings are single-reviewer claims. Finish verification either by resuming the workflow (`Workflow({scriptPath: <session>/workflows/scripts/done-specs-audit-wf_7e98d308-058.js, resumeFromRunId: "wf_7e98d308-058", args: <scratchpad>/audit-seed-args.json contents})` — all completed work replays from cache) or by spot-verifying each finding when its cluster's spec is written.
4. Backlog: tracked as **WB-069** (umbrella) until clusters get their own WB ids at spec time.
5. **Staleness caveat:** finder passes ran across 2026-07-04 → 07-06 snapshots of `main`, and the repo moved during the audit — G1 (WB-011..018/037: async triggers, streaming parse, stock-only cron, DB-backed cancel) and the tire-fitment arc (WB-063..068) merged mid-audit. The 9 CONFIRMED findings were verified on 2026-07-06 against post-G1 code and hold. PENDING findings may partially overlap or be fixed by that mid-audit work (e.g. anything about the cancel flag, sync triggers, or tire fitment) — re-check each against current `main` at spec time.

## Explicitly out of scope for this theme

Tire-store cutover (WB-005), pricing/markup rules (WB-024), and everything already tracked as an open WB item — the audit deduped against the backlog, so the logs contain only NEW problems.
