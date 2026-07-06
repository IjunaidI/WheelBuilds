# Audit findings — vendor-sync pipeline (import, apply, stock, lifecycle)

> **Raw finding log** from the 2026-07-06 done-specs audit (workflow run wf_7e98d308-058; 27 reviewers over all 24 done plan/spec units + 6 business-logic domains; 116 raw -> 76 unique findings). Findings against the vendor-sync import pipeline: diff/apply lifecycle, stock math, adoption/idempotency, run-state machine, and indexing side-effects.
>
> **These are logged findings, not yet plans.** Statuses: CONFIRMED = survived a 3-lens adversarial panel (refute / business-impact / concrete-repro); PENDING = single-reviewer claim awaiting verification. Convert to detailed specs/plans (superpowers:writing-plans) before implementation. Umbrella: [2026-07-06-audit-remediation-theme.md](2026-07-06-audit-remediation-theme.md).

**21 findings** — high: 10, medium: 9, low: 2

---

## 1. [HIGH] Changed-SKU path overwrites normalized before the stock pass — warehouse sellouts never zeroed, phantom stock accumulates

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** data-integrity-risk | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:503` | **Found by:** spec:vendor-sync-plan, domain:vendor-sync-integrity
- **Evidence:** applyChangedGroup writes `normalized: r` (NEW feed record) to vendor_product_current (apply.ts:503-509) inside the changed-groups loop, but the stock pass runs after all groups (apply.ts:219). applyStockLevels re-reads the row and uses `currentRow.normalized.stockByWarehouse` as previousStock (apply-stock.ts:161-162) — now the CURRENT feed's stock. normalize.ts:26-34 keeps only qty>0 warehouses and stage.ts:92-104 stages only qoh>0 rows, so a warehouse that sold out (5 → 0) appears in neither staging nor previousStock; the zero-out loop (apply-stock.ts:79-103) never touches it. Zero-out only works for fully-removed variants, whose rows aren't overwritten.
- **Impact:** Every per-warehouse sellout between feeds leaves the old nonzero Medusa inventory level in place permanently. Storefront availability sums locations, so it shows/sells stock the vendor no longer has — oversell risk. Plan §5.1's 'absent warehouses are explicitly zeroed' holds only for removed variants.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 2. [HIGH] Discontinued group reappearing in the feed is adopted but never republished — product stays DRAFT forever, sync reports success

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:279` | **Found by:** spec:vendor-sync-plan, spec:partial-apply-retry, domain:vendor-sync-integrity
- **Evidence:** applyDiscontinuedGroup drafts the product (apply.ts:739-750) keeping external_id. On re-introduction the group's current rows are all discontinued so computeGroupDiffFromSets excludes them (diff.ts:159-166) and classifies the group NEW. applyNewGroup finds the drafted product by external_id (apply.ts:279-284) and takes the WB-016 adoption path, but persistAdoptedGroup (apply.ts:871-914) only upserts vendor_product_current rows — never sets status back to PUBLISHED, never clears discontinued product/variant metadata, never updates prices. Stock IS re-applied to the invisible product.
- **Impact:** A vendor line dropped for one feed cycle and later restored never returns to the storefront: product stays draft with matching content_hash, so every later run diffs it as unchanged. Permanent silent catalog loss; the adoption log misattributes it to 'prior partial apply'.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 3. [HIGH] persistAdoptedGroup writes null-variant current rows with matching content_hash — zombie SKUs and groups wedged by later throws

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** data-integrity-risk | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:886` | **Found by:** spec:partial-apply-retry, spec:wheel-axis-collision, domain:vendor-sync-integrity
- **Evidence:** persistAdoptedGroup maps staging records to adopted-product variants by SKU; on a miss it only warns (apply.ts:882-885) and still writes a current row with medusa_variant_id=null, inventory_item_id=null AND content_hash = current staging hash (apply.ts:886-896). It is also passed the raw UN-deduped records (apply.ts:284; dedupeExactDuplicates runs only in applyNewWheelGroup), so dropped duplicates get null-variant rows too. Next diff sees hash match → unchanged (diff.ts:223-227) so the variant is never created and the stock pass skips it; if that SKU's content later changes, applyChangedGroup throws 'changed variant missing medusa_variant_id' (apply.ts:477-480).
- **Impact:** SKUs enter a permanent zombie state — tracked as applied with no Medusa variant or inventory, invisible to the WB-016 retry — and one adoption on a group with duplicate SKUs makes every subsequent apply of that whole group throw on each 12h run until manually repaired.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 4. [HIGH] Re-listed removed variant is adopted with stale price and discontinued=true metadata never cleared

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:534` | **Found by:** spec:partial-apply-retry
- **Evidence:** When a variant is removed its Medusa variant gets metadata { discontinued: true, discontinued_at } (apply.ts:666-687) and its current row is soft-discontinued. If the vendor re-lists that SKU, the diff marks it 'added' (discontinued rows excluded from active set). In applyChangedGroup the SKU is already on the product so partitionRecordsBySku routes it to adopt, excluding it from toCreate (apply.ts:534); persistAddedVariants (apply.ts:1004-1046) reactivates the vendor row and writes the NEW content_hash, but no updateProductVariantsWorkflow runs for adopted SKUs — variant keeps discontinued:true metadata and the old price. Same applies to the replaySku re-add path (service.ts:576-593).
- **Impact:** A temporarily-dropped SKU that comes back (routine vendor pattern) stays hidden/badged as discontinued on the storefront and keeps a stale MSRP, while the stored hash matches the feed so no future run corrects it until the vendor changes that row's content again.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 5. [HIGH] Stock-pass errors invisible to finalize/retry — run marked 'completed' with content_hash already advanced; cancel also skips stock

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** data-integrity-risk | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:219` | **Found by:** spec:partial-apply-retry, domain:vendor-sync-integrity
- **Evidence:** applyStockLevels catches per-part errors and returns errorCount (apply-stock.ts:218-226), but applyChanges only logs it (apply.ts:219-232) and never merges those errors into ApplyResult.errors. finalizeApply therefore sees errorCount 0 and marks the run 'completed' (finalize-apply.ts:59-69), so the RunDate short-circuit skips the feed. Worse, applyChangedGroup writes the new content_hash BEFORE the stock pass (apply.ts:500-511) and stockByWarehouse/totalQoh are part of the hash (utils/hash.ts:17-22), so the failed part reads as 'unchanged' next feed. On cancel, already-applied groups have hashes persisted but the stock pass is skipped entirely (apply.ts:219 gate).
- **Impact:** Any transient failure during the stock pass leaves Medusa inventory wrong (oversell or phantom out-of-stock) with no partially_failed status, no retry, and no admin visibility beyond a log line — the exact stranded-failure class WB-016 was built to eliminate, but only for group errors.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 6. [HIGH] Vendor price/variant changes never emit product.updated — Meilisearch keeps stale prices and facets indefinitely

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:495` | **Found by:** domain:money-pricing
- **Evidence:** applyChangedGroup mutates only variants: changed rows → updateProductVariantsWorkflow (line 495, emits product-variant.updated), added rows → createProductVariantsWorkflow (563/633) + updateProductOptionsWorkflow (1080), removed rows → updateProductVariantsWorkflow (770). None emits product.updated. The Meilisearch plugin's only re-index triggers are product.created/updated/deleted subscribers (verified in @rokmohar/medusa-plugin-meilisearch's meilisearch-product-updated.js). Only new-group create and discontinue (updateProductsWorkflow, line 739) reach the index.
- **Impact:** After any 12h sync where WheelPros changes an MSRP, the Medusa catalog (PDP, cart, charge) gets the new price but the Meili doc keeps the old price_min/price_max forever — discovery displays, sorts, and price-filters on a price different from what is charged. Added/removed sizes and finishes never appear/disappear from facets until a manual full re-sync.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 7. [HIGH] Dry-run finishes 'completed' with no marker — both feed short-circuits then silently skip the next real sync

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/service.ts:382` | **Found by:** spec:legacy-superseded, domain:admin-ops-security
- **Evidence:** A dry run finishes with status 'completed' and no dry-run marker persisted (service.ts:382-393), after mode:'full', run_date_vendor and source_filename/modify_time were written. The cron's next real run then (a) reads the latest status='completed' mode:'full' run's source_filename/modify_time → SFTP 'unchanged' short-circuit, and (b) the RunDate short-circuit fires because shouldShortCircuitFeed('completed')===true (retry-policy.ts:29-35). vendor-sync-tick.ts calls run() with no dryRun so the cron hits both gates, and the admin console's only trigger button is hardcoded to dry-run: triggerRun(triggerVendor, true) (src/admin/routes/vendor-sync/page.tsx:65).
- **Impact:** Any admin clicking 'Run dry-run' in the console (or `pnpm vendor-sync:dry-run`) for the current feed causes the following 12h cron full sync to short-circuit as 'already done' though nothing was applied — that day's price/stock/discontinue changes silently never reach the catalog; logs read as a healthy 'unchanged' skip.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 8. [HIGH] Approving a stale awaiting_approval run rolls the live catalog back to that run's old feed snapshot — and pending runs pile up

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** data-integrity-risk | **Where:** `backend/src/api/admin/vendor-sync/runs/[id]/approve/route.ts:18` | **Found by:** spec:discovery-vendor-ops, domain:vendor-sync-integrity
- **Evidence:** Approve's only guard is `run.status !== 'awaiting_approval'`. approveAndApply (service.ts:404-465) re-diffs THAT run's staging vs vendor_product_current with no staleness check (never compares run_date_vendor against newer completed runs), so every group applied by newer feeds is classified discontinued and drafted (apply.ts:737-764), and changed rows revert prices/stock. Stale awaiting runs accumulate: shouldShortCircuitFeed is false for awaiting_approval and IN_PROGRESS_STATUSES excludes it, so each 12h cron on the same feed re-trips the threshold and parks another one. The WB-006 console makes any of them one-click Approve with no age warning.
- **Impact:** An operator approving an old awaiting_approval run (superseded by newer applied feeds) mass-discontinues currently-live products and reverts prices/stock to the stale feed — a silent catalog rollback; the pile-up of duplicate pending runs makes picking the wrong (older) one likely.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 9. [HIGH] No vendor-level concurrency guard on approve/replay — two apply loops can mutate the same vendor's catalog concurrently

- **Status:** CONFIRMED — survived an adversarial 3-lens panel (refute / impact / repro), unanimous
- **Kind:** data-integrity-risk | **Where:** `backend/src/modules/vendor-sync/service.ts:52` | **Found by:** domain:admin-ops-security
- **Evidence:** IN_PROGRESS_STATUSES = ['fetching','staging','diffing','applying'] (service.ts:52) excludes 'awaiting_approval', so while a run is paused for approval the cron/startRun guard (lines 111-120) and the admin trigger pre-check (api/admin/vendor-sync/runs/route.ts:51-62) happily start a NEW full run for the same vendor. replayRun (service.ts:613-625) and replaySku and their routes perform no in-progress check for the vendor at all before setting status:'applying' and running applyChanges.
- **Impact:** Approving a run paused on the discontinue-threshold brake after a newer run already applied re-applies the OLD staging rows (stale prices/stock overwrite). Replay during a cron apply yields two concurrent apply loops mutating vendor_product_current and live Medusa products for the same vendor.
- **Verification votes:** refute=real (high) | impact=real (high) | repro=real (high)

## 10. [HIGH] 'Manual Payment' (pp_system_default) is a selectable checkout option in production and places orders with no payment

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/pipeline/bootstrap.ts:32` | **Found by:** domain:cart-checkout
- **Evidence:** bootstrap.ts:28-33 creates the production US region with payment_providers: ["pp_system_default"] (seed.ts:120 does the same for Europe); nothing removes it when Stripe is enabled, so listCartPaymentMethods returns it alongside Stripe. The storefront renders it as 'Manual Payment' with a credit-card icon (storefront/src/lib/constants.tsx:29-32), and the 'For testing purposes only' badge is gated on NODE_ENV === "development" (payment-container/index.tsx:24,46,54) so production shows no warning. ManualTestPaymentButton (payment-button/index.tsx:262-299) then calls placeOrder() directly — no charge ever occurs.
- **Impact:** Any production customer can pick 'Manual Payment' and complete an order without paying. Unless ops manually inspects every order's payment provider before fulfilling, wheels ship unpaid. Distinct from tracked WB-031 (seed shipping options/replyTo); live on the current region config.

