import VendorSyncService, { resolveImageCheckNumericOption } from "../service"

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}

/**
 * `buildImageCheck` is a private method, but VendorSyncService itself needs
 * no live DB/container to construct -- `MedusaService({...})`'s generated
 * base class only wires CRUD method stubs at class-definition time, which
 * already happens (safely) whenever any file that imports `../service`
 * (e.g. pipeline/apply.ts) is loaded by the test runner. Calling the
 * private method directly here (WB-115 premerge Change 1) is far more
 * direct than exercising it indirectly through executeRun/runStockOnly,
 * which would require mocking the entire fetch/stage/diff pipeline just to
 * observe one field on the returned options object.
 */
function buildImageCheck(options: any, vendorCode: string) {
  const svc: any = new (VendorSyncService as any)(
    { logger: makeLogger() },
    options
  )
  return svc.buildImageCheck(vendorCode)
}

/** Same as buildImageCheck, but also returns the logger so warn calls can be asserted. */
function buildImageCheckWithLogger(options: any, vendorCode: string) {
  const logger = makeLogger()
  const svc: any = new (VendorSyncService as any)({ logger }, options)
  const result = svc.buildImageCheck(vendorCode)
  return { result, logger }
}

describe("VendorSyncService#buildImageCheck (WB-115 premerge per-vendor maxDeadRatio)", () => {
  it("returns undefined when the imageCheck kill switch is off", () => {
    const result = buildImageCheck(
      { imageCheck: { enabled: false, maxDeadRatio: 0.4 } },
      "wheelpros-wheels"
    )
    expect(result).toBeUndefined()
  })

  it("uses the vendor's own maxDeadRatio when the vendor config sets one", () => {
    const result = buildImageCheck(
      {
        imageCheck: { enabled: true, maxDeadRatio: 0.4 },
        vendors: {
          "wheelpros-tires": { enabled: true, maxDeadRatio: 0.7 },
        },
      },
      "wheelpros-tires"
    )
    expect(result?.maxDeadRatio).toBe(0.7)
  })

  it("falls back to the global imageCheck.maxDeadRatio when the vendor sets none", () => {
    const result = buildImageCheck(
      {
        imageCheck: { enabled: true, maxDeadRatio: 0.4 },
        vendors: {
          "wheelpros-wheels": { enabled: true },
        },
      },
      "wheelpros-wheels"
    )
    expect(result?.maxDeadRatio).toBe(0.4)
  })

  it("falls back to the global default when the vendor is not present in options.vendors at all", () => {
    const result = buildImageCheck(
      { imageCheck: { enabled: true, maxDeadRatio: 0.4 } },
      "some-other-vendor"
    )
    expect(result?.maxDeadRatio).toBe(0.4)
  })

  it("different vendors resolve independently in the same process (wheels 0.40, tires 0.70)", () => {
    const options = {
      imageCheck: { enabled: true, maxDeadRatio: 0.4 },
      vendors: {
        "wheelpros-wheels": { enabled: true, maxDeadRatio: 0.4 },
        "wheelpros-tires": { enabled: true, maxDeadRatio: 0.7 },
      },
    }
    expect(buildImageCheck(options, "wheelpros-wheels")?.maxDeadRatio).toBe(0.4)
    expect(buildImageCheck(options, "wheelpros-tires")?.maxDeadRatio).toBe(0.7)
  })

  it("still returns a working checker object (has a .check function) alongside maxDeadRatio", () => {
    const result = buildImageCheck(
      { imageCheck: { enabled: true, maxDeadRatio: 0.4 } },
      "wheelpros-wheels"
    )
    expect(typeof result?.checker.check).toBe("function")
  })
})

