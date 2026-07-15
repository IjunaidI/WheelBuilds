"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { cache } from "react"
import { transferCartToCustomer } from "./cart"
import { getAuthHeaders, removeAuthToken, setAuthToken } from "./cookies"

export const getCustomer = cache(async function () {
  return await sdk.store.customer
    .retrieve({}, { next: { tags: ["customer"] }, ...(await getAuthHeaders()) })
    .then(({ customer }) => customer)
    .catch(() => null)
})

export const updateCustomer = cache(async function (
  body: HttpTypes.StoreUpdateCustomer
) {
  const updateRes = await sdk.store.customer
    .update(body, {}, await getAuthHeaders())
    .then(({ customer }) => customer)
    .catch(medusaError)

  revalidateTag("customer")
  return updateRes
})

export async function signup(_currentState: unknown, formData: FormData) {
  const password = formData.get("password") as string
  const countryCode = (formData.get("countryCode") as string) || ""
  const customerForm = {
    email: formData.get("email") as string,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    phone: formData.get("phone") as string,
  }

  try {
    const token = await sdk.auth.register("customer", "emailpass", {
      email: customerForm.email,
      password: password,
    })

    const customHeaders = { authorization: `Bearer ${token}` }
    
    const { customer: createdCustomer } = await sdk.store.customer.create(
      customerForm,
      {},
      customHeaders
    )

    const loginToken = await sdk.auth.login("customer", "emailpass", {
      email: customerForm.email,
      password,
    })

    await setAuthToken(typeof loginToken === 'string' ? loginToken : loginToken.location)
    await transferCartToCustomer()

    revalidateTag("customer")
  } catch (error: any) {
    return error.toString()
  }

  // Redirect OUTSIDE the try/catch (see login()): never return the customer
  // object — useFormState would pipe it into <ErrorMessage> and render an object
  // as a React child (React #31, crashes the page). The fresh navigation lands
  // the now-authenticated user on their account dashboard.
  redirect(`/${countryCode}/account`)
}

export async function login(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const countryCode = (formData.get("countryCode") as string) || ""

  try {
    const token = await sdk.auth.login("customer", "emailpass", { email, password })
    await setAuthToken(typeof token === "string" ? token : token.location)
    await transferCartToCustomer()
    revalidateTag("customer")
  } catch (error: any) {
    return error.toString()
  }

  // Redirect OUTSIDE the try/catch: redirect() throws NEXT_REDIRECT, which the
  // catch would otherwise swallow and stringify. The fresh navigation re-runs
  // the account layout (account/layout.tsx) with the new auth cookie so it
  // renders the dashboard slot — revalidateTag alone does not reliably
  // re-render the parallel-route slot, so a correct login appeared to do
  // nothing. Mirrors signout()'s set-cookie-then-redirect pattern.
  redirect(`/${countryCode}/account`)
}

export async function forgotPassword(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string

  try {
    await sdk.auth.resetPassword("customer", "emailpass", { identifier: email })
  } catch (error: any) {
    // Swallow — never reveal whether the account exists (no enumeration).
    // The form renders the same neutral copy regardless of outcome.
    console.error("forgotPassword:", error?.toString?.())
  }

  return "SENT"
}

export async function resetPassword(_currentState: unknown, formData: FormData) {
  const token = formData.get("token") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const confirm = formData.get("confirm") as string
  const countryCode = (formData.get("countryCode") as string) || "us"

  if (!token || !email) {
    return "This reset link is invalid or has expired."
  }

  if (password !== confirm) {
    return "Passwords do not match."
  }

  try {
    await sdk.auth.updateProvider(
      "customer",
      "emailpass",
      { email, password },
      token
    )
  } catch (error: any) {
    return error?.toString?.() ?? "Could not reset your password. The link may have expired."
  }

  // Redirect OUTSIDE the try/catch (see login()/signup()): redirect() throws
  // NEXT_REDIRECT, which the catch would otherwise swallow and stringify.
  // updateProvider does not establish a session, so the customer lands back
  // on the login form (?reset=1 triggers the confirmation toast there).
  redirect(`/${countryCode}/account?reset=1`)
}

export async function signout(countryCode: string) {
  await sdk.auth.logout()
  removeAuthToken()
  revalidateTag("auth")
  revalidateTag("customer")
  redirect(`/${countryCode}/account`)
}

export const addCustomerAddress = async (
  _currentState: unknown,
  formData: FormData
): Promise<any> => {
  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
    phone: formData.get("phone") as string,
  }

  return sdk.store.customer
    .createAddress(address, {}, await getAuthHeaders())
    .then(({ customer }) => {
      revalidateTag("customer")
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  await sdk.store.customer
    .deleteAddress(addressId, await getAuthHeaders())
    .then(() => {
      revalidateTag("customer")
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const addressId = currentState.addressId as string

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
    phone: formData.get("phone") as string,
  }

  return sdk.store.customer
    .updateAddress(addressId, address, {}, await getAuthHeaders())
    .then(() => {
      revalidateTag("customer")
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

// Pure -- reads the `billing_address.*`-prefixed field names the
// profile-billing-address form actually submits (WB-093 A2). Unlike
// `updateCustomerAddress`/`addCustomerAddress` above, which read UNPREFIXED
// names, this always stamps `is_default_billing: true` since it only ever
// backs the single billing-address slot.
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
    phone: formData.get("billing_address.phone") as string,
    is_default_billing: true,
  }
}

// Dedicated find-or-create action for the billing address (WB-093 A2). Do
// NOT wrap/extend `updateCustomerAddress`: that action has no billing
// awareness, and reusing it here would risk stamping/clobbering
// `is_default_billing` on some OTHER address if it were ever bound with an
// unrelated addressId. Instead this looks up the customer's current
// `is_default_billing` address itself -- update it if one exists, else
// create a new one -- so the general address book (edit-address-modal.tsx)
// can never collide with the billing flow.
export const updateCustomerBillingAddress = async (
  _currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const address = billingAddressPayload(formData)
  const authHeaders = await getAuthHeaders()

  const customer = await sdk.store.customer
    .retrieve({}, authHeaders)
    .then(({ customer }) => customer)
    .catch(() => null)

  const billingAddress = customer?.addresses?.find(
    (addr) => addr.is_default_billing
  )

  try {
    if (billingAddress) {
      await sdk.store.customer.updateAddress(
        billingAddress.id,
        address,
        {},
        authHeaders
      )
    } else {
      await sdk.store.customer.createAddress(address, {}, authHeaders)
    }

    revalidateTag("customer")
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.toString() }
  }
}