## 11. [MEDIUM] computeContentHash's array replacer empties stockByWarehouse — per-warehouse stock moves never register as changes

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** code-bug | **Where:** `backend/src/modules/vendor-sync/utils/hash.ts:51` | **Found by:** domain:vendor-sync-integrity
- **Evidence:** hash.ts:51 uses JSON.stringify(base, Object.keys(base).sort()). An array replacer whitelists keys at EVERY nesting level; warehouse codes are not in the top-level key list, so stockByWarehouse always serializes as {} (verified: JSON.stringify({a:1,stockByWarehouse:{X:5}},["a","stockByWarehouse"]) → {"a":1,"stockByWarehouse":{}}). The sortObject() call at hash.ts:22 shows the intent was to hash the sorted per-warehouse map. Only totalQoh (a top-level key) still contributes.
- **Impact:** Any stock redistribution that keeps totalQoh constant (W1 5→0, W2 0→5) hashes identical → SKU classified unchanged → stock pass never runs → Medusa per-location levels go stale (compounding the previousStock bug). Per-warehouse availability silently diverges from the vendor feed.

## 12. [MEDIUM] Changed-variant path never updates variant options/title — axis or finish changes silently corrupt variant identity

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:482` | **Found by:** spec:wheel-axis-collision, spec:finish-as-variant
- **Evidence:** diff.ts routes any content_hash change to changed_part_numbers (diff.ts:223-244), including axis fields (offset, center bore, load rating, finish, diameter). The changed path updates only `metadata`, `prices`, and weight (apply.ts:482-492) — never `options` or `title`. Post-WB-059 a finish rename stays in-group (group-key.ts:31 drops finish) and lands here; extendWheelOptions (apply.ts:1054) runs only for added_part_numbers and the residual-collision guard only at create/add time. WB-051's premise is that the option/metadata 7-tuple IS variant identity.
- **Impact:** A vendor correction to any axis field (fixed offset, 'Matte Black'→'Satin Black') leaves the Medusa option tuple and admin/cart-visible variant title stale while metadata updates — PDP and admin disagree, and two variants can silently claim the same 7-tuple, breaking the dedupe invariant future adds rely on.

## 13. [MEDIUM] Add-path dedupe counts discontinued variants' axis keys, permanently blocking a live replacement SKU

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:538` | **Found by:** spec:wheel-axis-collision
- **Evidence:** existingAxisKeys is built from ALL variants of the product (filters: { product_id: [productId] }, apply.ts:526-541) with no exclusion of variants marked discontinued: true by the removed path (apply.ts:666-680). A newly-added SKU whose 7-tuple matches a discontinued variant is dropped by dedupeAddedAgainstExisting (apply.ts:543-551) and gets no current row, so it re-drops on every run.
- **Impact:** When a vendor retires SKU A and lists identical-spec SKU B, the discontinued variant stays zero-stock and the replacement is dropped forever: the product is permanently unsellable at that spec despite in-feed stock, with only a per-run warn line as signal.

