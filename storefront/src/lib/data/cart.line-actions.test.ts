// storefront/src/lib/data/cart.line-actions.test.ts
//
// WB-092 C9 -- updateLineItem, deleteLineItem, and applyPromotions used to
// `.catch(medusaError)` (a throw), which Next.js redacts from thrown Server
// Action error messages in production. Mirrors addToCart/setShippingMethod's
// existing B2 fix: RETURN `{ error }` on failure, `{}` on success, never
// throw. Mocking pattern mirrors cart.outage.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest"

const updateLineItemMock = vi.fn()
const deleteLineItemMock = vi.fn()
const updateCartMock = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: {
    store: {
      cart: {
        updateLineItem: (...args: any[]) => updateLineItemMock(...args),
        deleteLineItem: (...args: any[]) => deleteLineItemMock(...args),
        update: (...args: any[]) => updateCartMock(...args),
      },
    },
  },
}))

const getCartIdMock = vi.fn(async () => "cart_123")
// `vi.mock` factories are hoisted above other top-level const declarations,
// so wrap the reference in a closure (same reasoning as cart.outage.test.ts).
vi.mock("./cookies", () => ({
  getCartId: () => getCartIdMock(),
  getAuthHeaders: vi.fn(async () => ({})),
  setCartId: vi.fn(),
  removeCartId: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}))

import { updateLineItem, deleteLineItem, applyPromotions } from "./cart"

describe("updateLineItem — B2 return shape (WB-092 C9)", () => {
  beforeEach(() => {
    updateLineItemMock.mockReset()
    getCartIdMock.mockReset()
    getCartIdMock.mockResolvedValue("cart_123")
  })

  it("returns an error object (never throws) when lineId is missing", async () => {
    const result = await updateLineItem({ lineId: "", quantity: 2 })
    expect(result).toEqual({ error: expect.any(String) })
    expect(updateLineItemMock).not.toHaveBeenCalled()
  })

  it("returns an error object when there is no cart id", async () => {
    getCartIdMock.mockResolvedValueOnce(undefined as any)
    const result = await updateLineItem({ lineId: "li_1", quantity: 2 })
    expect(result).toEqual({ error: expect.any(String) })
    expect(updateLineItemMock).not.toHaveBeenCalled()
  })

  it("returns {} on success", async () => {
    updateLineItemMock.mockResolvedValueOnce({ cart: { id: "cart_123" } })
    const result = await updateLineItem({ lineId: "li_1", quantity: 2 })
    expect(result).toEqual({})
  })

  it("returns { error } instead of throwing on an SDK failure", async () => {
    updateLineItemMock.mockRejectedValueOnce({
      response: { data: { message: "insufficient inventory" } },
    })
    const result = await updateLineItem({ lineId: "li_1", quantity: 2 })
    expect(result.error).toBeTruthy()
    expect(typeof result.error).toBe("string")
  })

  it("never rejects the returned promise on failure", async () => {
    updateLineItemMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(
      updateLineItem({ lineId: "li_1", quantity: 2 })
    ).resolves.toEqual({ error: expect.any(String) })
  })
})

describe("deleteLineItem — B2 return shape (WB-092 C9)", () => {
  beforeEach(() => {
    deleteLineItemMock.mockReset()
    getCartIdMock.mockReset()
    getCartIdMock.mockResolvedValue("cart_123")
  })

  it("returns an error object (never throws) when lineId is missing", async () => {
    const result = await deleteLineItem("")
    expect(result).toEqual({ error: expect.any(String) })
    expect(deleteLineItemMock).not.toHaveBeenCalled()
  })

  it("returns an error object when there is no cart id", async () => {
    getCartIdMock.mockResolvedValueOnce(undefined as any)
    const result = await deleteLineItem("li_1")
    expect(result).toEqual({ error: expect.any(String) })
    expect(deleteLineItemMock).not.toHaveBeenCalled()
  })

  it("returns {} on success", async () => {
    deleteLineItemMock.mockResolvedValueOnce({})
    const result = await deleteLineItem("li_1")
    expect(result).toEqual({})
  })

  it("returns { error } instead of throwing on an SDK failure", async () => {
    deleteLineItemMock.mockRejectedValueOnce({
      response: { data: { message: "line item not found" } },
    })
    const result = await deleteLineItem("li_1")
    expect(result.error).toBeTruthy()
    expect(typeof result.error).toBe("string")
  })

  it("never rejects the returned promise on failure", async () => {
    deleteLineItemMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(deleteLineItem("li_1")).resolves.toEqual({
      error: expect.any(String),
    })
  })
})

describe("applyPromotions — B2 return shape (WB-092 C9)", () => {
  beforeEach(() => {
    updateCartMock.mockReset()
    getCartIdMock.mockReset()
    getCartIdMock.mockResolvedValue("cart_123")
  })

  it("returns an error object (never throws) when there is no cart id", async () => {
    getCartIdMock.mockResolvedValueOnce(undefined as any)
    const result = await applyPromotions(["SAVE10"])
    expect(result).toEqual({ error: expect.any(String) })
    expect(updateCartMock).not.toHaveBeenCalled()
  })

  it("returns {} on success", async () => {
    updateCartMock.mockResolvedValueOnce({ cart: { id: "cart_123" } })
    const result = await applyPromotions(["SAVE10"])
    expect(result).toEqual({})
  })

  it("returns { error } instead of throwing when the underlying updateCart fails", async () => {
    updateCartMock.mockRejectedValueOnce({
      response: { data: { message: "invalid promo code" } },
    })
    const result = await applyPromotions(["BADCODE"])
    expect(result.error).toBeTruthy()
    expect(typeof result.error).toBe("string")
  })

  it("never rejects the returned promise on failure", async () => {
    updateCartMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(applyPromotions(["SAVE10"])).resolves.toEqual({
      error: expect.any(String),
    })
  })
})
