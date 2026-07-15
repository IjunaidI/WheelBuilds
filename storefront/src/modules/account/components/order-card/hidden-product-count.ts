// WB-093 A14 -- order-card rendered "+N more" using quantity math
// (`numberOfLines - 4`, a summed-quantity total minus a threshold that didn't
// match the actual slice size) gated on `numberOfProducts > 4`, while the
// visible grid only ever slices the first 3 items. A single order with a few
// high-quantity line items could show a wildly wrong "+N more", or show the
// badge (or not) inconsistently with how many product tiles were actually
// hidden.
//
// `hiddenProductCount` is the single source of truth: the number of hidden
// PRODUCTS (line items), derived directly from the same `shown` count used
// to slice the visible tiles. The caller should use it for both the gate
// (`hiddenProductCount(...) > 0`) and the displayed number.
export function hiddenProductCount<T>(
  items: T[] | null | undefined,
  shown: number
): number {
  const total = items?.length ?? 0
  return Math.max(total - shown, 0)
}
