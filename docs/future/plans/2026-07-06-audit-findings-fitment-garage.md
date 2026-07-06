# Audit findings — fitment, wheel-size cache, and garage

> **Raw finding log** from the 2026-07-06 done-specs audit (workflow run wf_7e98d308-058; 27 reviewers over all 24 done plan/spec units + 6 business-logic domains; 116 raw -> 76 unique findings). Findings against the wheel-size fitment service (cache keys, TTL semantics, quota), the fit-verdict surfaces (badges/filters/PDP), and the garage persistence flows.
>
> **These are logged findings, not yet plans.** Statuses: CONFIRMED = survived a 3-lens adversarial panel (refute / business-impact / concrete-repro); PENDING = single-reviewer claim awaiting verification. Convert to detailed specs/plans (superpowers:writing-plans) before implementation. Umbrella: [2026-07-06-audit-remediation-theme.md](2026-07-06-audit-remediation-theme.md).

**26 findings** — high: 7, medium: 15, low: 4

---

## 1. [HIGH] Fitment cache key drops year when a trim slug is present — cross-generation fitment served to the wrong model year

- **Status:** UNVERIFIED — verifier panel errored on a usage limit; re-verify before acting
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/wheel-size/service.ts:67` | **Found by:** spec:fitment-hardening
- **Evidence:** cache_key = [p.make, p.model, (p.modificationSlug ?? p.year ?? ""), region].join("|") — year is discarded whenever modificationSlug is set. The storefront ALWAYS sends both (storefront/src/lib/data/fitment.ts:68-74), so every cache row is keyed make|model|trim|region. Wheel-size trim slugs repeat across generations (e.g. '330i' exists for both the 5x120 F30 and the 5x112 G20 3-Series), and the by_model request itself is year-scoped — so the row cached for one year is returned verbatim (no API call) for a different year of the same trim.
- **Impact:** A shopper with a 2020 vehicle can be served the 2018 generation's bolt pattern / hub bore / size windows for up to ttlDays=90 — wrong 'fits your vehicle' filtering and PDP fit claims, i.e. wheels sold that do not bolt on. Refreshes reuse the same collided key, so wrong-year data is also what gets re-written.

## 2. [HIGH] customer_vehicle.hub_bore_mm is an INTEGER column — authed garages store a truncated hub bore, corrupting the PDP bore hard-gate

- **Status:** UNVERIFIED — verifier panel errored on a usage limit; re-verify before acting
- **Kind:** data-integrity-risk | **Where:** `backend/src/modules/customer-vehicle/migrations/Migration20260601111335.ts:7` | **Found by:** spec:wheel-size-garage
- **Evidence:** The table is created with `"hub_bore_mm" integer null`, and both createForCustomer (service.ts:44) and the [id] update route write the fractional wheel-size hubBoreMm (66.56, 67.1, 106.1…) straight into it. The same bug was diagnosed and fixed for wheel_size_fitment — Migration20260623120000 renamed the column to hub_bore_mm_x100 ('Old values were truncated integer mm') — but customer_vehicle never got the x100 treatment. MedusaGarage.fromWire (medusa-garage.ts:18) reads the truncated value back as the vehicle's hubBoreMm.
- **Impact:** Guest (localStorage) and authed (DB round-trip) garages disagree on the bore hard gate. A hub of 106.1mm stored as 106 makes fitsVehicle pass a 106.0mm-bore wheel — PDP says 'Fits your vehicle' for a wheel that physically will not seat on the hub, the exact safety over-claim the D8 bore gate exists to prevent. Up to ~1mm error on every logged-in saved vehicle.

## 3. [HIGH] RoutingGarage.subscribe pins listeners to the provider active at mount — authed garage UI goes stale after the local→remote switch

- **Status:** UNVERIFIED — verifier panel errored on a usage limit; re-verify before acting
- **Kind:** business-logic-bug | **Where:** `storefront/src/lib/garage/index.ts:51` | **Found by:** spec:wheel-size-garage, spec:account-garage
- **Evidence:** subscribe(l) does `const offCur = this.current.subscribe(l)` — the listener binds to whichever provider is current AT SUBSCRIBE TIME. On a hard load, syncAuth() (awaits getCustomer()) resolves AFTER hydration effects, so every mounted useGarage component (garage pill, account garage page, fitment-sync islands, PDP fitment) subscribes to LocalStorageGarage. syncAuth then flips current to MedusaGarage and emits once, but never moves listeners; MedusaGarage's later emit() on add/update/remove/setActive/mergeFrom notifies only its own empty listener set. useGarage's subscribe fn is module-stable so useSyncExternalStore never resubscribes; syncAuth re-runs only on login/logout.
- **Impact:** After a hard reload while logged in, clicking Remove or Set-as-active on /account/garage mutates the backend but the UI does not update — the card stays, the Active badge doesn't move; the nav garage pill never updates; and the fitment-sync island misses active-vehicle changes so ?fit keeps filtering by a removed/switched vehicle until navigation or reload.

## 4. [HIGH] Logout→login as a different customer shows the previous customer's garage (stale MedusaGarage instance reused)

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/lib/garage/index.ts:24` | **Found by:** spec:account-garage
- **Evidence:** syncAuth's logout branch (lines 30-33) sets `this.current = this.local; this.merged = false` but never nulls `this.remote`. On the next login, line 24 `if (!this.remote) this.remote = new MedusaGarage()` skips creation, `await this.remote.ready()` resolves instantly (the old load promise), and `this.current = this.remote` — the previous customer's cached vehicle list. mergeFrom only refreshes from the server when toAdd is non-empty (medusa-garage.ts:65 returns true immediately on empty input), so with an empty local garage nothing ever re-fetches.
- **Impact:** On a shared device (logout, log in as customer B without a hard reload — signout/login are soft navigations, module state persists), customer B sees customer A's saved vehicles in the Garage tab and garage pill, and A's stale client_ids drive B's remove/activate calls. Cross-account data exposure plus wrong fitment filtering for B.

