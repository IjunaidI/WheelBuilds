# Vendor Sync — Open Questions, Answered

> _Corrected 2026-06-17 — see [docs/STATUS.md](../../STATUS.md). Original was pre-rename / pre-cents-fix; preserved as historical record below._

Audit trail for the eight open questions surfaced before producing `VENDOR_SYNC_PLAN.md`. Each question records the asked options and the user's answer. Decisions here are referenced from the plan by `OQ#`.

Date asked / answered: 2026-05-17.

---

## OQ1. Selling price column

**Question:** Which CSV column should drive the selling price stored on the Medusa variant?

**Options offered:**
- `MSRP_USD` always (default assumption)
- `MAP_USD` when > 0, else `MSRP_USD`
- Configurable per `InvOrderType` (ST = MAP, N2 = MSRP)

**Answer:** **`MSRP_USD` always.** `MAP_USD` is stored on the product as `metadata.vendor_map_usd` for downstream merchandising decisions but is not enforced as a price floor in Phase 1. This avoids any rule that depends on `InvOrderType` until we have a clearer commercial policy.

**Where applied:** Plan §1 row Q1; §5.1 (workflow input mapping); §11.3 (normalize tests).

---

## OQ2. Image policy (REVISED)

**Original question:** How should we handle product images in Phase 1?

**Original answer:** Skip entirely.

**Revised decision (2026-05-18):** The user decided that **products missing crucial information should be skipped entirely, and ImageURL is a required field.** This overrides the original "skip images" answer with two new rules:

1. **Rows with empty `ImageURL` are dropped during staging.** They are counted as `skipped_no_image_count` on the run row but never enter the diff or apply pipeline. This applies equally to both wheel and tire feeds.
2. **Products that pass the filter use the vendor CDN URL as a pass-through.** The product's `thumbnail` and `images[0].url` are set to the vendor URL directly (e.g. `https://images.wheelpros.com/m500/mFTWPK4.png`). No download, no MinIO upload. A future phase will switch to downloading images to MinIO for CDN independence.

**Impact:** In the sample files, the wheel CSV has zero ImageURL values (all 9 rows would be skipped) and the tire CSV has 4 of 11 rows with images. The user accepted this — if the full production feed also lacks wheel images, the wheel catalog will be empty until the vendor populates them or the rule is relaxed. Risk R11 in the plan captures this.

**Where applied:** Plan §1 row Q2 (revised); §3.1 (`skipped_no_image_count` column on `vendor_feed_run`); §5.1 (`thumbnail` and `images` in product creation input); §7 step 4 (staging filter); §12 (observability — skip count logged and emitted as metric).

---

## OQ3. Brand handling

**Question:** How should the wheel brand be modeled in Medusa?

**Options offered:**
- Product collection (one collection per brand)
- Top-level product category
- Metadata field only

**Answer:** **Product collection.** One Medusa `product_collection` per unique brand string from the CSV. Created idempotently on first appearance by the bootstrap step. Brand is also stored as `metadata.vendor_brand` for filtering, but the collection is the canonical anchor for brand-level merchandising and storefront landing pages.

**Where applied:** Plan §1 row Q3; §5.1 (`collection_id: brandCollectionId` in product upsert input); `pipeline/bootstrap.ts:ensureBrandCollection`.

---

## OQ4. Stock location naming

**Question:** How should we name and provision stock locations for each warehouse code (1001, 1002, ...)?

**Options offered:**
- Auto-create as `Warehouse <code>`, admin renames in admin UI
- Refuse to apply if an unknown warehouse code appears
- Use a user-supplied mapping file (code → name + address)

**Answer:** **Auto-create as `Warehouse <code>`.** The first time a new warehouse code appears in the feed, the sync auto-creates a Medusa stock location with `name = "Warehouse <code>"` and `metadata.vendor_warehouse_code = <code>`. Admin can rename the display in the Medusa admin without breaking the sync, because the matching key is the metadata field, not the name.

**Where applied:** Plan §1 row Q4; §5.2 (stock workflow lookup); `pipeline/bootstrap.ts:ensureStockLocation`; risk R6 (drift on display-name renames).

---