// WB-115 premerge Change 4: resolveImageCheckNumericOption is the pure guard
// that keeps ttlDays/concurrency/timeoutMs from ever reaching
// createImageReachabilityChecker as a non-finite number.
describe("resolveImageCheckNumericOption (WB-115 premerge Change 4)", () => {
  it("returns the fallback when the value is undefined (option simply not set) -- no warning", () => {
    const logger = makeLogger()
    const result = resolveImageCheckNumericOption("ttlDays", undefined, 7, "wheelpros-wheels", logger)
    expect(result).toBe(7)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("passes through a valid finite value unchanged -- no warning", () => {
    const logger = makeLogger()
    const result = resolveImageCheckNumericOption("concurrency", 12, 24, "wheelpros-wheels", logger)
    expect(result).toBe(12)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("falls back to the default AND warns when the value is NaN (malformed env var)", () => {
    const logger = makeLogger()
    // Simulates parseInt("garbage", 10) from medusa-config.js.
    const result = resolveImageCheckNumericOption("timeoutMs", NaN, 10000, "wheelpros-tires", logger)
    expect(result).toBe(10000)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/invalid imageCheck\.timeoutMs/i)
    )
    expect(logger.warn.mock.calls[0][0]).toMatch(/wheelpros-tires/)
  })

  it("falls back to the default AND warns for +/-Infinity", () => {
    const logger = makeLogger()
    expect(resolveImageCheckNumericOption("ttlDays", Infinity, 7, "v", logger)).toBe(7)
    expect(resolveImageCheckNumericOption("ttlDays", -Infinity, 7, "v", logger)).toBe(7)
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  // WB-115 premerge review round 2 (Minor 1): `0` is REJECTED, not passed
  // through. This flips the pre-fix assertion below, which enshrined the
  // exact hazard this function's own docstring warns about: a `0` timeout
  // makes every probe expire instantly (all images fail-open to "alive"),
  // a `0` ttlDays defeats the cache, and a `0` concurrency schedules no
  // probes at all -- each silently no-ops the gate while still looking
  // "valid" to a shallow finite-number check.
  it("0 is rejected (not a valid finite value in this domain) -- falls back to the default AND warns", () => {
    const logger = makeLogger()
    const result = resolveImageCheckNumericOption("concurrency", 0, 24, "v", logger)
    expect(result).toBe(24)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/invalid imageCheck\.concurrency/i)
    )
  })

  it("0 is rejected for ttlDays and timeoutMs too, each falling back and warning independently", () => {
    const logger = makeLogger()
    expect(resolveImageCheckNumericOption("ttlDays", 0, 7, "v", logger)).toBe(7)
    expect(resolveImageCheckNumericOption("timeoutMs", 0, 10000, "v", logger)).toBe(10000)
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  it("negative values are rejected (not just 0) -- falls back and warns", () => {
    const logger = makeLogger()
    const result = resolveImageCheckNumericOption("timeoutMs", -1, 10000, "v", logger)
    expect(result).toBe(10000)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/invalid imageCheck\.timeoutMs/i)
    )
  })

  it("a small positive value (e.g. 1) is still accepted -- the floor is > 0, not some arbitrary minimum", () => {
    const logger = makeLogger()
    const result = resolveImageCheckNumericOption("concurrency", 1, 24, "v", logger)
    expect(result).toBe(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe("VendorSyncService#buildImageCheck — ttlDays/concurrency/timeoutMs guarding (WB-115 premerge Change 4)", () => {
  it("a malformed ttlDays (NaN) does not prevent the checker from being built, and warns", () => {
    const { result, logger } = buildImageCheckWithLogger(
      { imageCheck: { enabled: true, maxDeadRatio: 0.4, ttlDays: NaN, concurrency: 24, timeoutMs: 10000 } },
      "wheelpros-wheels"
    )
    expect(result).toBeDefined()
    expect(typeof result.checker.check).toBe("function")
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/invalid imageCheck\.ttlDays/i))
  })

  it("malformed concurrency and timeoutMs each warn independently", () => {
    const { logger } = buildImageCheckWithLogger(
      {
        imageCheck: {
          enabled: true,
          maxDeadRatio: 0.4,
          ttlDays: 7,
          concurrency: NaN,
          timeoutMs: NaN,
        },
      },
      "wheelpros-tires"
    )
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/invalid imageCheck\.concurrency/i))
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/invalid imageCheck\.timeoutMs/i))
  })

  it("valid ttlDays/concurrency/timeoutMs values produce no warnings", () => {
    const { logger } = buildImageCheckWithLogger(
      { imageCheck: { enabled: true, maxDeadRatio: 0.4, ttlDays: 14, concurrency: 10, timeoutMs: 5000 } },
      "wheelpros-wheels"
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("omitting ttlDays/concurrency/timeoutMs entirely (undefined) produces no warnings", () => {
    const { logger } = buildImageCheckWithLogger(
      { imageCheck: { enabled: true, maxDeadRatio: 0.4 } },
      "wheelpros-wheels"
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
