import { describe, it, expect } from "vitest"
import { extractMedusaMessage } from "../error-message"

const respErr = (data: unknown) => ({ response: { data } })

describe("extractMedusaMessage", () => {
  it("capitalizes + periods a string message", () => {
    expect(extractMedusaMessage(respErr("boom"))).toBe("Boom.")
  })
  it("reads response.data.message", () => {
    expect(extractMedusaMessage(respErr({ message: "not allowed" }))).toBe("Not allowed.")
  })
  it("JSON-stringifies an object without .message (no TypeError)", () => {
    expect(extractMedusaMessage(respErr({ code: "E" }))).toBe('{"code":"E"}.')
  })
  it("returns null when there is no response", () => {
    expect(extractMedusaMessage({ request: {} })).toBeNull()
    expect(extractMedusaMessage(new Error("x"))).toBeNull()
  })
  it("returns null on empty response data", () => {
    expect(extractMedusaMessage(respErr(""))).toBeNull()
  })
})