## 14. [MEDIUM] Product thumbnail/images set only at group creation — vendor image changes and new finishes never propagate

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** spec-gap | **Where:** `backend/src/modules/vendor-sync/pipeline/apply.ts:475` | **Found by:** spec:vendor-sync-plan, spec:finish-as-variant
- **Evidence:** Plan §5.3 says a changed imageUrl 'goes through the changed-products path, which sets thumbnail and images to the new vendor URL', but applyChangedGroup (apply.ts:475-511) only calls updateProductVariantsWorkflow; thumbnail/images are written only at group create (apply.ts:337-358, 409-431). Likewise design 1d's 'product images = union of distinct finish image URLs' holds only at creation: the changed-group added path (apply.ts:514-583) never touches `images`/`thumbnail` when a brand-new finish joins an existing product. The Meili doc takes product.thumbnail (build-search-document.ts:97,177).
- **Impact:** When WheelPros rotates or retires CDN image URLs, Discovery cards and the PDP gallery keep serving the stale URL (broken images); finishes added by later feeds never get their photo attached to the product. Only a purge/re-import corrects it.

## 15. [MEDIUM] Cancel during fetch/stage/diff is overwritten by unconditional status writes; leaked cancel flag later no-ops approve/replay

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ops-risk | **Where:** `backend/src/modules/vendor-sync/service.ts:330` | **Found by:** spec:vendor-sync-plan, spec:discovery-vendor-ops
- **Evidence:** Cancel route allows fetching/staging/diffing and writes status='cancelled' + markCancelled(id), but isCancelled is consulted ONLY in the apply loop (apply.ts:119). service.run() unconditionally overwrites status to 'staging' (service.ts:270), 'diffing' (285), 'applying' (348). If cancelled mid-apply, finalizeApply's cancelled branch (finalize-apply.ts:31-39) writes NO status/finished_at — final state status='applying' (IN_PROGRESS_STATUSES, service.ts:45), blocking every future run. Dry-run/threshold return paths (service.ts:326-344) end awaiting_approval/completed WITHOUT clearCancelled_, so a later Approve/Replay sees the stale flag and silently processes 0 groups.
- **Impact:** Operator cancels a run and it either resurrects to completed/awaiting_approval, silently no-ops a later approve/replay despite a success toast, or sticks at 'applying' so the skip-if-running guard rejects every cron tick until vendor-sync-cleanup.ts is run. Distinct from done WB-037 (cross-process flag): this is single-process via the documented endpoint.