## 5. [HIGH] Authed YMM add flow fires create/activate/fitment-update concurrently and unordered — activate can 404 and is silently dropped

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx:208` | **Found by:** spec:garage-authed-mutations
- **Evidence:** ymm-pane submit() calls add() then immediately setActive(vehicle.id). MedusaGarage.add (medusa-garage.ts:84) fires `void api.createVehicle(...)` without awaiting; setActive (107) fires `void api.activateVehicle(id)` in the same tick. The backend activate route (vehicles/[id]/activate/route.ts:10-11) resolveOwned-misses and 404s if the create INSERT hasn't committed; `.catch(() => {})` swallows it. The fitment update() (ymm-pane.tsx:212) has the same unordered dependency if create failed/slow.
- **Impact:** For a logged-in user with existing vehicles, the new car is never marked active server-side: on reload, load() restores the OLD is_active row, so the fitment filter silently targets the wrong car across sessions/devices. If create transiently fails, the fitment-window update also 404s and the vehicle/fitment data is lost while the UI shows success — violating the survives-reload acceptance.

## 6. [HIGH] fitsVehicle checks size windows per-dimension across ALL sizes — fitment band claims 'Fits your X' when no single variant fits

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/lib/fitment/fits-vehicle.ts:42` | **Found by:** spec:pdp-data-honesty, spec:fitment-aware-pdp, domain:fitment
- **Evidence:** withinWindow = hardGatesPass && inWin(sizes.map(s=>s.diameter),…) && inWin(sizes.map(s=>s.width),…) && inWin(offsets,…) — each dimension is satisfied by ANY size independently, `offsets` is flatMapped across ALL sizes (line 34), and sizes aren't scoped to the matching bolt pattern. E.g. a wheel in 20×9 ET-12 and 22×12 ET+30 vs window d20-22/w8.5-9.5/ET20-40 passes each axis via a different size though NO variant fits. buildFitView (fit-view.ts:90-93) and the chip's variantFitsVehicle check per-variant conjunction; only components/fitment/index.tsx:31 still uses fitsVehicle. The comment at fits-vehicle.ts:40-41 ('so they can never disagree') is stale.
- **Impact:** The PDP fitment band says 'Fits your X — add this wheel to cart' for wheels with no fitting variant, on the same page where the purchase chip says MAY NOT FIT and ?fit=1 shows a red 'doesn't fit' banner — three contradictory verdicts on one PDP, one of them a purchasable over-claim.

