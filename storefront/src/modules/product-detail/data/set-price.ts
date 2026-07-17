/**
 * Set-total row for the PDP purchase panels (WB-098 Task 2) — a plain
 * (non-`"use server"`) module, same reasoning as `backspacing.ts`: this is a
 * synchronous pure function, and every export of a `"use server"` file must
 * be async.
 *
 * The price row headlines "$369.99 PER WHEEL/TIRE" while the default
 * quantity is 4 (`DEFAULT_WHEEL_QTY` / `DEFAULT_TIRE_QTY`) — a shopper never
 * sees the actual set total until the cart. `setPriceLine` derives the
 * "$X × N = $Y per set" sub-line from the same `unitPriceCents`/`quantity`
 * already in scope on both panels; it does no new pricing math, just formats
 * what `lineTotalCents` on each panel already computes.
 */

import { formatCentsUsd } from "@lib/util/money"
import { SET_PRICE_SUFFIX } from "./pdp-config"

export type SetPriceLine = {
  /** False for qty <= 1 (nothing to add up) or a null unit price (nothing to multiply). */
  show: boolean
  text: string
}

export function setPriceLine(
  unitCents: number | null,
  qty: number
): SetPriceLine {
  if (unitCents == null || qty <= 1) {
    return { show: false, text: "" }
  }
  const totalCents = unitCents * qty
  return {
    show: true,
    text: `${formatCentsUsd(unitCents)} × ${qty} = ${formatCentsUsd(totalCents)} ${SET_PRICE_SUFFIX}`,
  }
}