## 16. [MEDIUM] approveAndApply never re-checks run status — a cancelled (or double-approved) run still fully applies

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `backend/src/modules/vendor-sync/service.ts:553` | **Found by:** domain:admin-ops-security
- **Evidence:** The approve route checks run.status === 'awaiting_approval' then only EMITS 'vendor-sync.approve' and returns 202 (runs/[id]/approve/route.ts:19-39). The subscriber calls approveAndApply, which unconditionally writes status:'applying' and cancel_requested_at:null (service.ts:553-559) without re-reading/validating the status. Cancel on an awaiting_approval run finalizes it to 'cancelled' immediately (runs/[id]/cancel/route.ts:37-42).
- **Impact:** Sequence approve(202) → cancel(console shows 'cancelled') → subscriber picks up the event → the cancelled run flips back to 'applying', the cancel flag is wiped, and the diff applies to the live catalog anyway. Two near-simultaneous approve clicks can run applyChanges twice concurrently for the same run. The route's status check became advisory-only when processing moved off-request.

## 17. [MEDIUM] SFTP misconfiguration matching zero feed files marks the run 'completed' — re-opens the silent-misconfig class WB-041 closed

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ops-risk | **Where:** `backend/src/modules/vendor-sync/service.ts:181` | **Found by:** spec:fail-loud-feed-guard
- **Evidence:** service.ts:181-187: `if (feed.kind === "empty") { logger.warn(...); updateVendorFeedRuns({ id: runId, status: "completed", error_message: "no feed file found", ... }) }`. sftp.ts:33-35 returns { kind: "empty" } whenever pickNewestFeed matches nothing — e.g. a wrong VENDOR_WHEELPROS_*_SFTP_PATTERN or a remoteDir with no matching files. The WB-041 spec's stated goal (docs/done/specs/2026-06-20-vendor-sync-fail-loud-feed-guard-design.md) is to fail loud on feed-source misconfiguration, but this branch was left as-is.
- **Impact:** A prod deploy with SFTP creds correct but pattern/dir wrong syncs nothing yet mints a green 'completed' run every 12h — a dead feed can go unnoticed indefinitely. The run row is self-contradictory (status=completed with error_message set), so the admin console shows it as success.

