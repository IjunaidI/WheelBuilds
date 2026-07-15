// storefront/src/lib/data/cart.outage.test.ts
//
// WB-092 C3a — `retrieveCart` used to `.catch(() => null)` unconditionally,
// which meant a genuine backend outage (5xx / network failure) rendered the
// same "you don't have anything in your cart" empty state as a customer who
// actually has no cart -- masking the outage from both the customer and the
// nearest error boundary. Mirrors regions.test.ts's getRegion outage-vs-
// legitimate-null precedent (WB-090 P9): a genuine 404 (cart deleted,
// already completed, or never existed) -> null, so EmptyCart is the correct
// render. Anything else must rethrow so `(main)/error.tsx` or
// `(checkout)/error.tsx` takes over instead.
import { describe, it, expect, vi, beforeEach } from "vitest"

const retrieveMock = vi.fn()
vi.mock("@lib/config", () => ({
  sdk: {
    store: {
      cart: { retrieve: (...args: any[]) => retrieveMock(...args) },
    },
  },
}))

const getCartIdMock = vi.fn(async () => "cart_123")
// `vi.mock` factories are hoisted above other top-level const declarations,
// so the factory can't reference `getCartIdMock` directly (it would run
// before the `const` initializes) -- wrap it in a closure so the reference
// is only resolved when `retrieveCart` actually calls `getCartId()`, by
// which point module evaluation has finished.
vi.mock("./cookies", () => ({
  getCartId: () => getCartIdMock(),
  getAuthHeaders: vi.fn(async () => ({})),
  setCartId: vi.fn(),
  removeCartId: vi.fn(),
}))

import { retrieveCart } from "./cart"

describe("retrieveCart — outage vs genuine 404/no-cart (WB-092 C3a)", () => {
  beforeEach(() => {
    retrieveMock.mockReset()
    getCartIdMock.mockReset()
    getCartIdMock.mockResolvedValue("cart_123")
  })

  it("returns null with no network call when there's no cart id cookie at all", async () => {
    getCartIdMock.mockResolvedValueOnce(undefined as any)
    const result = await retrieveCart()
    expect(result).toBeNull()
    expect(retrieveMock).not.toHaveBeenCalled()
  })

  it("returns null on a genuine 404 (cart deleted/completed/never existed)", async () => {
    retrieveMock.mockRejectedValueOnce({ status: 404, message: "Cart not found" })
    const result = await retrieveCart()
    expect(result).toBeNull()
  })

  it("rethrows on a 5xx instead of returning null", async () => {
    retrieveMock.mockRejectedValueOnce({
      response: { status: 500, data: "server error", config: {}, headers: {} },
    })
    await expect(retrieveCart()).rejects.toBeTruthy()
  })

  it("rethrows on a bare network failure (no status at all) instead of returning null", async () => {
    retrieveMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(retrieveCart()).rejects.toThrow("Failed to fetch")
  })

  it("resolves the cart on success", async () => {
    retrieveMock.mockResolvedValueOnce({ cart: { id: "cart_123" } })
    const result = await retrieveCart()
    expect(result).toEqual({ id: "cart_123" })
  })
})
