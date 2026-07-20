import {
  classifyImageResponse,
  createImageReachabilityChecker,
} from "../image-reachability"

const DAY_MS = 24 * 60 * 60 * 1000

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}

/**
 * Fake VendorSyncService double, following this repo's established pattern
 * (see finalize-apply.test.ts) rather than standing up a real DB. `url` is
 * the model's primary key, so `update` items carry it embedded in the same
 * object -- mirroring the real MedusaService single-object create/update
 * shape this repo relies on (CLAUDE.md gotcha #1).
 */
function makeFakeService(seedRows: any[] = []) {
  const rows = new Map<string, any>(seedRows.map((r) => [r.url, { ...r }]))
  const createCalls: any[][] = []
  const updateCalls: any[][] = []
  return {
    rows,
    createCalls,
    updateCalls,
    async listVendorImageChecks(filter: { url: string[] }) {
      return filter.url.map((u) => rows.get(u)).filter(Boolean)
    },
    async createVendorImageChecks(data: any) {
      const arr = Array.isArray(data) ? data : [data]
      createCalls.push(arr)
      for (const d of arr) rows.set(d.url, { ...d })
      return arr
    },
    async updateVendorImageChecks(data: any) {
      const arr = Array.isArray(data) ? data : [data]
      updateCalls.push(arr)
      for (const d of arr) {
        const existing = rows.get(d.url) ?? {}
        rows.set(d.url, { ...existing, ...d })
      }
      return arr
    },
  }
}

describe("classifyImageResponse (WB-115 fail-open classifier)", () => {
  it("404 -> dead", () => {
    expect(classifyImageResponse(404)).toBe("dead")
  })

  it("410 -> dead", () => {
    expect(classifyImageResponse(410)).toBe("dead")
  })

  it("200 -> alive", () => {
    expect(classifyImageResponse(200)).toBe("alive")
  })

  it("500 -> alive (fail-open: server error is not evidence of a dead image)", () => {
    expect(classifyImageResponse(500)).toBe("alive")
  })

  it("429 -> alive (fail-open: rate-limited is not evidence of a dead image)", () => {
    expect(classifyImageResponse(429)).toBe("alive")
  })

  it("a thrown Error -> alive (fail-open: DNS failure / connection refused / any throw)", () => {
    expect(classifyImageResponse(new Error("ECONNREFUSED"))).toBe("alive")
  })

  it("a non-Error thrown value -> alive (defensive: any throw shape fails open)", () => {
    expect(classifyImageResponse("boom")).toBe("alive")
    expect(classifyImageResponse(undefined)).toBe("alive")
  })

  it("other status codes (3xx/401/403) -> alive (only 404/410 are dead)", () => {
    expect(classifyImageResponse(301)).toBe("alive")
    expect(classifyImageResponse(401)).toBe("alive")
    expect(classifyImageResponse(403)).toBe("alive")
  })
})