## 18. [MEDIUM] replaySku swallows apply errors — admin route always responds 'replay completed' even when the apply failed

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ops-risk | **Where:** `backend/src/api/admin/vendor-sync/skus/[partNumber]/replay/route.ts:22` | **Found by:** spec:partial-apply-retry, domain:vendor-sync-integrity
- **Evidence:** replaySku calls applyChanges and discards its return value (service.ts:613-621); applyChanges swallows per-group errors into result.errors rather than throwing. The route unconditionally responds { message: "replay completed" } (route.ts:24-28). Unlike replayRun/approveAndApply, replaySku never calls finalizeApply, so there is no terminal accounting at all.
- **Impact:** The documented recovery tool for an exhausted/failed SKU tells the operator it succeeded when the underlying apply errored — broken SKUs appear fixed and the failure is only discoverable in server logs; no run row records the error.

## 19. [MEDIUM] purge-products deletes the entire live catalog on a bare empty-body admin POST, with no confirm guard

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ops-risk | **Where:** `backend/src/api/admin/vendor-sync/purge-products/route.ts:33` | **Found by:** domain:admin-ops-security
- **Evidence:** Empty body defaults to BOTH vendors (line 33: vendors = vendor_code ? [vendor_code] : VENDORS) and deleteProductsWorkflow runs immediately over every vendor product (lines 55-58). No confirmation token, dry-run flag, or env gate. The repo's convention for this exact operation requires --confirm-host=<DB host> in the destructive scripts (vendor-sync-dev-wipe.ts:124-137, vendor-sync-truncate-state.ts:85-98).
- **Impact:** Any authenticated admin session or leaked admin api-key one-shot deletes the live ~1,724-product / ~29k-variant catalog; recovery is a multi-hour re-import. The deliberate confirm-host safety convention was dropped when the operation moved from CLI to HTTP.

