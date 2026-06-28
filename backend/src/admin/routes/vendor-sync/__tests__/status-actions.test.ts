import {
  actionsForStatus,
  badgeForStatus,
  isNonTerminal,
} from "../status-actions"

describe("actionsForStatus", () => {
  it("offers approve + cancel while awaiting approval", () => {
    expect(actionsForStatus("awaiting_approval")).toEqual(["approve", "cancel"])
  })
  it("offers cancel during in-flight phases", () => {
    for (const s of ["fetching", "staging", "diffing", "applying"]) {
      expect(actionsForStatus(s)).toEqual(["cancel"])
    }
  })
  it("offers replay only for completed/failed (the replay route's source statuses)", () => {
    expect(actionsForStatus("completed")).toEqual(["replay"])
    expect(actionsForStatus("failed")).toEqual(["replay"])
  })
  it("offers nothing for other terminal statuses", () => {
    for (const s of ["cancelled", "exhausted", "partially_failed", "weird"]) {
      expect(actionsForStatus(s)).toEqual([])
    }
  })
})

describe("badgeForStatus", () => {
  it("maps statuses to badge colors", () => {
    expect(badgeForStatus("completed")).toBe("green")
    expect(badgeForStatus("awaiting_approval")).toBe("orange")
    expect(badgeForStatus("partially_failed")).toBe("orange")
    expect(badgeForStatus("failed")).toBe("red")
    expect(badgeForStatus("exhausted")).toBe("red")
    expect(badgeForStatus("cancelled")).toBe("grey")
    expect(badgeForStatus("applying")).toBe("blue")
    expect(badgeForStatus("unknown")).toBe("grey")
  })
})

describe("isNonTerminal", () => {
  it("is true while a run can still change on its own", () => {
    for (const s of ["fetching", "staging", "diffing", "applying", "awaiting_approval"]) {
      expect(isNonTerminal(s)).toBe(true)
    }
  })
  it("is false for terminal statuses", () => {
    for (const s of ["completed", "failed", "cancelled", "exhausted", "partially_failed"]) {
      expect(isNonTerminal(s)).toBe(false)
    }
  })
})
