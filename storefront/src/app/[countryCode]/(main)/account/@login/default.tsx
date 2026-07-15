// WB-093 A5 (review fix 1): `account/layout.tsx` renders exactly ONE of
// `dashboard`/`login` (`customer ? dashboard : login`) -- the other slot's
// subtree is discarded outright, its own `notFound()` guards never run. On a
// hard navigation/refresh to a nested `@dashboard` path (e.g.
// `/account/profile`, `/account/orders/details/:id`) while logged OUT, Next
// can't match the URL against `@login` (which has no nested routes), so it
// falls back to rendering THIS slot's `default.tsx` instead -- this is the
// reachable fallback, not `@dashboard/default.tsx`.
//
// `null` was wrong: it rendered an empty account shell (no nav, no content,
// just the footer) for every logged-out visitor hitting `/account/*` via a
// bookmark or browser history -- middleware doesn't gate `/account/*`. The
// fix is to render the same thing a fresh visit to `/account` would show:
// the sign-in form. This is safe for authed users too -- the layout discards
// this slot entirely when `customer` is truthy, so it never renders then.
export { default } from "./page"