## 20. [LOW] Removed variants stay fully indexed in Meili facets and price_min; the discontinued flag has no storefront consumer

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** ux-honesty | **Where:** `backend/src/modules/vendor-sync/search/build-search-document.ts:61` | **Found by:** spec:vendor-sync-plan
- **Evidence:** apply.ts:649-689 marks removed variants metadata `discontinued: true` 'so the storefront can hide or badge them individually', but grep of storefront/src for 'discontinued' returns zero matches, and buildWheelDocument/buildTireDocument iterate ALL variants (build-search-document.ts:61-90, 145-170) with no discontinued filter — their diameters, finishes, bolt patterns, fit_specs, and prices feed the facets and price_min/price_max.
- **Impact:** Discovery matches and 'from $X' pricing can be driven entirely by variants the vendor no longer sells (stock zeroed); users filter by that size/finish, land on the PDP, and find only an out-of-stock option.

## 21. [LOW] Admin vendor-sync console omits the vendor filter and limit/offset pagination the design spec promises

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** spec-gap | **Where:** `backend/src/admin/routes/vendor-sync/page.tsx:42` | **Found by:** spec:discovery-vendor-ops
- **Evidence:** Design spec (docs/done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md, Run list bullet): 'Vendor + status filters; limit/offset pagination.' page.tsx:42-45 calls listRuns with only status + fixed limit 25; no vendor control, no pager. api.ts:43-48 accepts a vendor param nobody passes and has no offset param, though the backend route (runs/route.ts:11-16) supports both.
- **Impact:** With two vendors at ~4 cron runs/day, 25 rows is ~6 days of mixed history — older runs (including stale awaiting_approval ones an operator should cancel) are unreachable from the console; the doc marks WB-006 done without recording the cut.