## 7. [HIGH] PDP 'confirmed models' list is bolt+bore only — contradicts the size-window-hardened active-vehicle band on the same page

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** spec-gap | **Where:** `storefront/src/modules/product-detail/components/fitment/index.tsx:31` | **Found by:** spec:pdp-reverse-fitment
- **Evidence:** The design (docs/done/specs/2026-06-18-pdp-reverse-fitment-design.md §Match gate) promises the list uses 'the same gates the active-vehicle band uses ... so the list and the band never contradict'. That held when fitsVehicle was bolt+bore only, but the 2026-07-01 over-claim fix made fitsVehicle require an in-window size (fits-vehicle.ts:42-51). The reverse list is still bolt+bore only (reverse-fitment.ts:38-49; route passes only boltPatterns+boreMm), even though wheel_size_fitment rows already store diameter/width/offset windows (service.ts:90-92) the reverse path ignores.
- **Impact:** A cached vehicle whose bolt+bore match but whose size window excludes the wheel shows 'Doesn't fit your 2021 Honda Accord' in the band while the same Accord appears below in 'N CONFIRMED MODELS' with a check mark — contradictory fitment advice on one PDP. The divergence is documented nowhere (BACKLOG WB-009 still says 'same hard gates as fits-vehicle.ts').

## 8. [MEDIUM] Warm cron is a guaranteed-failure loop for trim-keyed rows (the dominant shape): burns quota nightly, refreshes nothing, starves the batch

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** spec-gap | **Where:** `backend/src/jobs/wheel-size-warm.ts:42` | **Found by:** spec:fitment-hardening
- **Evidence:** parseCacheKey routes any non-4-digit middle slot to modificationSlug with NO year; client.byModel with modification but no year is a documented upstream 400 (client.ts:41-44 'Sending modification alone => 400 VALIDATION_ERROR'), so refreshFitment throws at service.ts:162. The cron still spends 2 quota increments per row plus one real failing API call, logs a warn, and the row's fetched_at never advances — it stays at the head of the oldest-first selectStaleForWarm batch forever. The storefront always sends a modification, so essentially all fitment rows are trim-keyed.
- **Impact:** The 'stale entry is refreshed by the warm cron' acceptance criterion is effectively dead: nightly the cron wastes up to 400 quota units and ~200 failing paid API calls, refreshes ~0 rows, and once ≥200 trim-keyed rows are stale it permanently starves year-keyed rows. Truncated integer bores only self-heal for actively re-requested vehicles.

## 9. [MEDIUM] Quota exhaustion mid-lookup returns an empty body that is cached as a fresh not_found for the full 90-day TTL

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** data-integrity-risk | **Where:** `backend/src/modules/wheel-size/service.ts:173` | **Found by:** spec:wheel-size-garage, spec:fitment-hardening, domain:fitment
- **Evidence:** Only the FIRST incrementAndCheckQuota() (line 160) throws QuotaOutageError (503, nothing cached). The trim-retry path (line 173: return { body: emptyBody, regionUsed: p.region }) and the region-probe loop (line 181: break) return empty on quota exhaustion. refreshFitment normalizes that to status 'not_found' and PERSISTS it with fetched_at = now (lines 104-113), making the row FRESH per isStale. Spec D4/§10 is explicit: 'counter-exhausted → outage even if a response looks like a no-match... We never classify an empty body as not_found' when quota is the cause.
- **Impact:** A vehicle first looked up on a quota-exhausted day gets a wrong, durable 'no fitment data' verdict (unfiltered shopping, no fit badge) for up to 90 days even though quota resets next day. Stale-while-revalidate cannot fix it (row is fresh) and the warm cron cannot either.

## 10. [MEDIUM] Wheel-size catalog read-through bypasses the quota counter; public routes mint unbounded junk cache rows and 500 on upstream failure

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** spec-gap | **Where:** `backend/src/modules/wheel-size/service.ts:215` | **Found by:** spec:wheel-size-garage, domain:fitment, domain:admin-ops-security
- **Evidence:** catalog() (service.ts:215-222) and listMakes/listModels/listYears/listModifications call the metered wheel-size API on every cache miss WITHOUT incrementAndCheckQuota — only resolveByModel counts, though the spec calls the counter 'authoritative' for ALL billable usage (by_model + any cataloging miss). Store routes (e.g. store/vehicle-catalog/models/route.ts:9) pass raw req.query strings through with no validation; every miss does createWheelSizeCatalogs keyed by the arbitrary input. On upstream non-2xx, catalog() throws QuotaOutageError which these routes never catch → 500, unlike by-vehicle's 503 degrade.
- **Impact:** Real upstream quota is under-counted, so the provider can hard-403 while the app's counter says healthy — turning the designed graceful outage into raw 500s in the vehicle picker. Anyone with the public publishable key can also enumerate garbage strings: each unique value burns an uncounted paid API call and inserts a permanent junk row (unbounded table growth, no TTL/cleanup).

