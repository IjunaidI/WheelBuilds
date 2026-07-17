// backend/src/modules/wheel-size/service.ts
import { ulid } from "ulid"
import { MedusaService, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import WheelSizeCatalog from "./models/wheel-size-catalog"
import WheelSizeFitment from "./models/wheel-size-fitment"
import WheelSizeQuota from "./models/wheel-size-quota"
import { WheelSizeClient } from "./client"
import { normalizeByModel } from "./normalize"
import { VehicleFitment, ReverseFitmentVehicle, ReverseTireFitmentVehicle, RawModificationEntry } from "./types"
import { buildReverseFitment, ProductSize } from "./reverse-fitment"
import { buildReverseTireFitment, TireFitSpec } from "./reverse-tire-fitment"
import { isStale } from "./staleness"
import { extractOemTireSizes } from "./oem-tire-sizes"
import { extractOemTires } from "./oem-tires"
import { buildFitmentCacheKey } from "./cache-key"
import { filterEntriesBySubModel, subModelsForModelYear, BASE_SUBMODEL } from "./sub-models"

export class QuotaOutageError extends Error {
  constructor() { super("wheel-size quota outage") ; this.name = "QuotaOutageError" }
}

type Options = { apiKey: string; baseUrl?: string; defaultRegion?: string; dailyCeiling?: number; requestTimeoutMs?: number; ttlDays?: number; warmBatchSize?: number }

class WheelSizeService extends MedusaService({ WheelSizeCatalog, WheelSizeFitment, WheelSizeQuota }) {
  protected logger_: any
  protected options_: Options
  protected client_: WheelSizeClient
  protected ceiling_: number
  protected ttlDays_: number
  protected knex_: any

  constructor(container: any, options: Options) {
    super(...arguments as any)
    this.logger_ = container?.logger ?? console
    this.options_ = options ?? ({} as Options)
    this.ceiling_ = options?.dailyCeiling ?? 5000
    this.ttlDays_ = options?.ttlDays ?? 90
    this.knex_ = container?.[ContainerRegistrationKeys.PG_CONNECTION]
    this.client_ = new WheelSizeClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? "https://api.wheel-size.com/v2",
      timeoutMs: options.requestTimeoutMs ?? 5000,
    })
  }

  private gmtDay(): string {
    // GMT calendar day, no Date.now() in test paths — uses new Date() at runtime only.
    return new Date().toISOString().slice(0, 10)
  }

  async incrementAndCheckQuota(): Promise<boolean> {
    const day = this.gmtDay()
    const id = `wsq_${day.replace(/-/g, "")}`
    // Atomic upsert-increment against the partial unique index (day) WHERE deleted_at IS NULL.
    const result = await this.knex_.raw(
      `insert into "wheel_size_quota" ("id", "day", "count", "created_at", "updated_at")
       values (?, ?, 1, now(), now())
       on conflict ("day") where deleted_at is null
       do update set count = "wheel_size_quota"."count" + 1, "updated_at" = now()
       returning "count"`,
      [id, day]
    )
    // fail-closed: an empty RETURNING is treated as over-quota (deny) rather than allow
    const count = Number(result?.rows?.[0]?.count ?? Number.MAX_SAFE_INTEGER)
    return count <= this.ceiling_
  }

  /**
   * WB-113: `modificationSlug` is kept as a back-compat alias for callers not
   * yet migrated to `subModel` (the by-vehicle store route + the
   * backfill-garage-bore script — Task 2 is service-only, those are Task 3's
   * / out of scope). `subModel` wins when both are supplied. Neither is part
   * of the cache key below — see cache-key.ts / `fitmentForSubModel`.
   */
  async getFitment(p: { make: string; model: string; modificationSlug?: string; subModel?: string; year?: string; region?: string }): Promise<VehicleFitment> {
    const region = p.region ?? this.options_.defaultRegion ?? "usdm"
    const subModel = p.subModel ?? p.modificationSlug
    // WB-113: the sub-model is deliberately NOT part of the cache key — one
    // raw by_model row per make/model/year/region now serves every sub-model
    // of that vehicle. filterEntriesBySubModel + normalizeByModel run at READ
    // time (fitmentForSubModel) over whichever sub-model THIS call asked for.
    const cache_key = buildFitmentCacheKey({ make: p.make, model: p.model, year: p.year, region })

    const cached = await this.listWheelSizeFitments({ cache_key })
    if (cached[0]) {
      const c = cached[0]
      if (isStale(c.fetched_at as any, this.ttlDays_, new Date())) {
        // serve stale immediately; refresh in the background (never awaited)
        void this.refreshFitment({ ...p, region }).catch((e) =>
          this.logger_.warn(`[wheel-size] background refresh failed for ${cache_key}: ${e?.message ?? e}`)
        )
      }
      return this.fitmentForSubModel(c.raw, subModel, c.region ?? region)
    }

    return this.refreshFitment({ ...p, region })
  }

  /**
   * WB-113: turn a broad (unfiltered) by_model body into a VehicleFitment for
   * ONE requested sub-model. `filterEntriesBySubModel` narrows `body.data` to
   * the entries whose `trim_levels` include it ("Base"/undefined/"" → ALL
   * entries, its own no-narrow case); `normalizeByModel` then runs over that
   * subset UNCHANGED — it already unions bolt patterns across N entries and
   * does bore-agree-or-null, so a sub-model spanning 2 engine entries (e.g. a
   * truck's "LT" under gas+diesel) correctly unions both.
   *
   * A real, non-Base sub-model that matches NOTHING (defensive: shouldn't
   * happen if the dropdown was built off the same union this filters
   * against, but that union is a separately lazy-cached `/modifications`
   * fetch that can drift from a warmed `by_model` row) falls back to ALL
   * entries rather than resolving nothing — logged via `logger.warn` so the
   * fallback is never silent (mirrors WB-104 T3's operator-visibility rule
   * for the old modification-narrowing fallback this replaces).
   *
   * Shared by the fresh-fetch path (`resolveByModel`, right after a network
   * call) AND the warm cache-hit read path (`getFitment`, using the cached
   * `raw` column) — caching the RAW body at make/model/year/region (the
   * sub-model dropped from the cache key, see cache-key.ts) means both call
   * sites can re-derive ANY sub-model's result from the SAME stored data,
   * with no second network fetch for a different sub-model of an
   * already-cached vehicle.
   */
  private fitmentForSubModel(body: any, subModel: string | undefined, region: string): VehicleFitment {
    const allEntries = Array.isArray(body?.data) ? body.data : []
    const isNarrowRequest = subModel !== undefined && subModel !== "" && subModel !== BASE_SUBMODEL
    let entries = filterEntriesBySubModel(allEntries, subModel)
    let trimNarrowed: boolean | undefined = isNarrowRequest ? true : undefined
    if (isNarrowRequest && entries.length === 0 && allEntries.length > 0) {
      this.logger_.warn(
        `[wheel-size] sub-model "${subModel}" matched no entries for this vehicle; falling back to all entries`
      )
      entries = allEntries
      trimNarrowed = false
    }
    const fitment = normalizeByModel({ data: entries }, { modificationSlug: subModel ?? "", region, trimNarrowed })
    return { ...fitment, oemTireSizes: extractOemTireSizes(body), oemTires: extractOemTires(body) }
  }

  /**
   * Fetch live + upsert the cache row by cache_key. Returns the fresh fitment
   * for the REQUESTED sub-model (or "Base"/all-entries when none/absent).
   *
   * WB-113: the persisted row is sub-model-AGNOSTIC — `raw` is the full
   * broad body, and its precomputed derived columns (`canonical_bolt_patterns`
   * etc.) are always the Base/all-entries snapshot, NEVER narrowed to
   * whichever sub-model happened to trigger this fetch, because the cache
   * key dropped the sub-model slot (see cache-key.ts) — the row is now
   * shared across every sub-model of this make/model/year/region.
   * `reverseFitment`/`reverseTireFitment` + the warm cron read these columns
   * directly with no sub-model awareness, so they must stay the full
   * superset. Only this method's RETURN VALUE reflects the caller's specific
   * sub-model, via `fitmentForSubModel`.
   */
  async refreshFitment(p: { make: string; model: string; modificationSlug?: string; subModel?: string; year?: string; region: string }): Promise<VehicleFitment> {
    const subModel = p.subModel ?? p.modificationSlug
    const cache_key = buildFitmentCacheKey({ make: p.make, model: p.model, year: p.year, region: p.region })
    const { body, regionUsed, fitment } = await this.resolveByModel({ make: p.make, model: p.model, year: p.year, region: p.region, subModel })
    const baseFitment = normalizeByModel(body, { modificationSlug: "", region: regionUsed })
    const row = {
      cache_key, region: regionUsed, raw: body,
      canonical_bolt_patterns: baseFitment.canonicalBoltPatterns as unknown as Record<string, unknown>,
      hub_bore_mm_x100: baseFitment.hubBoreMm == null ? null : Math.round(baseFitment.hubBoreMm * 100),
      diameter_window: baseFitment.diameterWindow, width_window: baseFitment.widthWindow, offset_window: baseFitment.offsetWindow,
      status: baseFitment.status, fetched_at: new Date(),
    }
    await this.upsertFitmentRow(row)
    return fitment
  }

  /**
   * Atomic upsert of a fitment cache row keyed by cache_key, against the partial
   * unique index `IDX_wheel_size_fitment_cache_key_unique` (WHERE deleted_at IS NULL —
   * see Migration20260601111311). Mirrors incrementAndCheckQuota's ON CONFLICT pattern:
   * a plain list-then-create/update lets two concurrent cache misses on the same
   * cache_key both observe "not found", both INSERT, and have the loser hit the
   * unique-violation as an uncaught 500 (WB-072 B8). Folding the write into a single
   * INSERT ... ON CONFLICT DO UPDATE removes that race entirely.
   *
   * JSON columns (raw, canonical_bolt_patterns, *_window) are explicitly
   * JSON.stringify'd before binding: the `pg` driver's parameter serializer treats a
   * bare JS array as a Postgres ARRAY literal (`{a,b,c}`), not a JSON array, which
   * would fail the `::jsonb` cast — arrays/objects must be pre-stringified.
   */
  private async upsertFitmentRow(row: {
    cache_key: string
    region: string
    raw: unknown
    canonical_bolt_patterns: unknown
    hub_bore_mm_x100: number | null
    diameter_window: unknown
    width_window: unknown
    offset_window: unknown
    status: string
    fetched_at: Date
  }): Promise<void> {
    const id = `wsf_${ulid()}`
    const json = (v: unknown) => (v == null ? null : JSON.stringify(v))
    await this.knex_.raw(
      `insert into "wheel_size_fitment"
         ("id", "cache_key", "region", "raw", "canonical_bolt_patterns", "hub_bore_mm_x100",
          "diameter_window", "width_window", "offset_window", "status", "fetched_at", "created_at", "updated_at")
       values (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, now(), now())
       on conflict ("cache_key") where deleted_at is null
       do update set
         "region" = excluded.region,
         "raw" = excluded.raw,
         "canonical_bolt_patterns" = excluded.canonical_bolt_patterns,
         "hub_bore_mm_x100" = excluded.hub_bore_mm_x100,
         "diameter_window" = excluded.diameter_window,
         "width_window" = excluded.width_window,
         "offset_window" = excluded.offset_window,
         "status" = excluded.status,
         "fetched_at" = excluded.fetched_at,
         "updated_at" = now()`,
      [
        id, row.cache_key, row.region, json(row.raw), json(row.canonical_bolt_patterns),
        row.hub_bore_mm_x100, json(row.diameter_window), json(row.width_window), json(row.offset_window),
        row.status, row.fetched_at,
      ]
    )
  }

  /**
   * Reverse fitment: cached vehicles confirmed to fit a product (bolt pattern
   * intersection + wheel bore clears the hub + PLUS an in-window size when
   * `productSizes` is supplied — WB-072 S2, keeps this list in agreement with
   * the active-vehicle band). Pure cache read — no wheel-size API calls, so no
   * quota impact. `raw` supplies the display identity.
   */
  async reverseFitment(p: { canonicalBoltPatterns: string[]; wheelBoreMm?: number | (number | null)[] | null; limit?: number; productSizes?: ProductSize[] }): Promise<ReverseFitmentVehicle[]> {
    const rows = await this.listWheelSizeFitments({ status: "ok" })
    // model.json() columns are Record<string, unknown>; buildReverseFitment reads
    // canonical_bolt_patterns / *_window as the shapes we persisted.
    return buildReverseFitment(
      rows as unknown as Parameters<typeof buildReverseFitment>[0],
      p.canonicalBoltPatterns,
      p.wheelBoreMm ?? null,
      p.limit ?? 24,
      p.productSizes ?? []
    )
  }

  /**
   * Reverse tire fitment: cached vehicles whose factory (OEM) tire — size, load
   * index, and speed rating, meet-or-exceed — is satisfied by some spec on the
   * product. Pure cache read — no wheel-size API calls, no quota.
   */
  async reverseTireFitment(p: { productSpecs: TireFitSpec[]; limit?: number }): Promise<ReverseTireFitmentVehicle[]> {
    const rows = await this.listWheelSizeFitments({ status: "ok" })
    return buildReverseTireFitment(
      rows as unknown as Parameters<typeof buildReverseTireFitment>[0],
      p.productSpecs,
      p.limit ?? 24
    )
  }

  // wheel-size tags fitment by market region (usdm, eudm, jdm, chdm, …). A vehicle
  // not sold in the requested region comes back with empty `data`, but its
  // `meta.regions` map still reports which regions DO have records (and how many).
  // So: try the requested region first; if it is empty, probe the other regions it
  // reports — most-populated first — until one returns a record with a usable bolt
  // pattern (the thing we actually filter wheels by). Returns the chosen raw body,
  // the region it came from, and the sub-model-filtered fitment for the caller's
  // requested sub-model (via `fitmentForSubModel`).
  //
  // Classification (spec §10): any non-2xx on the requested region => outage (folded
  // into the storefront's "fitment unavailable" 503). A non-2xx on a *fallback*
  // probe is non-fatal — we skip that region and keep trying.
  //
  // WB-113: always fetches BROAD (no `modification` query param at all, regardless
  // of `p.subModel`) — the sub-model axis narrows LOCALLY, post-fetch, via
  // `fitmentForSubModel`, not via an upstream query param. This replaces the old
  // modification-narrowed-primary-fetch + same-region no-trim retry entirely: since
  // no narrowing param is ever sent, there is nothing to discard and retry — a
  // sub-model that fails to match is instead handled by `fitmentForSubModel`'s own
  // local fallback-to-all-entries. One broad fetch per (make,model,year,region) now
  // serves every sub-model of that vehicle (see `getFitment`'s cache-hit path,
  // which reuses this same raw body without a second network call).
  private async resolveByModel(p: { make: string; model: string; subModel?: string; year?: string; region: string }): Promise<{ body: any; regionUsed: string; fitment: VehicleFitment }> {
    if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()
    const primary = await this.client_.byModel({ make: p.make, model: p.model, year: p.year, region: p.region })
    if (primary.status >= 300) throw new QuotaOutageError()
    if (this.hasData(primary.body)) {
      return { body: primary.body, regionUsed: p.region, fitment: this.fitmentForSubModel(primary.body, p.subModel, p.region) }
    }

    let firstWithData: { body: any; regionUsed: string } | null = null
    for (const region of this.otherRegionsWithData(primary.body, p.region)) {
      if (!(await this.incrementAndCheckQuota())) {
        // Out of daily quota mid-lookup. If an earlier (already-paid-for) probe in
        // this same loop already found usable data (firstWithData), surface that —
        // discarding it here would turn an already-found result into a needless
        // outage. Only throw when nothing has been found yet.
        if (firstWithData) {
          return { ...firstWithData, fitment: this.fitmentForSubModel(firstWithData.body, p.subModel, firstWithData.regionUsed) }
        }
        throw new QuotaOutageError()
      }
      let res: any
      try {
        res = await this.client_.byModel({ make: p.make, model: p.model, year: p.year, region })
      } catch { continue }
      if (res.status >= 300 || !this.hasData(res.body)) continue
      if (!firstWithData) firstWithData = { body: res.body, regionUsed: region }
      if (this.hasBoltPattern(res.body)) {
        return { body: res.body, regionUsed: region, fitment: this.fitmentForSubModel(res.body, p.subModel, region) } // filterable — done
      }
    }
    // Prefer any region that returned data (even without a bolt pattern); else the
    // empty primary body, which normalizes to not_found.
    const chosen = firstWithData ?? { body: primary.body, regionUsed: p.region }
    return { ...chosen, fitment: this.fitmentForSubModel(chosen.body, p.subModel, chosen.regionUsed) }
  }

  private hasData(body: any): boolean {
    return Array.isArray(body?.data) && body.data.length > 0
  }
  private hasBoltPattern(body: any): boolean {
    const t = body?.data?.[0]?.technical
    return typeof t?.stud_holes === "number" && Number.isFinite(t.stud_holes) &&
           typeof t?.pcd === "number" && Number.isFinite(t.pcd)
  }
  private otherRegionsWithData(body: any, requested: string): string[] {
    const regions = body?.meta?.regions
    if (!regions || typeof regions !== "object") return []
    return Object.entries(regions)
      .filter(([k, v]) => k !== "limit" && k !== requested && typeof v === "number" && (v as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number)) // most-populated first
      .map(([k]) => k)
  }

  // Cataloging (lazy read-through + SWR). Same read→miss→write→cache shape; payload stored verbatim.
  private async catalog(kind: string, key: string, fetcher: () => Promise<any>): Promise<any> {
    const hit = await this.listWheelSizeCatalogs({ kind, key })
    if (hit[0]) {
      if (isStale(hit[0].fetched_at as any, this.ttlDays_, new Date())) {
        // serve stale immediately; refresh in the background (never awaited).
        // This is a billable call too, so it counts quota the same as a miss —
        // and its failure (incl. QuotaOutageError) must never reach the caller.
        void (async () => {
          if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()
          const res = await fetcher()
          if (res.status >= 300) throw new QuotaOutageError()
          await this.updateWheelSizeCatalogs({ id: hit[0].id, kind, key, payload: res.body, fetched_at: new Date() })
        })().catch((e) =>
          this.logger_.warn(`[wheel-size] background catalog refresh failed for ${kind}:${key}: ${e?.message ?? e}`)
        )
      }
      return hit[0].payload
    }
    if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()
    const res = await fetcher()
    if (res.status >= 300) throw new QuotaOutageError()
    await this.createWheelSizeCatalogs({ kind, key, payload: res.body, fetched_at: new Date() })
    return res.body
  }
  listMakes() { return this.catalog("makes", "all", () => this.client_.makes()) }
  listModels(make: string) { return this.catalog("models", make, () => this.client_.models(make)) }
  listYears(make: string, model: string) { return this.catalog("years", `${make}|${model}`, () => this.client_.years(make, model)) }
  // WB-104 T3: region-scoped (additive default "usdm"). The storefront's trim
  // dropdown was reading the GLOBAL modifications catalog while fitment queries
  // are region-scoped (usdm) — a non-US trim could be offered for a US vehicle and
  // then silently fail to resolve. Cache key gains a 4th slot; old 3-part rows
  // simply orphan and self-heal on next read (same non-breaking pattern as the
  // fitment cache key's WB-077 "v2" bump).
  //
  // WB-113: returns the sub-model (`trim_levels`) UNION for the dropdown — a plain
  // `string[]` — instead of the raw engine-modification catalog entries. Still the
  // same cheap/lazy-cached `/modifications` fetch (unchanged); only what's derived
  // from the cached/fetched payload changes. The underlying catalog cache still
  // stores the raw payload verbatim (`catalog()` is unchanged), so other callers of
  // that cache row are unaffected.
  async listModifications(make: string, model: string, year: string, region: string = "usdm"): Promise<string[]> {
    const payload = await this.catalog("modifications", `${make}|${model}|${year}|${region}`, () => this.client_.modifications(make, model, year, region))
    const entries: RawModificationEntry[] = Array.isArray(payload?.data) ? payload.data : []
    return subModelsForModelYear(entries)
  }
}
export default WheelSizeService
