// storefront/src/lib/util/cart-redirect.test.ts
//
// WB-096 X8 bug 1 -- the middleware self-redirect loop.
//
// A `?cart_id=X` deep link that arrives with NO `_medusa_cart_id` cookie yet
// AND a `step` already set (e.g. a payment-step link shared back to a
// customer) used to fall through middleware.ts's early `next()` gate (its
// third clause, `!cartId || cartIdCookie`, is false) and then skip the ONLY
// cookie-setting branch too, because that branch was gated on
// `cartId && !checkoutStep` -- same condition as "should we append
// `&step=address`", which is wrong: the cookie needs to be set whenever the
// cookie is missing, regardless of whether a step is already present. With
// no branch left to change the URL or set the cookie, the pre-fix code fell
// back to `NextResponse.redirect(request.nextUrl.href, 307)` -- a redirect
// to the exact URL it was given -- forever.
//
// `resolveCartRedirect` decouples the two concerns: whether to redirect at
// all (append `&step=address`, only when no step is present yet) and
// whether to set the cookie (whenever it's missing) so the caller
// (middleware.ts) can independently decide, per WB-096 X8, that "cookie
// needed but no URL change needed" must produce a `next()` + Set-Cookie,
// never a redirect.
import { describe, it, expect } from "vitest"
import { resolveCartRedirect } from "./cart-redirect"

describe("resolveCartRedirect", () => {
  it("no cart_id at all -- nothing to do", () => {
    expect(resolveCartRedirect(null, null, false)).toEqual({
      appendStep: false,
      setCookie: false,
    })
    expect(resolveCartRedirect(null, "payment", true)).toEqual({
      appendStep: false,
      setCookie: false,
    })
  })

  it("cart_id + no step + no cookie -- first-time deep link: redirect to the address step AND set the cookie", () => {
    expect(resolveCartRedirect("cart_123", null, false)).toEqual({
      appendStep: true,
      setCookie: true,
    })
  })

  it("cart_id + step already set + NO cookie -- the self-redirect-loop bug: must set the cookie WITHOUT appending a step redirect", () => {
    // This is the exact shape of the bug report: a `?cart_id=X&step=payment`
    // link with no `_medusa_cart_id` cookie yet. Pre-fix, this fell through
    // the `cartId && !checkoutStep` gate entirely (checkoutStep is truthy),
    // so neither the cookie nor a redirect target ever got produced, and
    // middleware.ts's fallback `redirectUrl = request.nextUrl.href` 307'd
    // the request back to itself.
    expect(resolveCartRedirect("cart_123", "payment", false)).toEqual({
      appendStep: false,
      setCookie: true,
    })
  })

  it("cart_id + step already set + cookie already present -- fully settled, no action", () => {
    expect(resolveCartRedirect("cart_123", "payment", true)).toEqual({
      appendStep: false,
      setCookie: false,
    })
  })

  it("cart_id + no step + cookie already present -- odd but real: still routes to the address step (unchanged pre-existing behavior), cookie already set so no re-set needed", () => {
    // NOTE: in practice middleware.ts's early gate (`!cartId || cartIdCookie`)
    // already short-circuits to `next()` before this case is ever reached --
    // included here purely to pin the pure function's own truth table.
    expect(resolveCartRedirect("cart_123", null, true)).toEqual({
      appendStep: true,
      setCookie: false,
    })
  })
})