## 11. [MEDIUM] wheel_size_catalog read-through cache never expires — YMM year/model dropdowns permanently frozen at first fetch

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/wheel-size/service.ts:216` | **Found by:** spec:fitment-hardening
- **Evidence:** private catalog(kind, key, fetcher): 'const hit = await this.listWheelSizeCatalogs({ kind, key }); if (hit[0]) return hit[0].payload' — no isStale check, no TTL, no refresh path. The WB-008 TTL/staleness/warm work (staleness.ts, refreshFitment, wheel-size-warm.ts) was applied only to wheel_size_fitment; makes/models/years/modifications payloads are cached verbatim forever.
- **Impact:** The years list for any make|model cached today will never include 2027+ model years, and new makes/models/trims never appear in the storefront YMM dropdowns until someone manually truncates wheel_size_catalog. Slow-burn but certain divergence from the live wheel-size catalog with no error logged.

## 12. [MEDIUM] Vehicle update route accepts a fully unvalidated body while create/merge are zod-validated

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** data-integrity-risk | **Where:** `backend/src/api/store/customer/vehicles/[id]/route.ts:13` | **Found by:** spec:legacy-superseded, spec:garage-authed-mutations, domain:admin-ops-security
- **Evidence:** POST /store/customer/vehicles/[id] reads `const b = req.body as any` and passes b.hubBoreMm, b.canonicalBoltPatterns, b.diameterWindow, b.oemTires etc. straight into updateCustomerVehicles (lines 13-18) with zero validation — unlike the sibling create and merge routes, which run parseVehicleCreate/parseVehicleMerge (validators.ts:8-52: year bounds, string/array checks, oemTires shape). hub_bore_mm is a number column and the json columns feed the fitment engine.
- **Impact:** An authed client can persist a string into hub_bore_mm (DB type error → unhandled 500) or arbitrary JSON into canonical_bolt_patterns/oem_tires/windows, poisoning the row the storefront fitment code (fitsVehicle/tireFitsVehicle, discovery vehicleConstraint) consumes as arrays — crashing or nonsense fitment for that customer. Blast radius is the customer's own row (resolveOwned scoping is correct).

## 13. [MEDIUM] activate() is a non-transactional read-modify-write — concurrent activations collide with the one-active partial unique index

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/customer-vehicle/service.ts:18` | **Found by:** spec:garage-authed-mutations
- **Evidence:** activate() does listCustomerVehicles({customer_id, is_active:true}), loops deactivating, then updateCustomerVehicles({id, is_active:true}) — separate statements, no transaction/locking. Migration20260602090000 adds UNIQUE INDEX UQ_customer_vehicle_one_active ON (customer_id) WHERE is_active AND deleted_at IS NULL. Storefront setActive is fire-and-forget per click (medusa-garage.ts:107, garage-pane.tsx:49), so two in-flight activates can interleave: B's stale read misses A's just-set row, B's final update violates the index.
- **Impact:** Rapid vehicle switching can 500 server-side (unique violation) or leave the wrong row active; the error is swallowed by `.catch(() => {})` so the client's active vehicle silently diverges from the server's, and the persisted active-vehicle fitment context is wrong on the next session.

