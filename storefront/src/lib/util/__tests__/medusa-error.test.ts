import { describe, it, expect } from "vitest"
import medusaError from "../medusa-error"

describe("medusaError", () => {
  it("uses a string message from response.data", () => {
    expect(() => medusaError({ response: { data: "boom", status: 400, config: { url: "/x", baseURL: "http://h" }, headers: {} } }))
      .toThrow("Boom.")
  })
  it("does not throw TypeError when response.data is an object without .message", () => {
    expect(() => medusaError({ response: { data: { code: "E" }, status: 400, config: { url: "/x", baseURL: "http://h" }, headers: {} } }))
      .toThrow() // a real Error, not 'message.charAt is not a function'
  })
})
