import { describe, it, expect } from "vitest"
import {
  extractMedusaMessage,
  insufficientStockMessage,
  isNotFoundError,
} from "../error-message"

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

describe("insufficientStockMessage", () => {
  it("recognizes a Medusa insufficient-inventory error (axios-shaped) and reports the exact available count", () => {
    expect(
      insufficientStockMessage(respErr({ message: "Insufficient inventory for variant" }), 2)
    ).toBe("Only 2 in stock — reduce quantity")
  })
  it("recognizes a plain already-extracted message string (post-WB-079 B2 return-not-throw shape)", () => {
    expect(
      insufficientStockMessage("This variant does not have the required inventory", 1)
    ).toBe("Only 1 in stock — reduce quantity")
  })
  it("matches on 'in stock' without the words 'inventory'/'insufficient'", () => {
    expect(insufficientStockMessage("Only 2 left in stock right now", 5)).toBe(
      "Only 5 in stock — reduce quantity"
    )
  })
  it("does not false-positive on 'not enough' alone (dropped keyword — WB-090 fixwave)", () => {
    expect(insufficientStockMessage("There is not enough available", 5)).toBeNull()
  })
  it("is case-insensitive", () => {
    expect(insufficientStockMessage("INSUFFICIENT STOCK", 3)).toBe(
      "Only 3 in stock — reduce quantity"
    )
  })
  it("returns null for an unrelated error so the caller can fall back to generic copy", () => {
    expect(insufficientStockMessage("Region not found", 3)).toBeNull()
  })
  it("returns null when there is no message at all", () => {
    expect(insufficientStockMessage({ request: {} }, 3)).toBeNull()
    expect(insufficientStockMessage(undefined, 3)).toBeNull()
  })
})

describe("isNotFoundError (WB-092 C3a/C8 discriminant)", () => {
  it("classifies a bare FetchError-shaped 404 (@medusajs/js-sdk's real error shape) as not-found", () => {
    expect(isNotFoundError({ status: 404, message: "Not Found" })).toBe(true)
  })
  it("classifies an axios-style response.status 404 as not-found", () => {
    expect(isNotFoundError({ response: { status: 404 } })).toBe(true)
  })
  it("does NOT classify a 500 as not-found (must rethrow / propagate)", () => {
    expect(isNotFoundError({ status: 500, message: "Internal Server Error" })).toBe(false)
  })
  it("does NOT classify an axios-style response.status 500 as not-found", () => {
    expect(isNotFoundError({ response: { status: 500 } })).toBe(false)
  })
  it("does NOT classify a bare network failure (no status at all) as not-found", () => {
    expect(isNotFoundError(new TypeError("Failed to fetch"))).toBe(false)
    expect(isNotFoundError({ request: {} })).toBe(false)
  })
  it("does NOT classify a 400/401/403 as not-found", () => {
    expect(isNotFoundError({ status: 400 })).toBe(false)
    expect(isNotFoundError({ status: 401 })).toBe(false)
    expect(isNotFoundError({ status: 403 })).toBe(false)
  })
  it("handles null/undefined without throwing", () => {
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError(undefined)).toBe(false)
  })
})
