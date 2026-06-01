// backend/src/modules/wheel-size/client.ts
type FetchImpl = (url: string) => Promise<{ status: number; text: () => Promise<string> }>
export type ClientResult = { status: number; empty: boolean; body: any | null }

export class WheelSizeClient {
  private apiKey: string
  private baseUrl: string
  private fetchImpl: FetchImpl
  constructor(opts: { apiKey: string; baseUrl: string; fetchImpl?: FetchImpl }) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl.replace(/\/$/, "")
    this.fetchImpl = opts.fetchImpl ?? ((url) => fetch(url) as any)
  }
  private async get(path: string, params: Record<string, string>): Promise<ClientResult> {
    const qs = new URLSearchParams({ ...params, user_key: this.apiKey }).toString()
    const res = await this.fetchImpl(`${this.baseUrl}${path}?${qs}`)
    const text = await res.text()
    const empty = text.length === 0
    let body: any = null
    if (!empty) { try { body = JSON.parse(text) } catch { body = null } }
    return { status: res.status, empty, body }
  }
  // Real v2 contract: by_model REQUIRES make+model. modification (or year) narrows the trim.
  byModel(p: { make: string; model: string; modification?: string; year?: string; region: string }): Promise<ClientResult> {
    const params: Record<string, string> = { make: p.make, model: p.model, region: p.region }
    if (p.modification) params.modification = p.modification
    else if (p.year) params.year = p.year
    return this.get("/search/by_model/", params)
  }
  // Cataloging (lazy). Slugs per Task-1 findings.
  makes(): Promise<ClientResult> { return this.get("/makes/", {}) }
  models(make: string): Promise<ClientResult> { return this.get("/models/", { make }) }
  years(make: string, model: string): Promise<ClientResult> { return this.get("/years/", { make, model }) }
  modifications(make: string, model: string, year: string): Promise<ClientResult> {
    return this.get("/modifications/", { make, model, year })
  }
}
