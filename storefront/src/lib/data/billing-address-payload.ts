// Pure -- reads the `billing_address.*`-prefixed field names the
// profile-billing-address form actually submits (WB-093 A2). Unlike
// `updateCustomerAddress`/`addCustomerAddress` in `customer.ts`, which read
// UNPREFIXED names, this always stamps `is_default_billing: true` since it
// only ever backs the single billing-address slot.
//
// This lives in its own (non "use server") module because it is a
// synchronous, non-async pure helper -- every export of a "use server" file
// must be an async Server Action, so this cannot live in `customer.ts`.
//
// No `phone` field: `profile-billing-address/index.tsx` renders no phone
// input (its fields stop at `country_code`), so reading
// `billing_address.phone` here would always resolve to `null` -- a dead read
// that would silently wipe a phone number if some other flow ever set one on
// the default-billing address.
export const billingAddressPayload = (formData: FormData) => {
  return {
    first_name: formData.get("billing_address.first_name") as string,
    last_name: formData.get("billing_address.last_name") as string,
    company: formData.get("billing_address.company") as string,
    address_1: formData.get("billing_address.address_1") as string,
    address_2: formData.get("billing_address.address_2") as string,
    city: formData.get("billing_address.city") as string,
    postal_code: formData.get("billing_address.postal_code") as string,
    province: formData.get("billing_address.province") as string,
    country_code: formData.get("billing_address.country_code") as string,
    is_default_billing: true,
  }
}
