// backend/src/modules/wheel-size/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import WheelSizeCatalog from "./models/wheel-size-catalog"
import WheelSizeFitment from "./models/wheel-size-fitment"
import WheelSizeQuota from "./models/wheel-size-quota"
import { WheelSizeClient } from "./client"
import { normalizeByModel } from "./normalize"
import { VehicleFitment } from "./types"

export class QuotaOutageError extends Error {
  constructor() { super("wheel-size quota outage") ; this.name = "QuotaOutageError" }
}

type Options = { apiKey: string; baseUrl?: string; defaultRegion?: string; dailyCeiling?: number }

class WheelSizeService extends MedusaService({ WheelSizeCatalog, WheelSizeFitment, WheelSizeQuota }) {
  protected logger_: any
  protected options_: Options
  protected client_: WheelSizeClient
  protected ceiling_: number

  constructor(container: any, options: Options) {
    super(...arguments as any)
    this.logger_ = container?.logger ?? console
    this.options_ = options ?? ({} as Options)
    this.ceiling_ = options?.dailyCeiling ?? 5000
    this.client_ = new WheelSizeClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? "https://api.wheel-size.com/v2",
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
      return { status: c.status, canonicalBoltPatterns: c.canonical_bolt_patterns ?? [],
        hubBoreMm: c.hub_bore_mm ?? null, diameterWindow: c.diameter_window ?? null,
        widthWindow: c.width_window ?? null, offsetWindow: c.offset_window ?? null,
        source: { modificationSlug: p.modificationSlug ?? "", region } }
    }

    const underQuota = await this.incrementAndCheckQuota()
    if (!underQuota) throw new QuotaOutageError()

    const res = await this.client_.byModel({ make: p.make, model: p.model, modification: p.modificationSlug, year: p.year, region })
    // Classification (spec §10): any non-2xx => outage (this build folds wheel-size 5xx/network
    // into the same user-facing "fitment unavailable" 503; the storefront data layer retries first).
    // A 200 with empty `data` is genuine no-data => not_found (handled by normalizeByModel below).
    if (res.status >= 300) throw new QuotaOutageError()

    const fitment = normalizeByModel(res.body, { modificationSlug: p.modificationSlug ?? "", region })
    await this.createWheelSizeFitments({
      cache_key, region, raw: res.body, canonical_bolt_patterns: fitment.canonicalBoltPatterns,
      hub_bore_mm: fitment.hubBoreMm, diameter_window: fitment.diameterWindow,
      width_window: fitment.widthWindow, offset_window: fitment.offsetWindow,
      status: fitment.status, fetched_at: new Date(),
    })
    return fitment
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
