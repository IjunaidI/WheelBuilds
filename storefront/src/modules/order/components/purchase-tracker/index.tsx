"use client"

import { useEffect } from "react"
import { track } from "@lib/analytics/track"

type PurchaseTrackerProps = {
  orderId: string
  value: number
  currency: string
  itemCount: number
}

/**
 * WB-096 X11: fires the `purchase` funnel event once the order-confirmed
 * page mounts. `OrderCompletedTemplate` (the page's actual content) is a
 * server component, so `window.plausible` isn't reachable there -- this is
 * the "tiny client component that fires on mount" the brief calls for,
 * rendered invisibly (`return null`) alongside the real template.
 *
 * Caveat: this fires once per mount, keyed by `orderId` via the effect
 * dependency array -- it does NOT dedupe across a hard refresh/revisit of
 * the same confirmation URL (there's no natural once-per-order signal
 * available client-side, e.g. no persisted "already tracked" flag). A
 * customer who refreshes `/order/confirmed/[id]` re-fires `purchase` for
 * that order. Acceptable per the brief; a future fix could dedupe via
 * sessionStorage keyed on orderId if double-counting becomes a real problem.
 */
export default function PurchaseTracker({
  orderId,
  value,
  currency,
  itemCount,
}: PurchaseTrackerProps) {
  useEffect(() => {
    track("purchase", {
      order_id: orderId,
      value,
      currency,
      item_count: itemCount,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  return null
}