## 14. [MEDIUM] All authed garage mutations are fire-and-forget with empty catches — the promised retry/toast handling does not exist

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/lib/garage/medusa-garage.ts:84` | **Found by:** spec:legacy-superseded, spec:garage-authed-mutations, spec:account-garage
- **Evidence:** add() does `void api.createVehicle(toWire(vehicle)).catch(() => {/* retry/toast */})` (line 84); update (95), remove (102) and setActive (107) have identical bare `.catch(() => {})`. No retry queue, toast, or optimistic-state rollback exists for these paths; load()'s comment 'toast handled by callers' (line 50) is likewise aspirational — no caller toasts or retries. The WB-002 design's acceptance criterion is that rename/delete/set-active 'survive a page reload'.
- **Impact:** Any transient network/auth failure on add, rename, delete, or activate makes the optimistic UI show success while the server keeps the old state — the change vanishes on reload with no user feedback and no retry, locally-deleted vehicles resurrect, and fitment filtering keeps using the old active vehicle. Silent data loss on the exact persistence path the plans were meant to harden.

## 15. [MEDIUM] Failed initial account-garage load silently blanks the garage for the whole session — no retry, no toast, merge skipped

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/lib/garage/medusa-garage.ts:50` | **Found by:** spec:account-garage
- **Evidence:** load() catches every error and sets `loadOk = false` with the comment 'toast handled by callers' — no caller toasts (mergeLocalIntoRemote and syncAuth just skip). `this.loaded` is a one-shot promise; ready()/isLoaded() never re-trigger load, and syncAuth (index.ts:25-29) awaits the same settled promise on every later call. current is still switched to the empty remote (index.ts:29).
- **Impact:** One transient network/5xx on the initial GET /store/customer/vehicles and an authed user sees an empty Garage tab for the entire session: real account vehicles hidden, local guest vehicles also hidden (current=remote), the guest→login merge never runs (isLoaded stays false), and no error is surfaced. Only a full page reload recovers.

## 16. [MEDIUM] Vehicle added while the login merge request is in flight is wiped by local.clear() — violates the no-data-loss invariant

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** data-integrity-risk | **Where:** `storefront/src/lib/garage/index.ts:39` | **Found by:** spec:account-garage
- **Evidence:** mergeLocalIntoRemote snapshots `planMerge(this.local.list(), ...)` (line 39), awaits the network mergeFrom (40), then `this.local.clear()` (41). During that await, `this.current` is still LocalStorageGarage (only reassigned after the merge at line 29), so a garage.add() from the YMM drawer lands in local — and is then cleared without ever being sent. LocalStorageGarage.clear() removes both keys unconditionally (local-storage-garage.ts:113-119).
- **Impact:** A user who logs in and immediately saves a vehicle (drawer stays usable during syncAuth) loses that vehicle silently — precisely the silent-drop class WB-022 was built to eliminate; the plan's global constraint says local must never be cleared except for data known to be persisted.

## 17. [MEDIUM] YMM submit has no error handling for non-503 fitment failures; the promised network-retry/'try again' path was never built

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** spec-gap | **Where:** `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx:210` | **Found by:** spec:wheel-size-garage
- **Evidence:** Spec §10 promises a third failure mode: 'wheel-size 5xx / network → client retry w/ backoff, then give up → transient try-again (distinct from the two above)'. getFitmentByVehicle (lib/data/fitment.ts:84) rethrows anything that isn't status 503, and ymm-pane's submit() wraps the await in `try { ... } finally` with NO catch (lines 194-257) and no retry anywhere.
- **Impact:** If the storefront→backend fetch fails (backend restart, timeout, network blip), the rejection is unhandled: the drawer never closes, no toast or try-again message shows, and the vehicle has already been add()ed and setActive()d with no fitment data — an active vehicle with empty canonicalBoltPatterns that silently filters nothing.

