// backend/src/modules/wheel-size/service.ts
import { ulid } from "ulid"
import { MedusaService, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import WheelSizeCatalog from "./models/wheel-size-catalog"
import WheelSizeFitment from "./models/wheel-size-fitment"
import WheelSizeQuota from "./models/wheel-size-quota"
import { WheelSizeClient } from "./client"
import { normalizeByModel } from "./normalize"
import { VehicleFitment, ReverseFitmentVehicle, ReverseTireFitmentVehicle, Window } from "./types"
import { buildReverseFitment, ProductSize } from "./reverse-fitment"
import { buildReverseTireFitment, TireFitSpec } from "./reverse-tire-fitment"
import { isStale } from "./staleness"
import { extractOemTireSizes } from "./oem-tire-sizes"
import { extractOemTires } from "./oem-tires"
import { buildFitmentCacheKey } from "./cache-key"

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

  async getFitment(p: { make: string; model: string; modificationSlug?: string; year?: string; region?: string }): Promise<VehicleFitment> {
    const region = p.region ?? this.options_.defaultRegion ?? "usdm"
    const cache_key = buildFitmentCacheKey({ ...p, region })

    const cached = await this.listWheelSizeFitments({ cache_key })
    if (cached[0]) {
      const c = cached[0]
      if (isStale(c.fetched_at as any, this.ttlDays_, new Date())) {
        // serve stale immediately; refresh in the background (never awaited)
        void this.refreshFitment({ ...p, region }).catch((e) =>
          this.logger_.warn(`[wheel-size] background refresh failed for ${cache_key}: ${e?.message ?? e}`)
        )
      }
      return this.toFitment(c, region, p.modificationSlug)
    }

    return this.refreshFitment({ ...p, region })
  }

  /** Map a cache row to the VehicleFitment read contract. */
  private toFitment(c: any, region: string, modificationSlug?: string): VehicleFitment {
    return {
      status: c.status as VehicleFitment["status"],
      canonicalBoltPatterns: (c.canonical_bolt_patterns as unknown as string[]) ?? [],
      hubBoreMm: c.hub_bore_mm_x100 == null ? null : (c.hub_bore_mm_x100 as number) / 100,
      diameterWindow: (c.diameter_window as unknown as Window) ?? null,
      widthWindow: (c.width_window as unknown as Window) ?? null,
      offsetWindow: (c.offset_window as unknown as Window) ?? null,
      oemTireSizes: extractOemTireSizes(c.raw),
      oemTires: extractOemTires(c.raw),
      source: { modificationSlug: modificationSlug ?? "", region: c.region ?? region },
    }
  }

  /** Fetch live + upsert the cache row by cache_key. Returns the fresh fitment. */
  async refreshFitment(p: { make: string; model: string; modificationSlug?: string; year?: string; region: string }): Promise<VehicleFitment> {
    const cache_key = buildFitmentCacheKey(p)
    const { body, regionUsed } = await this.resolveByModel(p)
    const fitment = normalizeByModel(body, { modificationSlug: p.modificationSlug ?? "", region: regionUsed })
    const row = {
      cache_key, region: regionUsed, raw: body,
      canonical_bolt_patterns: fitment.canonicalBoltPatterns as unknown as Record<string, unknown>,
      hub_bore_mm_x100: fitment.hubBoreMm == null ? null : Math.round(fitment.hubBoreMm * 100),
      diameter_window: fitment.diameterWindow, width_window: fitment.widthWindow, offset_window: fitment.offsetWindow,
      status: fitment.status, fetched_at: new Date(),
    }
    await this.upsertFitmentRow(row)
    return { ...fitment, oemTireSizes: extractOemTireSizes(body), oemTires: extractOemTires(body) }
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
  async reverseFitment(p: { canonicalBoltPatterns: string[]; wheelBoreMm?: number | null; limit?: number; productSizes?: ProductSize[] }): Promise<ReverseFitmentVehicle[]> {
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
  // pattern (the thing we actually filter wheels by). Returns the chosen raw body
  // and the region it came from.
  //
  // Classification (spec §10): any non-2xx on the requested region => outage (folded
  // into the storefront's "fitment unavailable" 503). A non-2xx on a *fallback*
  // probe is non-fatal — we skip that region and keep trying.
  private async resolveByModel(p: { make: string; model: string; modificationSlug?: string; year?: string; region: string }): Promise<{ body: any; regionUsed: string }> {
    if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()
    const primary = await this.client_.byModel({ make: p.make, model: p.model, modification: p.modificationSlug, year: p.year, region: p.region })
    if (primary.status >= 300) throw new QuotaOutageError()
    if (this.hasData(primary.body)) return { body: primary.body, regionUsed: p.region }

    // Empty in the requested region. If a trim slug was sent, the trim — not the
    // region — may be why: the storefront's trim dropdown is the GLOBAL wheel-size
    // catalog, so a US car can carry a non-US trim slug that yields no usdm match.
    // Retry the SAME region without the trim before crossing markets, so a US car
    // stays on US data. emptyBody then carries the broader make+model+year
    // meta.regions, a better fallback hint than the trim-narrowed one.
    let emptyBody = primary.body
    if (p.modificationSlug) {
      if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()
      const broad = await this.client_.byModel({ make: p.make, model: p.model, year: p.year, region: p.region })
      if (broad.status < 300 && this.hasData(broad.body)) return { body: broad.body, regionUsed: p.region }
      if (broad.status < 300) emptyBody = broad.body
    }

    let firstWithData: { body: any; regionUsed: string } | null = null
    for (const region of this.otherRegionsWithData(emptyBody, p.region)) {
      if (!(await this.incrementAndCheckQuota())) {
        // Out of daily quota mid-lookup. If an earlier (already-paid-for) probe in
        // this same loop already found usable data (firstWithData), surface that —
        // discarding it here would turn an already-found result into a needless
        // outage. Only throw when nothing has been found yet.
        if (firstWithData) return firstWithData
        throw new QuotaOutageError()
      }
      let res: any
      try {
        // Drop the modification slug — it is region-specific (a usdm trim slug won't
        // resolve in an eudm/jdm catalog), so query the broadest make+model+year.
        res = await this.client_.byModel({ make: p.make, model: p.model, year: p.year, region })
      } catch { continue }
      if (res.status >= 300 || !this.hasData(res.body)) continue
      if (!firstWithData) firstWithData = { body: res.body, regionUsed: region }
      if (this.hasBoltPattern(res.body)) return { body: res.body, regionUsed: region } // filterable — done
    }
    // Prefer any region that returned data (even without a bolt pattern); else the
    // empty primary body, which normalizes to not_found.
    return firstWithData ?? { body: primary.body, regionUsed: p.region }
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
  listModifications(make: string, model: string, year: string) {
    return this.catalog("modifications", `${make}|${model}|${year}`, () => this.client_.modifications(make, model, year))
  }
}
export default WheelSizeService
