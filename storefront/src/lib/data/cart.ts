"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { extractMedusaMessage, isNotFoundError } from "@lib/util/error-message"
import { HttpTypes } from "@medusajs/types"
import { omit } from "lodash"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { getAuthHeaders, getCartId, removeCartId, setCartId } from "./cookies"
import { findInsufficientLines } from "./find-insufficient-lines"
import { getProductsById } from "./products"
import { getRegion } from "./regions"

export async function retrieveCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return null
  }

  return await sdk.store.cart
    .retrieve(cartId, {}, { next: { tags: ["cart"] }, ...(await getAuthHeaders()) })
    .then(({ cart }) => cart)
    .catch((err) => {
      // WB-092 C3a: a genuine 404 (cart deleted/completed/never existed) is
      // the expected "no active cart" case -- null lets callers render their
      // empty-cart state. Anything else (5xx, network failure) must NOT be
      // swallowed here: that used to render "you don't have anything in
      // your cart" to a customer who actually has one, masking a backend
      // outage. Rethrow so the nearest `error.tsx` boundary takes over.
      if (isNotFoundError(err)) {
        return null
      }
      throw err
    })
}

export async function getOrSetCart(countryCode: string) {
  let cart = await retrieveCart()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (!cart) {
    const cartResp = await sdk.store.cart.create(
      { region_id: region.id },
      {},
      await getAuthHeaders()
    )
    cart = cartResp.cart
    await setCartId(cart.id)
    revalidateTag("cart")
  }

  if (cart && cart?.region_id !== region.id) {
    await sdk.store.cart.update(
      cart.id,
      { region_id: region.id },
      {},
      await getAuthHeaders()
    )
    revalidateTag("cart")
  }

  return cart
}

// WB-079 B3: guest carts are created without an authenticated customer
// attached. On login/signup, transfer the cart cookie's cart to the newly
// authenticated customer so it (and the resulting order) links to their
// account instead of staying tied to a guest customer record. Non-fatal by
// design — a cart hiccup here must never block login/signup.
export async function transferCartToCustomer() {
  const cartId = await getCartId()
  if (!cartId) return
  try {
    await sdk.store.cart.transferCart(cartId, {}, await getAuthHeaders())
    revalidateTag("cart")
  } catch (e) {
    console.error("transferCartToCustomer:", e)
  }
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId()
  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  return sdk.store.cart
    .update(cartId, data, {}, await getAuthHeaders())
    .then(({ cart }) => {
      revalidateTag("cart")
      return cart
    })
    .catch(medusaError)
}

// WB-090 P2/P18: RETURN the outcome instead of throwing (mirrors placeOrder/
// setShippingMethod's WB-079 B2 fix) — Next.js redacts thrown Server Action
// error messages in production, which would silently swallow the real
// "insufficient inventory" text the purchase panels need in order to show
// "Only N in stock — reduce quantity" instead of a generic toast.
export async function addToCart({
  variantId,
  quantity,
  countryCode,
}: {
  variantId: string
  quantity: number
  countryCode: string
}): Promise<{ error?: string }> {
  if (!variantId) {
    return { error: "Missing variant ID when adding to cart." }
  }

  let cart: HttpTypes.StoreCart | undefined | null
  try {
    cart = await getOrSetCart(countryCode)
  } catch (e) {
    return { error: errText(e) }
  }
  if (!cart) {
    return { error: "Error retrieving or creating cart." }
  }

  return sdk.store.cart
    .createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      {},
      await getAuthHeaders()
    )
    .then(() => {
      revalidateTag("cart")
      return {}
    })
    .catch((e) => ({ error: errText(e) }))
}

// WB-092 C9: mirrors addToCart's B2 shape (RETURN { error } instead of
// throwing) -- Next.js redacts thrown Server Action error messages in
// production, so `.catch(medusaError)` here used to reach the customer as a
// generic masked error via item/index.tsx's `.catch((err) => setError(err.message))`.
export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string
  quantity: number
}): Promise<{ error?: string }> {
  if (!lineId) {
    return { error: "Missing lineItem ID when updating line item" }
  }

  const cartId = await getCartId()
  if (!cartId) {
    return { error: "Missing cart ID when updating line item" }
  }

  return sdk.store.cart
    .updateLineItem(cartId, lineId, { quantity }, {}, await getAuthHeaders())
    .then(() => {
      revalidateTag("cart")
      return {}
    })
    .catch((e) => ({ error: errText(e) }))
}

