/**
 * Pure pagination math for the account orders list (WB-093 A6).
 *
 * `listOrders` used to be hard-capped at a single page (limit 10, offset 0)
 * with no way to reach an 11th+ order -- it silently disappeared from the
 * site. This is the single source of truth for turning a 1-indexed `?page`
 * into the `{limit, offset}` pair `listOrders`/the Store API expect, kept in
 * a plain (non-"use server") module so it can be unit-tested directly --
 * `orders.ts` carries a top-level `"use server"` directive, and Next.js
 * requires every export from such a file to be an async function, which a
 * pure sync helper like this can't be.
 *
 * `page` is clamped to >= 1 defensively: a hand-edited `?page=0` or
 * `?page=-5` (or a non-numeric/NaN value) must not produce a negative
 * offset.
 */
export const ORDERS_PAGE_SIZE = 10

export function ordersPageParams(
  page: number,
  limit: number = ORDERS_PAGE_SIZE
): { limit: number; offset: number } {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  return { limit, offset: (safePage - 1) * limit }
}