## OQ5. SFTP credentials and source

**Question:** What is the state of the vendor SFTP source right now?

**Options offered:**
- Mock against local CSV for Phase 1
- Provide SFTP credentials now and use real SFTP from day one
- Vendor delivers feed via HTTPS/S3/other mechanism

**Answer:** **Mock against local CSV for Phase 1.** Phase 1 reads the file from `VENDOR_WHEELPROS_WHEEL_FEED_PATH` (defaults to `./wheelInvPriceData.csv`). The `VendorAdapter.fetch()` abstraction makes the SFTP swap a tiny follow-up PR — only `pipeline/fetch.ts` and the adapter's `fetch()` method change. SFTP env var names are reserved in `.env.template` and `constants.ts` from PR 1 so the swap doesn't touch the registration boilerplate.

**Where applied:** Plan §1 row Q5; §4 (WheelProsAdapter sketch using `fs.readFile`); §9 (placeholder env vars); §13 PR 2 acceptance.

---

## OQ6. Initial bootstrap workflow

**Question:** How should the very first ingestion run be performed?

**Options offered:**
- Manual dry-run script → review → manual apply by run id → enable cron
- Direct: enable cron and let the first scheduled run create everything
- Phased: dry-run, then apply a small subset, then full catalog

**Answer:** **Manual dry-run, then apply, then cron.** Concretely:
1. `pnpm vendor-sync:dry-run wheelpros-wheels` — fetches, parses, stages, diffs, prints summary. No Medusa mutations.
2. User reviews the run row in the admin UI (`GET /admin/vendor-sync/runs/<id>`).
3. `pnpm vendor-sync:apply <run-id>` — applies that exact run.
4. Once the result is verified good, set `VENDOR_WHEELPROS_WHEELS_ENABLED=true` and the cron takes over.

**Where applied:** Plan §1 row Q6; §11 (test strategy); §13 PR 2/3/4 acceptance criteria; PR 8 enables the cron.

---

## OQ7. Cron timing and concurrency policy

**Question:** What cron schedule and concurrency policy do we ship with?

**Options offered:**
- Every 12h with skip-if-running guard
- Hourly poll, only ingest if `RunDate` changed
- Manual trigger only

**Answer:** **Every 12h with skip-if-running guard.** Cron expression `0 */12 * * *` (00:00 and 12:00 UTC). Before fetching, the service checks for any in-progress `vendor_feed_run` for the vendor and exits cleanly if found. `RunDate` short-circuit also applies — if the vendor hasn't republished, the tick completes with all counts at 0. If we later need closer-to-real-time freshness, switching to hourly RunDate-polling is a one-line cron change.

**Where applied:** Plan §1 row Q7; §7 (cron handler); §13 PR 8.

---

## OQ8. Region, currency, and sales channel

**Question:** What region and sales channel should new wheel products be attached to?

**Options offered:**
- Add a new US region with USD, attach to existing `Default Sales Channel`
- Reuse existing Europe/EUR region with USD added
- User creates region and sales channel manually before first run

