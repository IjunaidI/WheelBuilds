// WB-093 A5: `@login` has no nested routes -- just this slot's root
// `page.tsx` (the sign-in form). Next can't match this slot against any of
// `@dashboard`'s nested paths (`/account/profile`, `/account/orders`,
// `/account/orders/details/:id`, `/account/addresses`). Without a
// `default.tsx`, a hard navigation/refresh to any of those routes 404s the
// WHOLE `account` layout, because Next has no fallback to render for the
// unmatched `@login` slot (this reproduces regardless of auth state -- it's
// a routing-match problem, not an auth check).
//
// `null` is the correct fallback here: whenever this slot's content would
// actually be used, either (a) the customer is authenticated and
// `account/layout.tsx` picks the `dashboard` slot instead (`customer ?
// dashboard : login`) -- this content is discarded -- or (b) the customer
// is NOT authenticated and the matched `@dashboard/**/page.tsx` itself
// guards on `getCustomer()`/`notFound()` (see e.g. `addresses/page.tsx`),
// so a real, logged-out visitor hitting a deep dashboard URL sees that
// page's own 404, not this slot's content anyway.
export default function LoginDefault() {
  return null
}
