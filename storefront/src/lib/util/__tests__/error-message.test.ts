import { describe, it, expect } from "vitest"
import { extractMedusaMessage, insufficientStockMessage } from "../error-message"

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
    expect(insufficientStockMessage("Not enough stock reserved", 1)).toBe(
      "Only 1 in stock — reduce quantity"
    )
  })
  it("matches on 'not enough' without the word 'stock'/'inventory'", () => {
    expect(insufficientStockMessage("There is not enough available", 5)).toBe(
      "Only 5 in stock — reduce quantity"
    )
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
