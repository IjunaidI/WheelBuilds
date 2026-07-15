// storefront/src/lib/data/customer.billing-address.test.ts
//
// WB-093 A2 -- the billing-address form bound `updateCustomerAddress` with no
// `addressId`, and its fields are named `billing_address.first_name` etc.,
// but that action reads UNPREFIXED `formData.get("first_name")` -- so every
// field resolved to null and `is_default_billing` was never set. Every save
// silently failed, capping profile completion at 75% (overview.tsx's 4th
// point requires an `is_default_billing` address).
//
// `billingAddressPayload` is the pure fix: it reads the `billing_address.*`-
// prefixed names the form actually sends and always stamps
// `is_default_billing: true`. `updateCustomerBillingAddress` is a DEDICATED
// find-or-create action built on top of it -- it must NOT reuse/wrap the
// general `updateCustomerAddress`, which has no billing awareness and would
// clobber the flag if bound to some other address id.
import { describe, it, expect, vi, beforeEach } from "vitest"

const retrieveMock = vi.fn()
const updateAddressMock = vi.fn()
const createAddressMock = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: {
    store: {
      customer: {
        retrieve: (...args: any[]) => retrieveMock(...args),
        updateAddress: (...args: any[]) => updateAddressMock(...args),
        createAddress: (...args: any[]) => createAddressMock(...args),
      },
    },
  },
}))

vi.mock("./cookies", () => ({
  getAuthHeaders: vi.fn(async () => ({})),
  removeAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
}))

vi.mock("./cart", () => ({
  transferCartToCustomer: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}))

import { billingAddressPayload, updateCustomerBillingAddress } from "./customer"

function formDataWith(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

const FULL_FIELDS = {
  "billing_address.first_name": "Ada",
  "billing_address.last_name": "Lovelace",
  "billing_address.company": "Analytical Engines",
  "billing_address.address_1": "12 Main St",
  "billing_address.address_2": "Suite 4",
  "billing_address.city": "London",
  "billing_address.postal_code": "SW1A 1AA",
  "billing_address.province": "London",
  "billing_address.country_code": "gb",
  "billing_address.phone": "555-1234",
}

describe("billingAddressPayload (WB-093 A2)", () => {
  it("reads the billing_address.*-prefixed field names and stamps is_default_billing", () => {
    const payload = billingAddressPayload(formDataWith(FULL_FIELDS))

    expect(payload).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      company: "Analytical Engines",
      address_1: "12 Main St",
      address_2: "Suite 4",
      city: "London",
      postal_code: "SW1A 1AA",
      province: "London",
      country_code: "gb",
      phone: "555-1234",
      is_default_billing: true,
    })
  })

  it("does not read unprefixed field names (the WB-093 bug being fixed)", () => {
    // Simulates the old wrong binding: same values, unprefixed keys. These
    // must NOT leak into the payload -- every field should resolve falsy.
    const fd = formDataWith({ first_name: "Ada", last_name: "Lovelace" })
    const payload = billingAddressPayload(fd)

    expect(payload.first_name).toBeFalsy()
    expect(payload.last_name).toBeFalsy()
  })

  it("always sets is_default_billing: true even on a mostly-empty form", () => {
    const fd = formDataWith({ "billing_address.first_name": "Ada" })
    expect(billingAddressPayload(fd).is_default_billing).toBe(true)
  })
})

describe("updateCustomerBillingAddress -- find-or-create (WB-093 A2)", () => {
  beforeEach(() => {
    retrieveMock.mockReset()
    updateAddressMock.mockReset()
    createAddressMock.mockReset()
  })

  it("updates the existing is_default_billing address when one exists", async () => {
    retrieveMock.mockResolvedValueOnce({
      customer: {
        addresses: [
          { id: "addr_other", is_default_billing: false },
          { id: "addr_billing", is_default_billing: true },
        ],
      },
    })
    updateAddressMock.mockResolvedValueOnce({ customer: {} })

    const result = await updateCustomerBillingAddress(
      { success: false, error: null },
      formDataWith(FULL_FIELDS)
    )

    expect(updateAddressMock).toHaveBeenCalledTimes(1)
    expect(updateAddressMock.mock.calls[0][0]).toBe("addr_billing")
    expect(updateAddressMock.mock.calls[0][1]).toMatchObject({
      first_name: "Ada",
      is_default_billing: true,
    })
    expect(createAddressMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, error: null })
  })

  it("creates a new address when no is_default_billing address exists", async () => {
    retrieveMock.mockResolvedValueOnce({
      customer: {
        addresses: [{ id: "addr_other", is_default_billing: false }],
      },
    })
    createAddressMock.mockResolvedValueOnce({ customer: {} })

    const result = await updateCustomerBillingAddress(
      { success: false, error: null },
      formDataWith(FULL_FIELDS)
    )

    expect(createAddressMock).toHaveBeenCalledTimes(1)
    expect(createAddressMock.mock.calls[0][0]).toMatchObject({
      first_name: "Ada",
      is_default_billing: true,
    })
    expect(updateAddressMock).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, error: null })
  })

  it("creates a new address when the customer has no addresses at all", async () => {
    retrieveMock.mockResolvedValueOnce({ customer: { addresses: [] } })
    createAddressMock.mockResolvedValueOnce({ customer: {} })

    await updateCustomerBillingAddress(
      { success: false, error: null },
      formDataWith(FULL_FIELDS)
    )

    expect(createAddressMock).toHaveBeenCalledTimes(1)
  })

  it("returns { success: false, error } instead of throwing on an SDK failure", async () => {
    retrieveMock.mockResolvedValueOnce({ customer: { addresses: [] } })
    createAddressMock.mockRejectedValueOnce(new Error("validation failed"))

    const result = await updateCustomerBillingAddress(
      { success: false, error: null },
      formDataWith(FULL_FIELDS)
    )

    expect(result.success).toBe(false)
    expect(typeof result.error).toBe("string")
  })

  it("falls through to create when the customer lookup itself fails", async () => {
    retrieveMock.mockRejectedValueOnce(new Error("network error"))
    createAddressMock.mockResolvedValueOnce({ customer: {} })

    const result = await updateCustomerBillingAddress(
      { success: false, error: null },
      formDataWith(FULL_FIELDS)
    )

    expect(createAddressMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true, error: null })
  })
})
