import { mapWithConcurrency } from "./concurrency"

const DEFAULT_TTL_DAYS = 7
const DEFAULT_CONCURRENCY = 24
const DEFAULT_TIMEOUT_MS = 10_000
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

/** Shape of a `vendor_image_check` row (see models/vendor-image-check.ts). */
interface VendorImageCheckRow {
  url: string
  last_status: number | null
  last_checked_at: Date | string
  consecutive_failures: number
}

export interface FetchResponseLike {
  status: number
}

/** Injectable fetch so tests never touch the real network. */
export type FetchImpl = (
  url: string,
  init: { method: "HEAD"; signal: AbortSignal }
) => Promise<FetchResponseLike>

export interface CreateImageReachabilityCheckerOptions {
  /** VendorSyncService instance (or a test double) with the vendor_image_check CRUD methods. */
  service: any
  logger: Logger
  fetchImpl: FetchImpl
  /** How long a cached "alive" result is trusted before re-checking. Default 7. */
  ttlDays?: number
  /** Max in-flight HEAD requests. Default 24. */
  concurrency?: number
  /** Per-request timeout in ms. Default 10_000. */
  timeoutMs?: number
}

export interface ImageReachabilityChecker {
  check(urls: string[]): Promise<Map<string, boolean>>
}

/**
 * WB-115 fail-open classifier. Only a definitive `404`/`410` HTTP status
 * means the image is confirmed gone. Everything else -- any other status
 * code (5xx, 429, 3xx, ...), a thrown error, a DNS failure, or a timeout --
 * classifies "alive". This is the load-bearing safety property of the
 * whole feature: a live probe found 664/2,852 indexed products (23%)
 * pointing at genuinely-dead vendor thumbnails, but if the checker itself
 * ever fails closed (e.g. because the vendor CDN rate-limits us), the same
 * mechanism would wrongly delist the entire catalog. Do not tighten this
 * without re-doing that safety analysis.
 */
export function classifyImageResponse(
  statusOrError: number | unknown
): "dead" | "alive" {
  if (
    typeof statusOrError === "number" &&
    (statusOrError === 404 || statusOrError === 410)
  ) {
    return "dead"
  }
  return "alive"
}

/**
 * A cached row counts as a confirmed-reachable "success" for TTL purposes
 * only when it holds a real (non-null) HTTP status that classifies alive.
 * A null `last_status` means the last attempt never got a definitive
 * response (timeout/thrown error) -- that is neither a success nor a
 * known-dead, so it always falls through to a fresh network check below.
 */
function isFreshSuccess(row: VendorImageCheckRow, now: number, ttlMs: number): boolean {
  if (row.last_status == null) return false
  if (classifyImageResponse(row.last_status) !== "alive") return false
  const checkedAt = new Date(row.last_checked_at).getTime()
  if (Number.isNaN(checkedAt)) return false
  return now - checkedAt <= ttlMs
}

/**
 * Probe one URL with a HEAD request, bounded by `timeoutMs`. Resolves --
 * never rejects -- with the raw status (when we got one) and the
 * fail-open classification. The timeout is enforced with its own timer
 * rather than relying on `fetchImpl` to honor the abort signal, so an
 * injected test double that simply never resolves still yields a timely
 * "alive" result instead of hanging the caller; `settled` ensures only
 * whichever of the timer/fetch settles first actually resolves the promise.
 *
 * The call into `fetchImpl` (and the `.then` chained onto it) is wrapped in
 * `try/catch`: a real `fetch` never throws synchronously (an invalid URL
 * yields a rejected promise, handled by the `.then` error branch below),
 * but the fail-open contract is "ANY throw -> alive", and a synchronous
 * throw -- or a non-promise return value, which makes `.then` itself throw
 * -- from an injected/future `fetchImpl` must not escape as a rejection of
 * this promise (a rejection here would propagate through
 * `mapWithConcurrency` and reject `check()` entirely, defeating fail-open).
 */