**Answer:** **Add a new US region with USD and attach to `Default Sales Channel`.** Bootstrap step idempotently ensures a Medusa region with `name = "United States"`, `currency_code: 'usd'`, `country_codes: ['us']` exists; reuses the existing `Default Sales Channel` (created by the boilerplate's seed); attaches every new wheel product to it. Existing demo products from the boilerplate seed (T-Shirt, Sweatshirt, etc.) stay attached to the Europe region and are unaffected.

**Where applied:** Plan §1 row Q8; §5.1 (product workflow input); `pipeline/bootstrap.ts:ensureUsRegion`.

---

## OQ9. Tire adapter scope

**Question:** Should the tire adapter be implemented in Phase 1 alongside the wheel adapter, or just architected for?

**Options offered:**
- Implement both in Phase 1
- Architect for tires, implement only wheels

**Answer:** **Implement both in Phase 1.** Both CSVs come from the same vendor/distributor system (identical warehouse codes 1001-1088, same pricing structure, same RunDate format). The tire adapter is a second parser + normalizer — incremental effort on top of the shared pipeline infrastructure. Shipping both means the storefront has a complete wheel-and-tire catalog from day one.

**Where applied:** Plan §1 row Q9; §2 (module layout adds `wheelpros-tires/` directory); §4 (discriminated union); §13 PR 2b.

---

## OQ10. Product categorization

**Question:** How should wheels and tires be organized in Medusa?

**Options offered:**
- Top-level product categories: Wheels and Tires
- Single category with type in metadata only

**Answer:** **Top-level product categories.** Two Medusa product categories created idempotently by the bootstrap step: `Wheels` and `Tires`. Each product is assigned to one based on its adapter's `productType`. Brand remains a product collection (orthogonal — a brand like Falken is a collection, not a category). The category tree is reserved for future sub-categories (wheel sizes, tire types, etc.).

**Where applied:** Plan §1 row Q10; §5.1 (`category_ids: [categoryId]` in product upsert); `pipeline/bootstrap.ts:ensureProductCategories`.

---

## OQ11. Adapter registration

**Question:** How should we register wheel vs tire feeds from the same vendor/distributor?

**Options offered:**
- Two adapter instances: `wheelpros-wheels` and `wheelpros-tires`
- One adapter handling both CSVs in one run

**Answer:** **Two adapter instances.** Each has its own `vendorCode`, feed path env var, and independent dry-run/apply cycle. They run independently in the cron. `vendor_product_current` uses `(vendor_code, part_number)` as the unique key, guaranteeing zero collision even if a part_number appeared in both feeds. Clean separation — easy to enable/disable one without the other.

**Where applied:** Plan §1 row Q11; §2 (separate adapter directories); §4 (two adapter classes); §9 (separate env vars `VENDOR_WHEELPROS_WHEELS_ENABLED` / `VENDOR_WHEELPROS_TIRES_ENABLED`); §13 PR 2 and PR 2b.

---

## OQ12. Tire-specific fields

**Question:** What is the tire CSV `Division` column (values 10, 20)? Should `SO` (special order) be treated same as `N2`?

**Options offered:**
- Store Division as metadata, treat SO same as N2
- User knows what Division means and will specify

**Answer:** **Store Division as metadata, treat SO same as N2.** Division is a vendor-internal product line or sourcing code. Stored as `metadata.vendor_division` for future reference. `InvOrderType = 'SO'` treated identically to `N2` for all downstream purposes (shipping speed display, ordering eligibility) until a concrete commercial reason to differentiate arises.

**Where applied:** Plan §1 row Q12; §4 (`NormalizedRecordBase.invOrderType` includes `'SO'`; `TireNormalizedRecord.division`); tire-normalize tests.

---

## Cross-cutting notes

- The brand collection (OQ3) and stock locations (OQ4) are both bootstrapped lazily — created on first appearance during a sync run, not in a one-shot seed script. This keeps the sync self-contained and avoids drift between an explicit seed and the live feed.
- The price column (OQ1) and the revised image policy (OQ2) together mean a product in Phase 1 is: title + vendor CDN image + brand collection + category (Wheels or Tires) + type-specific dimensions metadata + one USD price + per-warehouse stock. Only products with a populated `ImageURL` are imported. In the sample data this means zero wheel products (no images) and 4 tire products. The full production feed may differ — the dry-run output makes this visible before any apply.
- The dry-run-first workflow (OQ6) plus the discontinue threshold (architectural decision A10) are two independent guard rails: OQ6 protects against the *first* run; A10 protects every subsequent run.
- The two adapters (OQ11) share the same pipeline infrastructure but run independently. The dry-run + apply workflow happens separately for each: `pnpm vendor-sync:dry-run wheelpros-wheels`, review, apply, then `pnpm vendor-sync:dry-run wheelpros-tires`, review, apply. The cron runs both on the same 12h schedule but each has its own in-progress guard.
- Tire description parsing (OQ12) is the one area with meaningful uncertainty. The regex-based parser covers the three patterns visible in the sample (`235/55ZR17`, `LT37X12.50R18`, `12.4-24 8PR`), but the full 45k-row feed will contain formats not in the sample. The plan mitigates this by making unparsed dimensions produce `null` (not errors) and logging WARN so the patterns can be extended before apply.