## 18. [MEDIUM] Vehicle saved without fitment data makes every PDP assert 'Bolt pattern does not match your vehicle' — a false negative stated as fact

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/lib/fitment/fits-vehicle.ts:22` | **Found by:** spec:pdp-data-honesty
- **Evidence:** boltOk = vPats.length > 0 && … — a vehicle with no canonicalBoltPatterns (optional on Vehicle, garage/types.ts:22; ymm-pane.tsx adds the vehicle BEFORE the wheel-size lookup and keeps it when the lookup errors/503s, ymm-pane.tsx:209-247) yields fits=false with reason 'Bolt pattern does not match your vehicle.' variantFitsVehicle likewise returns false for empty vPats (product-has-fitting-variant.ts:39-40).
- **Impact:** When the fitment provider is down or lacks data for the vehicle, every wheel PDP shows 'Doesn't fit your X. Bolt pattern does not match your vehicle.' and the purchase chip shows MAY NOT FIT across the entire catalog — an affirmative false claim (unknown ≠ mismatch) that suppresses sales and misinforms the shopper.

## 19. [MEDIUM] Fitment section claims entries are 'bench-verified for offset, hub bore, and brake clearance' — data supports none; CTA is a dead link

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/modules/product-detail/components/fitment/index.tsx:39` | **Found by:** spec:pdp-reverse-fitment, domain:fitment
- **Evidence:** SectionHeader description: 'Every fitment below has been bench-verified for offset, hub bore, and brake clearance.' The list comes from buildReverseFitment (backend/src/modules/wheel-size/reverse-fitment.ts:56-83): lazily cached wheel-size.com lookups matched on bolt-pattern intersection plus a bore gate that PASSES when either value is unknown (line 47). Offset is explicitly out of scope (design §Out of scope); brake clearance is checked nowhere. The 'Submit your build for fitment' CTA at line 142 is href="#" while promising confirmation 'within 24 hours'.
- **Impact:** Purchase-adjacent copy asserts a physical verification process the data cannot support — a vehicle listed as 'confirmed' can require offsets this wheel is not sold in; safety/returns/chargeback liability, and the promised confirmation channel is a dead link.

## 20. [MEDIUM] buildFitView decouples the bore check from the offset-window check across offset variants of a size

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/product-detail/data/fit-view.ts:45` | **Found by:** spec:fitment-aware-pdp
- **Evidence:** boltCompatible passes if ANY offsetVariant's bore clears the hub (line 45: offsets.some((o) => boreClears(o.centerBoreMm))), and withinWindows passes if ANY offsetVariant's ET is in-window (line 60) — two independent .some() calls. The spec (design §2) and plan required one variant satisfying both: offsets.some((o) => inWin(o.value) && boreClears(o.centerBoreMm)). The per-variant gates elsewhere (variantFitsVehicle, discovery's productHasFittingVariant) combine them correctly.
- **Impact:** A size with variants {ET40, bore 66} and {ET-10, bore 106} against hub 73 / offsetWindow 35-50 is kept as 'fitting' though no single variant both mounts and is in-window — the fit-filtered PDP shows it while discovery's post-filter would drop the same product, so the two surfaces disagree. Bores genuinely vary per variant (that is why the Center-bore SpecSelector exists).

## 21. [MEDIUM] Discovery/home card 'FITS' badge is bolt-pattern-only — over-claims fit and contradicts the per-variant gate, even under fit=0 opt-out

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/modules/discovery/components/grid/fit-badge.tsx:14` | **Found by:** domain:fitment, domain:discovery-meili
- **Evidence:** FitBadge renders an accent 'FITS' chip whenever productFitsVehicle(patterns, active.canonicalBoltPatterns) — a pure bolt-pattern set intersection (lib/fitment/product-fits.ts:6-13). No hub-bore, no diameter/width/offset window, no per-variant pairing. Outside fit-mode (plain /store browsing, explicit ?fit=0 opt-out, home NEW-THIS-WEEK rail, PDP Similar-wheels row) results are NOT post-filtered by productHasFittingVariant, so the badge is the only fit signal. The fit-mode branch in get-products.ts exists precisely because this over-claims (comment lines 164-167).
- **Impact:** A multi-pattern wheel whose matching pattern only exists in out-of-window sizes (or whose bore is smaller than the vehicle hub) gets a definitive 'FITS' badge on the card; clicking through, the PDP immediately shows MAY NOT FIT for the same product/vehicle, and the same card disappears when fit filtering is turned on. WB-060 fixed this over-claim on the PDP; the card badge still makes it.

## 22. [MEDIUM] Advanced fitment panel renders duplicate offset chips with duplicate React keys on bore/load-branching sizes

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** code-bug | **Where:** `storefront/src/modules/product-detail/components/hero/advanced-fitment-panel.tsx:95` | **Found by:** spec:wheel-axis-collision
- **Evidence:** `offsetVariants.map((o) => ... key={o.value})` renders one chip per OffsetVariant (advanced-fitment-panel.tsx:95-101). Since WB-051, a size holds one OffsetVariant per VARIANT, so a center-bore-branching size (e.g. XD845: two variants at ET105 with bores 78.1/87.1) yields two identical '+105MM' chips sharing key 105, both styled selected (sel = o.value === selectedOffsetMm). The hero also gates the panel on offsetVariants.length > 1 (hero/index.tsx:238), so a single-offset, two-bore size shows the offset-override panel with duplicate chips.
- **Impact:** On exactly the flagship WB-051 products (bore-branching wheels), the PRO panel shows duplicated, simultaneously-highlighted offset chips plus React duplicate-key warnings; the spec grid's find((o) => o.value === selectedOffsetMm) also shows the first matching variant's backspace regardless of the selected bore.