function probeUrl(
  url: string,
  fetchImpl: FetchImpl,
  timeoutMs: number,
  logger: Logger
): Promise<{ status: number | null; classification: "dead" | "alive" }> {
  return new Promise((resolve) => {
    const controller = new AbortController()
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      controller.abort()
      logger.warn(`[vendor-sync] image reachability check timed out after ${timeoutMs}ms: ${url}`)
      resolve({ status: null, classification: "alive" })
    }, timeoutMs)

    try {
      fetchImpl(url, { method: "HEAD", signal: controller.signal }).then(
        (res) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ status: res.status, classification: classifyImageResponse(res.status) })
        },
        (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          logger.warn(
            `[vendor-sync] image reachability check errored for ${url}: ${
              (error as any)?.message ?? error
            }`
          )
          resolve({ status: null, classification: classifyImageResponse(error) })
        }
      )
    } catch (error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      logger.warn(
        `[vendor-sync] image reachability check threw synchronously for ${url}: ${
          (error as any)?.message ?? error
        }`
      )
      resolve({ status: null, classification: "alive" })
    }
  })
}

/**
 * Build an image reachability checker with a persistent DB-backed cache.
 * Lookup order per URL: in-memory Map (dedupes repeats within/across calls
 * on this same checker instance) -> DB cache (skipped only on a fresh
 * confirmed-alive hit; a known-dead cache entry always re-checks so a
 * product recovers automatically once the vendor republishes the image)
 * -> network (bounded concurrency HEAD requests). Every network outcome is
 * persisted back to the cache.
 */
export function createImageReachabilityChecker(
  options: CreateImageReachabilityCheckerOptions
): ImageReachabilityChecker {
  const {
    service,
    logger,
    fetchImpl,
    ttlDays = DEFAULT_TTL_DAYS,
    concurrency = DEFAULT_CONCURRENCY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options

  const ttlMs = ttlDays * MS_PER_DAY
  // Per-run dedupe: once this checker instance has resolved a URL, never
  // hit the DB or network for it again for the lifetime of this instance.
  const memo = new Map<string, boolean>()

  async function check(urls: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>()
    const uniqueUrls = Array.from(new Set(urls))

    const remaining: string[] = []
    for (const url of uniqueUrls) {
      const memoized = memo.get(url)
      if (memoized !== undefined) {
        result.set(url, memoized)
      } else {
        remaining.push(url)
      }
    }
    if (remaining.length === 0) return result

    const rows: VendorImageCheckRow[] = await service.listVendorImageChecks(
      { url: remaining },
      { take: null }
    )
    const rowByUrl = new Map(rows.map((r) => [r.url, r]))

    const now = Date.now()
    const toFetch: string[] = []
    for (const url of remaining) {
      const row = rowByUrl.get(url)
      if (row && isFreshSuccess(row, now, ttlMs)) {
        memo.set(url, true)
        result.set(url, true)
        continue
      }
      toFetch.push(url)
    }

    if (toFetch.length > 0) {
      const newRows: VendorImageCheckRow[] = []
      const updatedRows: VendorImageCheckRow[] = []

      await mapWithConcurrency(toFetch, concurrency, async (url) => {
        const probe = await probeUrl(url, fetchImpl, timeoutMs, logger)
        const reachable = probe.classification === "alive"
        memo.set(url, reachable)
        result.set(url, reachable)

        const existing = rowByUrl.get(url)
        const nextRow: VendorImageCheckRow = {
          url,
          last_status: probe.status,
          last_checked_at: new Date(),
          consecutive_failures:
            probe.classification === "dead"
              ? (existing?.consecutive_failures ?? 0) + 1
              : 0,
        }
        if (existing) {
          updatedRows.push(nextRow)
        } else {
          newRows.push(nextRow)
        }
      })

      if (newRows.length > 0) {
        await service.createVendorImageChecks(newRows)
      }
      if (updatedRows.length > 0) {
        await service.updateVendorImageChecks(updatedRows)
      }
    }

    return result
  }

  return { check }
}
