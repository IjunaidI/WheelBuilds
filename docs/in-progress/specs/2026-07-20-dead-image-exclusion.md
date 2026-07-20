# WB-115 · Exclude products whose vendor image is dead — design

Status: spec · 2026-07-20

## Problem

Products with no usable image are showing up across the store — discovery, the
home "NEW THIS WEEK" row, PDP. The intent (WB-084) was that they never appear
and never get indexed.

The gate exists in both apps but **asks the wrong question**. Backend
[`stageSkipReason`](../../../backend/src/modules/vendor-sync/pipeline/stage.ts)
is `if (!normalized.imageUrl) return "no-image"`; storefront
[`hasImage`](../../../storefront/src/lib/util/has-image.ts) is a string-emptiness
check. Both only ask *"is this string non-empty?"* — neither asks whether the
image actually exists.

## The data (live-probed 2026-07-20, decisive)

Scanned every `product_type IN ["wheel","tire"]` doc in the live Meilisearch
index and HEAD-checked each unique thumbnail URL:

| Measure | Value |
|---|---|
| Wheel/tire docs indexed | 2,852 |
| Docs with an **empty** thumbnail | **0** ← why the current gate catches nothing |
| Unique thumbnail URLs | 1,896 |
| Unique URLs returning 404 | 343 |
| **Docs pointing at a dead URL** | **664 (23%)** — 267 wheels, 397 tires |

The dead URLs are overwhelmingly shared vendor placeholders the distributor
never populated — `m500/mTIRE.png` (64 docs), `mTYOPCQ.png` (48),
`mFTWPK4.png` (36), `mMIPMT.png` (21). Not random rot; systematically absent
imagery for whole product lines.

## Decisions (approved 2026-07-20)

1. **Hide all 664**, wheels and tires alike. Catalog goes ~2,852 → ~2,188 live.
   Reversible: if the vendor ever publishes the image, the product returns on
   the next sync with no manual step.
2. **Per-finish granularity.** Wheels carry one image per finish (WB-059 made
   finish a variant axis). A dead image drops **only that finish's variants**;
   the product is delisted only when *every* one of its rows has a dead image.

## Design

The decisive find: **the existing pipeline already implements both approved
behaviors** — it just never gets the chance, because dead-image rows are staged
as if they were fine. Fixing the gate is the whole feature.

Once a row is dropped at staging, [`diff.ts`](../../../backend/src/modules/vendor-sync/pipeline/diff.ts)
sees it as absent from the feed and the existing paths take over:

| Situation | Diff classifies as | Existing apply behavior | Net effect |
|---|---|---|---|
| Every row in a group has a dead image | `discontinuedGroups` (`stagingParts.length === 0`) | drafts the product, flags variants discontinued | Product **drafted → plugin `deleteDocument` → gone from the index** ✓ decision 1 |
| Some rows dead, some fine | `changedGroups.removed_part_numbers` | drops those variants | Product survives showing only finishes with real imagery ✓ decision 2 |

Eviction is confirmed at the plugin layer —
`upsert-product.js` is `if (!product.status || product.status === 'published')`
→ `addDocuments`, **else → `deleteDocument`**. Drafting genuinely removes the
document, satisfying *"shouldn't even be indexed."*

So the 664 remediate themselves on the next full sync run. **No migration
script and no new delisting code.**

### The one change: reachability at staging

`stageSkipReason` stays **pure and synchronous** (it is unit-tested and shared);
it gains a third input and a third reason:

```ts
stageSkipReason({ imageUrl, msrpUsd, imageReachable })
  -> "no-image" | "image-unreachable" | "invalid-price" | null
```

`stageFeed` resolves `imageReachable` per row via a new checker. It already
batches rows at `BATCH_SIZE = 500`; the checker validates each batch's *unique*
URLs concurrently before the batch is filtered and inserted, so streaming and
bounded memory are preserved. Row→URL is many-to-one, so the in-run cache hit
rate is high (2,852 docs → 1,896 URLs, higher repetition at row level).

### Safety — this feature can empty the catalog if it is wrong

A naive fail-closed gate delists the **entire catalog** the first time the CDN
rate-limits us or goes down. Three non-negotiable guards:

1. **Fail open.** Only a definitive `404`/`410` marks an image dead. Timeout,
   DNS failure, `5xx`, or `429` → treated as reachable, product kept. The
   catalog degrades toward *showing too much*, never toward empty.
2. **Circuit breaker.** If more than `VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO`
   (default `0.40`) of a run's checked URLs come back dead, treat the whole
   check as untrustworthy: stage everything as reachable, log an error, and
   record it on the run. Today's real rate is 18% of unique URLs, so 40% leaves
   headroom while still catching a systemic CDN failure.
3. **Persistent cache with re-check.** New table `vendor_image_check`
   (`url` PK, `last_status`, `last_checked_at`, `consecutive_failures`).
   Known-good URLs re-check at most every 7 days; known-dead re-check every run
   so a product returns automatically once the vendor publishes its image.

### Storefront

No functional change required — the index simply stops carrying these products.
`hasImage()` stays as the last-resort guard for an empty string. Its doc comment
gains a note that it is *not* a reachability check, so the next reader does not
re-make this assumption.

## Verify

- Unit: `stageSkipReason` truth table incl. the new reason; circuit-breaker
  threshold logic; cache TTL/re-check decisions. Backend jest (`pnpm test:sync`,
  382 baseline) must stay green.
- Integration: a dry-run against the real feed reports ~664 rows newly skipped
  as `image-unreachable`, and the diff previews the affected groups — **read
  this before applying.**
- Live: after apply, re-run the audit script; expect 0 dead-URL docs in the
  index and live wheel/tire docs ~2,188.
- Fail-open proof: point the checker at an unreachable host and confirm every
  row still stages (this is the guard that prevents an empty store).

## Deploy

Backend only; storefront unaffected. Ships a migration for
`vendor_image_check`. First run after deploy does the full 1,896-URL check
(a few minutes, one time); later runs mostly hit the cache.

**Sequence: deploy → `vendor-sync:dry-run` → inspect the skip counts and the
discontinued/changed group preview → only then `vendor-sync:apply`.** The
dry-run is the gate; do not let the 12-hourly cron be the first thing that
applies this.

## Out of scope

- A branded placeholder image for tires (considered and declined — decision 1
  hides them instead).
- Validating that a reachable URL is a *valid image* rather than an error page
  served with `200`. Not observed in the probe; revisit if it appears.
- Re-checking Medusa-hosted or admin-uploaded images; this gate covers vendor
  feed URLs only.