## 23. [LOW] Concurrent first lookups of the same vehicle race list-then-create into a unique-constraint 500

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** code-bug | **Where:** `backend/src/modules/wheel-size/service.ts:111` | **Found by:** spec:fitment-hardening
- **Evidence:** refreshFitment does `const existing = await this.listWheelSizeFitments({ cache_key }); if (existing[0]) update else create` against the partial unique index IDX_wheel_size_fitment_cache_key_unique (Migration20260601111311.ts:15). Two simultaneous cache misses both see existing=[] and both insert; the loser throws a constraint violation which is neither QuotaOutageError nor caught, so the route (store/fitment/by-vehicle/route.ts:24) rethrows it as a 500.
- **Impact:** The first two shoppers to look up a popular vehicle at the same moment (or one double-fired client request) get a 500 hard error instead of the fitment; WB-020 fixed the quota race atomically but left the cache-row upsert non-atomic (no ON CONFLICT, no violation catch).

## 24. [LOW] Merge/create vehicle routes accept unbounded batches and arbitrary JSON blobs with no per-customer cap

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** security | **Where:** `backend/src/api/store/customer/vehicles/validators.ts:38` | **Found by:** spec:account-garage
- **Evidence:** VehicleMergeSchema is `z.object({ vehicles: z.array(VehicleCreateSchema) })` with no max length; VehicleCreateSchema allows `diameterWindow/widthWindow/offsetWindow: z.any()` and unbounded notes/trim strings (lines 13-23). mergeForCustomer (service.ts:60-65) runs 2 sequential queries per element and there is no per-customer vehicle count limit anywhere in the module.
- **Impact:** Any authenticated customer can POST /store/customer/vehicles/merge with tens of thousands of vehicles carrying megabyte JSON in the z.any() fields — synchronous request-time row-by-row inserts (DB bloat + slow requests), repeatable across accounts. A modest array cap and bounded window schemas would close it.

## 25. [LOW] Deleting the last garage vehicle leaves the stale ?fit filter applied — island reconcile case 2 was dropped

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** spec-gap | **Where:** `storefront/src/modules/discovery/components/fitment-sync/index.tsx:27` | **Found by:** spec:wheel-size-garage
- **Evidence:** The design spec §8 defines reconcile case 2 ('no active vehicle && fit present → remove fit') and promises 'the URL never filters by a deleted or stale vehicle'; plan Task 25 Step 4 verifies 'deleting the active vehicle strips the stale fit param'. The shipped island instead does `if (!desiredFit) return` with a comment declaring auto-strip removed (because the garage loads asynchronously) — a deviation recorded only in a code comment, not in the docs.
- **Impact:** A shopper who removes their only vehicle while on /store keeps browsing a grid filtered to that deleted vehicle's bolt patterns plus fitb/fitd/fitw/fito windows, with the Vehicle band showing no active vehicle to explain why most of the catalog is hidden, until they manually hit fit=0 or edit the URL.

## 26. [LOW] 'YOUR VEHICLE' highlight matches make/model only — every generation/trim row of the model gets the chip

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** code-bug | **Where:** `storefront/src/modules/product-detail/components/fitment/index.tsx:124` | **Found by:** spec:pdp-reverse-fitment
- **Evidence:** isActive compares only f.make/f.model (lowercased) against the active vehicle — year and trim are never compared, and entries carry year-range labels like '2013–2017'. The reverse cache holds multiple generations/trims of one model as distinct rows (dedupe key in reverse-fitment.ts:71).
- **Impact:** A 2021 Accord owner sees '2013–2017 Honda Accord LX' rows also tagged 'YOUR VEHICLE' whenever their vehicle fits — mislabeling other generations, whose fitment windows differ, as the shopper's car.