describe("createImageReachabilityChecker", () => {
  describe("network classification (no cache)", () => {
    it("404 response -> reachable=false", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 404 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      const result = await checker.check(["https://vendor.example/dead.jpg"])
      expect(result.get("https://vendor.example/dead.jpg")).toBe(false)
    })

    it("410 response -> reachable=false", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 410 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      const result = await checker.check(["https://vendor.example/gone.jpg"])
      expect(result.get("https://vendor.example/gone.jpg")).toBe(false)
    })

    it("200 response -> reachable=true", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      const result = await checker.check(["https://vendor.example/ok.jpg"])
      expect(result.get("https://vendor.example/ok.jpg")).toBe(true)
    })

    it("500 response -> reachable=true (fail-open)", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 500 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      const result = await checker.check(["https://vendor.example/500.jpg"])
      expect(result.get("https://vendor.example/500.jpg")).toBe(true)
    })

    it("429 response -> reachable=true (fail-open)", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 429 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      const result = await checker.check(["https://vendor.example/429.jpg"])
      expect(result.get("https://vendor.example/429.jpg")).toBe(true)
    })

    it("timeout (fetchImpl never resolves) -> reachable=true (fail-open) and actually aborts the signal", async () => {
      const service = makeFakeService()
      let capturedSignal: AbortSignal | undefined
      const fetchImpl = jest.fn((_url: string, init: { signal: AbortSignal }) => {
        capturedSignal = init.signal
        return new Promise(() => {}) // hangs forever -- never itself resolves/rejects
      })
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        timeoutMs: 20,
      })
      const result = await checker.check(["https://vendor.example/hangs.jpg"])
      expect(result.get("https://vendor.example/hangs.jpg")).toBe(true)
      // Guards against an implementation that merely wins the timeout race
      // without actually aborting the in-flight request (a leaked socket).
      expect(capturedSignal).toBeDefined()
      expect(capturedSignal?.aborted).toBe(true)
    })

    it("fetchImpl throws (DNS failure / connection refused) -> reachable=true (fail-open)", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => {
        throw new Error("ENOTFOUND vendor.example")
      })
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      const result = await checker.check(["https://vendor.example/dns-fail.jpg"])
      expect(result.get("https://vendor.example/dns-fail.jpg")).toBe(true)
    })

    it("fetchImpl throws SYNCHRONOUSLY (not a rejected promise) -> reachable=true and check() does not reject", async () => {
      const service = makeFakeService()
      // Deliberately not `async` -- this throws before any Promise is ever
      // constructed, unlike the rejected-promise case above. Per the
      // fail-open contract this must resolve, not reject, `check()`.
      const fetchImpl = jest.fn(() => {
        throw new Error("synchronous boom")
      }) as unknown as jest.Mock
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl: fetchImpl as any,
      })
      const url = "https://vendor.example/sync-throw.jpg"
      // If the synchronous throw escaped as a promise rejection, this
      // `await` would throw and fail the test.
      const result = await checker.check([url])
      expect(result.get(url)).toBe(true)
    })

    it("issues a HEAD request", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      await checker.check(["https://vendor.example/ok.jpg"])
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://vendor.example/ok.jpg",
        expect.objectContaining({ method: "HEAD" })
      )
    })
  })

  describe("DB cache (TTL)", () => {
    it("fresh cached success -> no network call", async () => {
      const url = "https://vendor.example/cached-ok.jpg"
      const service = makeFakeService([
        {
          url,
          last_status: 200,
          last_checked_at: new Date(Date.now() - 1 * DAY_MS),
          consecutive_failures: 0,
        },
      ])
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        ttlDays: 7,
      })
      const result = await checker.check([url])
      expect(result.get(url)).toBe(true)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it("stale cached success (past ttlDays) -> refetches", async () => {
      const url = "https://vendor.example/stale-ok.jpg"
      const service = makeFakeService([
        {
          url,
          last_status: 200,
          last_checked_at: new Date(Date.now() - 10 * DAY_MS),
          consecutive_failures: 0,
        },
      ])
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        ttlDays: 7,
      })
      const result = await checker.check([url])
      expect(result.get(url)).toBe(true)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it("known-dead cache entry re-checks even when fresh (TTL never shields a dead URL)", async () => {
      const url = "https://vendor.example/known-dead.jpg"
      const service = makeFakeService([
        {
          url,
          last_status: 404,
          last_checked_at: new Date(), // as fresh as it gets
          consecutive_failures: 3,
        },
      ])
      // The vendor has since published the image -- recovery must be automatic.
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        ttlDays: 7,
      })
      const result = await checker.check([url])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(result.get(url)).toBe(true)
    })

    it("cached row with last_status=null (prior timeout/error) -> refetches, is never treated as a fresh success", async () => {
      const url = "https://vendor.example/null-status.jpg"
      const service = makeFakeService([
        {
          url,
          last_status: null,
          last_checked_at: new Date(), // as fresh as it gets by timestamp alone
          consecutive_failures: 0,
        },
      ])
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        ttlDays: 7,
      })
      const result = await checker.check([url])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(result.get(url)).toBe(true)
    })

    it("cached row with an unparseable last_checked_at -> refetches rather than treating the row as fresh (Number.isNaN guard)", async () => {
      const url = "https://vendor.example/bad-date.jpg"
      const service = makeFakeService([
        {
          url,
          last_status: 200,
          last_checked_at: "not-a-real-date",
          consecutive_failures: 0,
        },
      ])
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        ttlDays: 7,
      })
      const result = await checker.check([url])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(result.get(url)).toBe(true)
    })
  })

  describe("concurrency", () => {
    it("never exceeds the configured concurrency cap", async () => {
      const service = makeFakeService()
      let active = 0
      let peak = 0
      const fetchImpl = jest.fn(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
        return { status: 200 }
      })
      const urls = Array.from({ length: 10 }, (_, i) => `https://vendor.example/${i}.jpg`)
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        concurrency: 3,
      })
      await checker.check(urls)
      // Exact equality (not just <=) so an under-parallel implementation
      // (e.g. accidentally-serial, peak 1) also fails this test.
      expect(peak).toBe(3)
      expect(fetchImpl).toHaveBeenCalledTimes(10)
    })
  })

  describe("duplicate URLs", () => {
    it("fetches a URL repeated within one call exactly once", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const url = "https://vendor.example/dupe.jpg"
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      const result = await checker.check([url, url, url])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(result.get(url)).toBe(true)
    })

    it("per-run in-memory memo: a second check() call on the same checker skips the network entirely", async () => {
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const url = "https://vendor.example/memo.jpg"
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      await checker.check([url])
      await checker.check([url])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
  })

  describe("persistence: consecutive_failures bump/reset", () => {
    it("a brand-new dead URL is created with consecutive_failures=1", async () => {
      const url = "https://vendor.example/new-dead.jpg"
      const service = makeFakeService()
      const fetchImpl = jest.fn(async () => ({ status: 404 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      await checker.check([url])
      expect(service.createCalls).toHaveLength(1)
      expect(service.updateCalls).toHaveLength(0)
      expect(service.rows.get(url)).toMatchObject({
        url,
        last_status: 404,
        consecutive_failures: 1,
      })
      expect(service.rows.get(url).last_checked_at).toBeInstanceOf(Date)
    })

    it("a repeat-dead URL increments consecutive_failures via update (not create)", async () => {
      const url = "https://vendor.example/repeat-dead.jpg"
      const service = makeFakeService([
        {
          url,
          last_status: 404,
          last_checked_at: new Date(Date.now() - 10 * DAY_MS),
          consecutive_failures: 2,
        },
      ])
      const fetchImpl = jest.fn(async () => ({ status: 404 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      await checker.check([url])
      expect(service.createCalls).toHaveLength(0)
      expect(service.updateCalls).toHaveLength(1)
      expect(service.rows.get(url)).toMatchObject({
        url,
        last_status: 404,
        consecutive_failures: 3,
      })
    })

    it("a recovered URL (was dead, now alive) resets consecutive_failures to 0", async () => {
      const url = "https://vendor.example/recovered.jpg"
      const service = makeFakeService([
        {
          url,
          last_status: 404,
          last_checked_at: new Date(Date.now() - 1 * DAY_MS),
          consecutive_failures: 5,
        },
      ])
      const fetchImpl = jest.fn(async () => ({ status: 200 }))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
      })
      await checker.check([url])
      expect(service.rows.get(url)).toMatchObject({
        url,
        last_status: 200,
        consecutive_failures: 0,
      })
    })

    it("a fail-open outcome (timeout) persists with last_status=null and does not bump consecutive_failures", async () => {
      const url = "https://vendor.example/timeout.jpg"
      const service = makeFakeService()
      const fetchImpl = jest.fn(() => new Promise(() => {}))
      const checker = createImageReachabilityChecker({
        service,
        logger: makeLogger(),
        fetchImpl,
        timeoutMs: 20,
      })
      await checker.check([url])
      expect(service.rows.get(url)).toMatchObject({
        url,
        last_status: null,
        consecutive_failures: 0,
      })
    })
  })
})
