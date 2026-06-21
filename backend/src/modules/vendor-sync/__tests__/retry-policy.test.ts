import {
  decideTerminalStatus,
  shouldShortCircuitFeed,
  nextAttemptNumber,
  uniqueGroupKeys,
} from "../pipeline/retry-policy"

describe("decideTerminalStatus", () => {
  it("returns completed when there are no errors", () => {
    expect(decideTerminalStatus(0, 1, 3)).toBe("completed")
    expect(decideTerminalStatus(0, 9, 3)).toBe("completed")
  })
  it("returns partially_failed when errors remain and budget is left", () => {
    expect(decideTerminalStatus(2, 1, 3)).toBe("partially_failed")
    expect(decideTerminalStatus(2, 2, 3)).toBe("partially_failed")
  })
  it("returns exhausted when errors remain and attempt reaches the cap", () => {
    expect(decideTerminalStatus(1, 3, 3)).toBe("exhausted")
    expect(decideTerminalStatus(1, 4, 3)).toBe("exhausted")
  })
})

describe("shouldShortCircuitFeed", () => {
  it("short-circuits a completed or exhausted feed", () => {
    expect(shouldShortCircuitFeed("completed")).toBe(true)
    expect(shouldShortCircuitFeed("exhausted")).toBe(true)
  })
  it("does NOT short-circuit a partially_failed / failed / unknown feed", () => {
    expect(shouldShortCircuitFeed("partially_failed")).toBe(false)
    expect(shouldShortCircuitFeed("failed")).toBe(false)
    expect(shouldShortCircuitFeed(undefined)).toBe(false)
    expect(shouldShortCircuitFeed(null)).toBe(false)
  })
})

describe("nextAttemptNumber", () => {
  it("returns 1 for no prior attempts", () => {
    expect(nextAttemptNumber([])).toBe(1)
    expect(nextAttemptNumber([0])).toBe(1)
  })
  it("returns max prior + 1", () => {
    expect(nextAttemptNumber([1, 2, 1])).toBe(3)
  })
})

describe("uniqueGroupKeys", () => {
  it("dedupes group keys and drops entries without one", () => {
    expect(
      uniqueGroupKeys([{ groupKey: "a" }, { groupKey: "a" }, { groupKey: "b" }, {}])
    ).toEqual(["a", "b"])
  })
})
