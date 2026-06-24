// backend/src/modules/wheel-size/client.ts
type FetchImpl = (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; text: () => Promise<string> }>
export type ClientResult = { status: number; empty: boolean; body: any | null }

export class WheelSizeClient {
  private apiKey: string
  private baseUrl: string
  private fetchImpl: FetchImpl
  private timeoutMs: number
  constructor(opts: { apiKey: string; baseUrl: string; fetchImpl?: FetchImpl; timeoutMs?: number }) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl.replace(/\/$/, "")
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init) as any)
    this.timeoutMs = opts.timeoutMs ?? 5000
  }
  private async get(path: string, params: Record<string, string>): Promise<ClientResult> {
    const qs = new URLSearchParams({ ...params, user_key: this.apiKey }).toString()
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutP = new Promise<{ __timeout: true }>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve({ __timeout: true }) }, this.timeoutMs)
    })
    const fetchP = this.fetchImpl(`${this.baseUrl}${path}?${qs}`, { signal: controller.signal })
    fetchP.catch(() => {}) // if the timeout wins the race, swallow the orphaned fetch's later AbortError
    let res: any
    try {
      res = await Promise.race([fetchP, timeoutP])
    } catch {
      // network error or abort that rejected — treat as a transient outage
      clearTimeout(timer)
      return { status: 408, empty: true, body: null }
    }
    clearTimeout(timer)
    if (res && res.__timeout) return { status: 408, empty: true, body: null }
    const text = await res.text()
    const empty = text.length === 0
    let body: any = null
    if (!empty) { try { body = JSON.parse(text) } catch { body = null } }
    return { status: res.status, empty, body }
  }
  // Real v2 contract: by_model REQUIRES make+model AND `year` (or `generation`).
  // `modification` only narrows the trim — it does NOT satisfy the year/generation
  // requirement, so it must be sent IN ADDITION to year, never instead of it.
  // (Sending modification alone => 400 VALIDATION_ERROR, which broke every lookup.)
  byModel(p: { make: string; model: string; modification?: string; year?: string; region: string }): Promise<ClientResult> {
    const params: Record<string, string> = { make: p.make, model: p.model, region: p.region }
    if (p.year) params.year = p.year
    if (p.modification) params.modification = p.modification
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
