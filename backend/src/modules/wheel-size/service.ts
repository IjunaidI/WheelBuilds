// backend/src/modules/wheel-size/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import WheelSizeCatalog from "./models/wheel-size-catalog"
import WheelSizeFitment from "./models/wheel-size-fitment"
import WheelSizeQuota from "./models/wheel-size-quota"
import { WheelSizeClient } from "./client"
import { normalizeByModel } from "./normalize"
import { VehicleFitment, ReverseFitmentVehicle, Window } from "./types"
import { buildReverseFitment } from "./reverse-fitment"
import { isStale } from "./staleness"

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

  constructor(container: any, options: Options) {
    super(...arguments as any)
    this.logger_ = container?.logger ?? console
    this.options_ = options ?? ({} as Options)
    this.ceiling_ = options?.dailyCeiling ?? 5000
    this.ttlDays_ = options?.ttlDays ?? 90
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
    const rows = await this.listWheelSizeQuotas({ day })
    const current = rows[0]
    if (!current) { await this.createWheelSizeQuotas({ day, count: 1 }); return 1 <= this.ceiling_ }
    const next = (current.count ?? 0) + 1
    await this.updateWheelSizeQuotas({ id: current.id, count: next })
    return next <= this.ceiling_
  }

  async getFitment(p: { make: string; model: string; modificationSlug?: string; year?: string; region?: string }): Promise<VehicleFitment> {
    const region = p.region ?? this.options_.defaultRegion ?? "usdm"
    const cache_key = [p.make, p.model, (p.modificationSlug ?? p.year ?? ""), region].join("|")

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
      source: { modificationSlug: modificationSlug ?? "", region: c.region ?? region },
    }
  }

  /** Fetch live + upsert the cache row by cache_key. Returns the fresh fitment. */
  async refreshFitment(p: { make: string; model: string; modificationSlug?: string; year?: string; region: string }): Promise<VehicleFitment> {
    const cache_key = [p.make, p.model, (p.modificationSlug ?? p.year ?? ""), p.region].join("|")
    const { body, regionUsed } = await this.resolveByModel(p)
    const fitment = normalizeByModel(body, { modificationSlug: p.modificationSlug ?? "", region: regionUsed })
    const row = {
      cache_key, region: regionUsed, raw: body,
      canonical_bolt_patterns: fitment.canonicalBoltPatterns as unknown as Record<string, unknown>,
      hub_bore_mm_x100: fitment.hubBoreMm == null ? null : Math.round(fitment.hubBoreMm * 100),
      diameter_window: fitment.diameterWindow, width_window: fitment.widthWindow, offset_window: fitment.offsetWindow,
      status: fitment.status, fetched_at: new Date(),
    }
    const existing = await this.listWheelSizeFitments({ cache_key })
    if (existing[0]) await this.updateWheelSizeFitments({ id: existing[0].id, ...row })
    else await this.createWheelSizeFitments(row)
    return fitment
  }

  /**
   * Reverse fitment: cached vehicles confirmed to fit a product (bolt pattern
   * intersection + wheel bore clears the hub). Pure cache read — no wheel-size
   * API calls, so no quota impact. `raw` supplies the display identity.
   */
  async reverseFitment(p: { canonicalBoltPatterns: string[]; wheelBoreMm?: number | null; limit?: number }): Promise<ReverseFitmentVehicle[]> {
    const rows = await this.listWheelSizeFitments({ status: "ok" })
    // model.json() columns are Record<string, unknown>; buildReverseFitment reads
    // canonical_bolt_patterns as the string[] we persisted.
    return buildReverseFitment(
      rows as unknown as Parameters<typeof buildReverseFitment>[0],
      p.canonicalBoltPatterns,
      p.wheelBoreMm ?? null,
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
      if (!(await this.incrementAndCheckQuota())) return { body: emptyBody, regionUsed: p.region }
      const broad = await this.client_.byModel({ make: p.make, model: p.model, year: p.year, region: p.region })
      if (broad.status < 300 && this.hasData(broad.body)) return { body: broad.body, regionUsed: p.region }
      if (broad.status < 300) emptyBody = broad.body
    }

    let firstWithData: { body: any; regionUsed: string } | null = null
    for (const region of this.otherRegionsWithData(emptyBody, p.region)) {
      if (!(await this.incrementAndCheckQuota())) break // out of daily quota — stop probing
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

  // Cataloging (lazy read-through). Same read→miss→write→cache shape; payload stored verbatim.
  private async catalog(kind: string, key: string, fetcher: () => Promise<any>): Promise<any> {
    const hit = await this.listWheelSizeCatalogs({ kind, key })
    if (hit[0]) return hit[0].payload
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
