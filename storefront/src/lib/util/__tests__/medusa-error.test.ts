import { describe, it, expect } from "vitest"
import medusaError from "../medusa-error"

describe("medusaError", () => {
  it("uses a string message from response.data", () => {
    expect(() => medusaError({ response: { data: "boom", status: 400, config: { url: "/x", baseURL: "http://h" }, headers: {} } }))
      .toThrow("Boom.")
  })
  it("does not throw TypeError when response.data is an object without .message", () => {
    let caught: unknown
    try {
      medusaError({ response: { data: { code: "E" }, status: 400, config: { url: "/x", baseURL: "http://h" }, headers: {} } })
    } catch (e) {
      caught = e
    }
    // Pins the fix: JSON.stringify({code:"E"}) = '{"code":"E"}', then
    // charAt(0).toUpperCase() + slice(1) + "." (charAt(0) is "{", a no-op
    // under toUpperCase) yields '{"code":"E"}.'. Before the fix, `raw` was
    // the object itself and `message.charAt` threw a masking TypeError —
    // asserting the exact Error subtype + message (not just "any throw")
    // is what pins that regression.
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(TypeError)
    expect((caught as Error).message).toBe('{"code":"E"}.')
  })
})