// WB-092 C9: same B2 conversion as updateLineItem above. DeleteButton
// (reused by both the full cart table and the mini-cart popover) surfaces
// the returned error via a sonner toast since neither surface has a shared
// inline-error slot.
export async function deleteLineItem(
  lineId: string
): Promise<{ error?: string }> {
  if (!lineId) {
    return { error: "Missing lineItem ID when deleting line item" }
  }

  const cartId = await getCartId()
  if (!cartId) {
    return { error: "Missing cart ID when deleting line item" }
  }

  return sdk.store.cart
    .deleteLineItem(cartId, lineId, await getAuthHeaders())
    .then(() => {
      revalidateTag("cart")
      return {}
    })
    .catch((e) => ({ error: errText(e) }))
}

export async function enrichLineItems(
  lineItems:
    | HttpTypes.StoreCartLineItem[]
    | HttpTypes.StoreOrderLineItem[]
    | null,
  regionId: string
) {
  if (!lineItems) return []

  // Prepare query parameters
  const queryParams = {
    ids: lineItems.map((lineItem) => lineItem.product_id!),
    regionId: regionId,
  }

  // Fetch products by their IDs
  const products = await getProductsById(queryParams)
  // If there are no line items or products, return an empty array
  if (!lineItems?.length || !products) {
    return []
  }

  // Enrich line items with product and variant information
  const enrichedItems = lineItems.map((item) => {
    const product = products.find((p: any) => p.id === item.product_id)
    const variant = product?.variants?.find(
      (v: any) => v.id === item.variant_id
    )

    // If product or variant is not found, return the original item
    if (!product || !variant) {
      return item
    }

    // If product and variant are found, enrich the item
    return {
      ...item,
      variant: {
        ...variant,
        product: omit(product, "variants"),
      },
    }
  }) as HttpTypes.StoreCartLineItem[]

  return enrichedItems
}

// Extracts a readable message from an SDK/axios-style error WITHOUT throwing —
// mirrors medusaError's message-extraction so prod-redacted Server Action
// throws (Next.js strips thrown error messages from client responses) don't
// mask the real reason. Server Actions must RETURN error strings, not throw
// user-facing copy.
function errText(error: any): string {
  const fromResponse = extractMedusaMessage(error)
  if (fromResponse) return fromResponse
  if (error?.request) return "No response received. Please try again."
  return error?.message || "An unexpected error occurred. Please try again."
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
}: {
  cartId: string
  shippingMethodId: string
}): Promise<{ error?: string }> {
  return sdk.store.cart
    .addShippingMethod(
      cartId,
      { option_id: shippingMethodId },
      {},
      await getAuthHeaders()
    )
    .then(() => {
      revalidateTag("cart")
      return {}
    })
    .catch((e) => ({ error: errText(e) }))
}

export async function initiatePaymentSession(
  cart: HttpTypes.StoreCart,
  data: {
    provider_id: string
    context?: Record<string, unknown>
  }
): Promise<{ error?: string; session?: HttpTypes.StorePaymentCollectionResponse }> {
  return sdk.store.payment
    .initiatePaymentSession(cart, data, {}, await getAuthHeaders())
    .then((resp) => {
      revalidateTag("cart")
      return { session: resp }
    })
    .catch((e) => ({ error: errText(e) }))
}

