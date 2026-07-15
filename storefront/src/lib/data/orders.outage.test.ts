// storefront/src/lib/data/orders.outage.test.ts
//
// WB-092 C8 — `retrieveOrder` used to `.catch((err) => medusaError(err))`,
// and `medusaError`'s return type is `never` (it always throws). That made
// retrieveOrder's result type a lie: it could never actually resolve to
// null/undefined, which made the confirmed page's `if (!order) notFound()`
// dead code -- a bad/foreign order id hit the generic error boundary
// instead of a real 404. Mirrors regions.test.ts's getRegion outage-vs-
// legitimate-null precedent (WB-090 P9): a genuine 404 -> null (notFound()
// fires); anything else (5xx, network failure) still rethrows so a
// just-charged customer sees the boundary's reassurance copy instead of a
// silent, wrong 404.
import { describe, it, expect, vi, beforeEach } from "vitest"

const retrieveMock = vi.fn()
vi.mock("@lib/config", () => ({
  sdk: { store: { order: { retrieve: (...args: any[]) => retrieveMock(...args) } } },
}))
vi.mock("./cookies", () => ({
  getAuthHeaders: vi.fn(async () => ({})),
}))

import { retrieveOrder } from "./orders"

describe("retrieveOrder — outage vs genuine 404 (WB-092 C8)", () => {
  beforeEach(() => {
    retrieveMock.mockReset()
  })

  it("returns null on a genuine 404 (bad/foreign order id) so notFound() can fire", async () => {
    retrieveMock.mockRejectedValueOnce({ status: 404, message: "Order not found" })
    const result = await retrieveOrder("order_does_not_exist")
    expect(result).toBeNull()
  })

  it("rethrows on a 5xx instead of returning null", async () => {
    retrieveMock.mockRejectedValueOnce({
      response: { status: 500, data: "boom", config: {}, headers: {} },
    })
    await expect(retrieveOrder("order_500")).rejects.toThrow()
  })

  it("rethrows on a bare network failure (no status at all) instead of returning null", async () => {
    retrieveMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(retrieveOrder("order_network_fail")).rejects.toThrow()
  })

  it("resolves the order on success", async () => {
    retrieveMock.mockResolvedValueOnce({ order: { id: "order_ok" } })
    const result = await retrieveOrder("order_ok")
    expect(result).toEqual({ id: "order_ok" })
  })
})
