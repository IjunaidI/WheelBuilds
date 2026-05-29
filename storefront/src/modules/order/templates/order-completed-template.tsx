import { cookies } from "next/headers"

import CartTotals from "@modules/common/components/cart-totals"
import Display from "@modules/common/components/display"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel from "@modules/common/components/wheel"
import FitmentVerifiedCard from "@modules/checkout/components/fitment-verified-card"
import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import ShippingDetails from "@modules/order/components/shipping-details"
import PaymentDetails from "@modules/order/components/payment-details"
import { HttpTypes } from "@medusajs/types"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

/**
 * Order confirmation surface. Dark hero with a thank-you Display headline,
 * confirmation chip, and watermark wheel; below that, the FitmentVerified
 * card + estimated delivery + order details.
 *
 * Delivery-timeline ETA is computed at view time (today + 3 business days)
 * since we don't have a real fulfillment ETA wired yet.
 */
export default function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const isOnboarding = cookies().get("_medusa_onboarding")?.value === "true"

  const firstName = order.shipping_address?.first_name ?? "there"
  const etaStart = addBusinessDays(new Date(), 3)
  const etaEnd = addBusinessDays(new Date(), 5)

  return (
    <div className="bg-white">
      {isOnboarding && (
        <div className="px-5 small:px-10 pt-6">
          <OnboardingCta orderId={order.id} />
        </div>
      )}

      {/* Dark hero */}
      <div
        className="relative overflow-hidden text-white px-5 small:px-10 py-12 small:py-16"
        style={{ background: "var(--ink)" }}
      >
        <div
          aria-hidden
          className="absolute pointer-events-none hidden small:block"
          style={{ right: -80, top: -40, opacity: 0.15 }}
        >
          <Wheel size={520} finish="black" />
        </div>
        <div className="relative max-w-[880px]">
          <div className="inline-flex items-center gap-3 mb-5">
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{ width: 44, height: 44, background: "var(--orange)" }}
            >
              <Icon name="check" size={22} color="white" strokeWidth={2.5} />
            </span>
            <span
              className="font-[var(--mono)] text-[11px] tracking-[0.1em]"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              ORDER CONFIRMED · #{order.display_id ?? order.id.slice(-6).toUpperCase()}
            </span>
          </div>
          <Display
            size={48}
            as="h1"
            tone="inherit"
            className="small:!text-[80px]"
            style={{ color: "white" }}
          >
            Thanks, {firstName}.
            <br />
            Your wheels are
            <br />
            on the way.
          </Display>
          <p
            className="text-[14px] small:text-[16px] mt-5 max-w-[540px] leading-[1.5]"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            We&apos;ve sent a confirmation to{" "}
            <strong className="text-white">{order.email}</strong>. Tracking will
            hit your phone the moment we hand it to the carrier.
          </p>
        </div>
      </div>

      {/* Body — fitment + delivery + order details */}
      <div className="px-5 small:px-10 py-10 small:py-14 grid grid-cols-1 small:grid-cols-[1.5fr_1fr] gap-8 small:gap-12 max-w-[1280px] mx-auto">
        <div>
          <div className="mb-10">
            <Label tone="accent" style={{ marginBottom: 14, display: "block" }}>
              ESTIMATED DELIVERY
            </Label>
            <Display size={28} as="div" className="small:!text-[36px]">
              {formatRange(etaStart, etaEnd)}
            </Display>
            <div className="font-[var(--mono)] text-[11px] tracking-[0.04em] text-[var(--graphite)] mt-2 uppercase">
              FREE 2–3 DAY SHIPPING · UPS GROUND
            </div>
          </div>

          <div className="mb-10">
            <Label tone="ink" style={{ marginBottom: 14, display: "block" }}>
              YOUR ORDER
            </Label>
            <div
              className="rounded-lg px-4 small:px-5 bg-white"
              style={{ border: "1px solid var(--hairline)" }}
              data-testid="order-complete-container"
            >
              <Items items={order.items} />
              <div className="py-4">
                <CartTotals totals={order} />
              </div>
            </div>
          </div>

          <div className="mb-10">
            <Label tone="ink" style={{ marginBottom: 14, display: "block" }}>
              WHAT&apos;S NEXT
            </Label>
            <div className="grid grid-cols-1 xsmall:grid-cols-3 gap-3">
              {[
                {
                  i: "garage" as const,
                  h: "Add to your Garage",
                  s: "Track this build, get install tips",
                },
                {
                  i: "user" as const,
                  h: "Find a local installer",
                  s: "Verified partners in your area",
                },
                {
                  i: "heart" as const,
                  h: "Share your build",
                  s: "Tag #WHEELBUILDS for a feature",
                },
              ].map((b) => (
                <div
                  key={b.h}
                  className="rounded-md p-4"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  <Icon name={b.i} size={20} strokeWidth={1.5} />
                  <div className="text-[13px] font-semibold text-[var(--ink)] mt-2.5">
                    {b.h}
                  </div>
                  <div className="text-[11px] text-[var(--graphite)] mt-1 leading-[1.45]">
                    {b.s}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Help />
        </div>

        <aside className="flex flex-col gap-5">
          <FitmentVerifiedCard />
          <div
            className="rounded-lg bg-white px-5 py-4"
            style={{ border: "1px solid var(--hairline)" }}
          >
            <Label tone="ink" style={{ marginBottom: 12, display: "block" }}>
              ORDER #{order.display_id ?? order.id.slice(-6).toUpperCase()}
            </Label>
            <div className="font-[var(--mono)] text-[12px] text-[var(--graphite)] uppercase tracking-[0.04em]">
              {new Date(order.created_at).toDateString()}
            </div>
          </div>
          <div
            className="rounded-lg bg-white px-5 py-4"
            style={{ border: "1px solid var(--hairline)" }}
          >
            <ShippingDetails order={order} />
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--hairline)" }}>
              <PaymentDetails order={order} />
            </div>
          </div>
          <LocalizedClientLink
            href="/store"
            className="text-center text-[13px] font-semibold text-[var(--ink)] underline underline-offset-2"
          >
            Continue shopping
          </LocalizedClientLink>
        </aside>
      </div>
    </div>
  )
}

function addBusinessDays(d: Date, days: number) {
  const out = new Date(d)
  let added = 0
  while (added < days) {
    out.setDate(out.getDate() + 1)
    const day = out.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return out
}

function formatRange(a: Date, b: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  return `${a.toLocaleDateString("en-US", opts)} — ${b.toLocaleDateString("en-US", opts)}`
}