// WB-092 C9: same B2 conversion as updateLineItem/deleteLineItem above.
// Delegates to updateCart (left throwing per its other callers), so the
// thrown Error's `.message` -- already extracted by updateCart's own
// `.catch(medusaError)` -- is what errText falls through to here.
export async function applyPromotions(
  codes: string[]
): Promise<{ error?: string }> {
  const cartId = await getCartId()
  if (!cartId) {
    return { error: "No existing cart found" }
  }

  return updateCart({ promo_codes: codes })
    .then(() => {
      revalidateTag("cart")
      return {}
    })
    .catch((e) => ({ error: errText(e) }))
}

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData
) {
  const code = formData.get("code") as string
  const res = await applyPromotions([code])
  return res?.error
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(currentState: unknown, formData: FormData) {
  try {
    if (!formData) {
      throw new Error("No form data found when setting addresses")
    }
    const cartId = await getCartId()
    if (!cartId) {
      throw new Error("No existing cart found when setting addresses")
    }

    const data = {
      shipping_address: {
        first_name: formData.get("shipping_address.first_name"),
        last_name: formData.get("shipping_address.last_name"),
        address_1: formData.get("shipping_address.address_1"),
        address_2: formData.get("shipping_address.address_2"),
        company: formData.get("shipping_address.company"),
        postal_code: formData.get("shipping_address.postal_code"),
        city: formData.get("shipping_address.city"),
        country_code: formData.get("shipping_address.country_code"),
        province: formData.get("shipping_address.province"),
        phone: formData.get("shipping_address.phone"),
      },
      email: formData.get("email"),
    } as any

    const sameAsBilling = formData.get("same_as_billing")
    if (sameAsBilling === "on") data.billing_address = data.shipping_address

    if (sameAsBilling !== "on")
      data.billing_address = {
        first_name: formData.get("billing_address.first_name"),
        last_name: formData.get("billing_address.last_name"),
        address_1: formData.get("billing_address.address_1"),
        address_2: formData.get("billing_address.address_2"),
        company: formData.get("billing_address.company"),
        postal_code: formData.get("billing_address.postal_code"),
        city: formData.get("billing_address.city"),
        country_code: formData.get("billing_address.country_code"),
        province: formData.get("billing_address.province"),
        phone: formData.get("billing_address.phone"),
      }
    await updateCart(data)
  } catch (e: any) {
    return e.message
  }

  redirect(
    `/${formData.get("shipping_address.country_code")}/checkout?step=delivery`
  )
}

// WB-092 C2: preflight before payment CAPTURE. The Stripe provider is
// capture:true and StripePaymentButton.handlePayment calls
// stripe.confirmCardPayment (the REAL charge) before placeOrder() ever runs —
// so without this check, an out-of-stock line only surfaces AFTER the card
// is already charged (placeOrder's "if you were charged, it will be
// reversed" below is a reversal, not a prevention). Callers (every payment
// button's handlePayment, plus the Review step on mount) must await this
// FIRST and bail out — without calling the provider — when it errors.
//
// Mirrors placeOrder's B2 shape: RETURN { error } instead of throwing, since
// Next.js redacts thrown Server Action messages in production.
//
// Fails OPEN, never throws: a transient fetch failure here must not itself
// block a real, in-stock checkout — only a confirmed insufficient-stock line
// (computed from data we actually got back) blocks the charge.
export async function checkStockAvailability(
  cart: HttpTypes.StoreCart | null | undefined
): Promise<{ error?: string }> {
  if (!cart?.items?.length || !cart.region_id) {
    return {}
  }

  let liveVariants: HttpTypes.StoreProductVariant[]
  try {
    const productIds = Array.from(
      new Set(cart.items.map((item) => item.product_id).filter((id): id is string => !!id))
    )
    if (!productIds.length) return {}

    const products = await getProductsById({
      ids: productIds,
      regionId: cart.region_id,
    })
    liveVariants = (products ?? []).flatMap((p) => p.variants ?? [])
  } catch (e) {
    console.error("checkStockAvailability: failed to fetch live stock:", e)
    return {}
  }

  const insufficient = findInsufficientLines(cart.items, liveVariants)
  if (!insufficient.length) return {}

  const first = insufficient[0]
  return {
    error:
      first.available > 0
        ? `Only ${first.available} left of ${first.title} — reduce the quantity to continue.`
        : `${first.title} is out of stock — remove it to continue.`,
  }
}

export async function placeOrder(): Promise<{ error: string } | undefined> {
  const cartId = await getCartId()
  if (!cartId) {
    // WB-079 B2: Next.js redacts thrown Server Action error messages in
    // production, so any throw here reaches the customer as a generic
    // masked error. Return instead — the button components read `.error`.
    return { error: "No existing cart found when placing an order." }
  }

  let cartRes: HttpTypes.StoreCompleteCartResponse
  try {
    cartRes = await sdk.store.cart.complete(cartId, {}, await getAuthHeaders())
    revalidateTag("cart")
  } catch (e) {
    return { error: errText(e) }
  }

  // redirect() throws NEXT_REDIRECT by design and MUST stay outside any
  // try/catch above so Next.js can handle the navigation, not us.
  if (cartRes?.type === "order") {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase()
    // Best-effort: the card is already charged and the order already
    // created at this point, so a cookie-clear failure must never block
    // the confirmation redirect (that would strand the customer on a
    // stuck spinner after a successful, charged order).
    try {
      await removeCartId()
    } catch (e) {
      console.error("placeOrder: removeCartId failed post-order:", e)
    }
    redirect(`/${countryCode}/order/confirmed/${cartRes?.order.id}`)
  }

  // WB-071 F-C: Medusa returns the cart + an error object with HTTP 200 when
  // completion fails AFTER the card is authorized (e.g. inventory reservation).
  // The try/catch above never fires for this, so surface it explicitly rather
  // than returning silently and leaving the customer on a stopped spinner.
  return {
    error:
      (cartRes as any)?.error?.message ||
      "We couldn't complete your order. If you were charged, it will be reversed. Please try again.",
  }
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
export async function updateRegion(countryCode: string, currentPath: string) {
  const cartId = await getCartId()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (cartId) {
    await updateCart({ region_id: region.id })
    revalidateTag("cart")
  }

  revalidateTag("regions")
  revalidateTag("products")

  redirect(`/${countryCode}${currentPath}`)
}
