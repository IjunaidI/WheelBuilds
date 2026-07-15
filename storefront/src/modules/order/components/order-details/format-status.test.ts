import { describe, it, expect } from "vitest"
import { formatStatus } from "./format-status"

describe("formatStatus", () => {
  it("replaces underscores with spaces and capitalizes the first letter", () => {
    expect(formatStatus("partially_shipped")).toBe("Partially shipped")
  })

  it("capitalizes a single-word status", () => {
    expect(formatStatus("delivered")).toBe("Delivered")
  })

  it("formats a multi-underscore status", () => {
    expect(formatStatus("not_fulfilled")).toBe("Not fulfilled")
  })

  it("does not throw on an empty string", () => {
    expect(() => formatStatus("")).not.toThrow()
    expect(formatStatus("")).toBe("")
  })
})
