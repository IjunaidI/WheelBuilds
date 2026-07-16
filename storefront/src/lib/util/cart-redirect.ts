// WB-096 X8 bug 1 -- the middleware self-redirect loop.
//
// middleware.ts used to gate BOTH "append `&step=address` and redirect" AND
// "set the `_medusa_cart_id` cookie" on the exact same condition,
// `cartId && !checkoutStep`. That conflated two independent questions:
//   - should we redirect to the address step? (only when no step is set yet)
//   - should we set the cart cookie?          (whenever it's missing)
// A `?cart_id=X&step=payment` deep link with no `_medusa_cart_id` cookie yet
// has `checkoutStep` already truthy, so the combined gate never fired --
// the cookie was never set, no redirect target was ever built, and
// middleware.ts's own fallback (`redirectUrl = request.nextUrl.href`) 307'd
// the request back to the exact URL it was given. Forever: the next request
// arrives in exactly the same state (still no cookie), so the same 307
// fires again.
//
// This function decouples the two decisions so the caller can independently
// realize "cookie needs setting, but the URL itself needs no change" must
// produce a `next()` + Set-Cookie, never a redirect.
//
// Plain pure function, NOT a `"use server"` module -- mirrors
// `region-redirect.ts`'s pattern: sync, side-effect-free, unit-testable
// without Next's request machinery, safely callable from Edge middleware.
export interface CartRedirectDecision {
  /** Append "&step=address" to whatever redirect target is otherwise in
   * play, forcing a redirect even if nothing else changed. Only true when
   * a cart_id is present and no checkout step has been specified yet. */
  appendStep: boolean
  /** Set the `_medusa_cart_id` cookie on whatever response is ultimately
   * produced (redirect OR next()). True whenever a cart_id is present and
   * the cookie isn't already set -- independent of `appendStep`. */
  setCookie: boolean
}

export function resolveCartRedirect(
  cartId: string | null,
  checkoutStep: string | null,
  hasCartIdCookie: boolean
): CartRedirectDecision {
  if (!cartId) {
    return { appendStep: false, setCookie: false }
  }

  return {
    appendStep: !checkoutStep,
    setCookie: !hasCartIdCookie,
  }
}
