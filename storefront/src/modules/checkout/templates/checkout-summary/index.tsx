import DiscountCode from "@modules/checkout/components/discount-code"
import FitmentVerifiedCard from "@modules/checkout/components/fitment-verified-card"
import TrustStrip from "@modules/checkout/components/trust-strip"
import Thumbnail from "@modules/products/components/thumbnail"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Label from "@modules/common/components/label"
import { cartTotalRows, type CartLikeTotals } from "@lib/util/cart-total-rows"
import { lineItemAmounts } from "@lib/util/line-item-amounts"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { isAffirmEnabled } from "@modules/checkout/components/express-pay/config"

type CheckoutSummaryProps = {
  cart: HttpTypes.StoreCart & { promotions?: HttpTypes.StorePromotion[] }
}

/**
 * Order column for the checkout page. Sticky on small+ so the FitmentVerified
 * card and totals stay visible while the user scrolls through the form.
 *
 * Composition (top → bottom):
 *   1. FitmentVerifiedCard (only when a garage vehicle is set AND at least
 *      one cart item genuinely fits/check-fits it — B12)
 *   2. Line items + add-on placeholders + discount input + totals
 *   3. Trust strip (free shipping / fitment guarantee / 30-day returns)
 */
const CheckoutSummary = ({ cart }: CheckoutSummaryProps) => {
  const itemCount =
    cart.items?.reduce((sum, i) => sum + (i.quantity ?? 0), 0) ?? 0

  return (
    <div className="sticky top-6 flex flex-col gap-5">
      <FitmentVerifiedCard items={cart.items} />

      <div
        className="rounded-lg bg-white px-5"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <div className="py-4 flex justify-between items-baseline">
          <Label tone="ink">
            In your cart · {itemCount} item{itemCount === 1 ? "" : "s"}
          </Label>
          <LocalizedClientLink
            href="/cart"
            className="text-[11px] text-[var(--graphite)] underline underline-offset-2"
          >
            Edit cart
          </LocalizedClientLink>
        </div>

        <div>
          {cart.items?.map((item) => (
            <LineItemRow key={item.id} item={item} currency={cart.currency_code} />
          ))}
        </div>

        <div
          className="py-4"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <DiscountCode cart={cart as any} />
        </div>

        <Totals cart={cart} />
      </div>

      <TrustStrip />
    </div>
  )
}

const LineItemRow = ({
  item,
  currency,
}: {
  item: HttpTypes.StoreCartLineItem
  currency: string
}) => {
  // WB-118 Q-01: the Store API cart response carries no `total` on a line
  // item, so `item.total ?? 0` rendered "$0.00" here too. `lineItemAmounts`
  // falls back to unit_price × quantity within the stored amounts.
  const { total, unitPrice: perEa } = lineItemAmounts(item)
  const variantOptions = item.variant?.options
    ?.map((o) => o.value)
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      className="flex gap-3.5 py-4"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      <div className="relative shrink-0">
        <div
          className="w-[72px] h-[72px] rounded-md flex items-center justify-center overflow-hidden"
          style={{ background: "var(--soft)" }}
        >
          <Thumbnail
            thumbnail={item.thumbnail}
            images={(item.variant as any)?.product?.images ?? []}
            size="square"
            className="!w-full !h-full"
          />
        </div>
        <span
          className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full text-white text-[11px] font-[var(--mono)]"
          style={{ width: 22, height: 22, background: "var(--ink)", fontWeight: 700 }}
        >
          {item.quantity}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {item.variant?.product?.collection && (
          <div className="font-[var(--mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--orange-deep)] mb-0.5">
            {item.variant.product.collection.title}
          </div>
        )}
        <div
          className="font-[var(--display)] text-[14px] text-[var(--ink)] uppercase leading-[1.1]"
          style={{ fontWeight: 900, letterSpacing: "0.01em" }}
        >
          {item.product_title ?? item.title}
        </div>
        {variantOptions && (
          <div className="font-[var(--mono)] text-[11px] tracking-[0.03em] text-[var(--graphite)] mt-1.5 uppercase">
            {variantOptions}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div
          className="font-[var(--display)] text-[16px] text-[var(--ink)]"
          style={{ fontWeight: 900 }}
        >
          <span style={{ color: "var(--orange-deep)" }}>$</span>
          {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        {item.quantity && item.quantity > 1 && (
          <div className="text-[10px] font-[var(--mono)] text-[var(--ink-soft)] mt-0.5">
            {convertToLocale({ amount: perEa, currency_code: currency })}/ea
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * WB-118 Q-02: rows come from `cartTotalRows`, the same helper `/cart` uses,
 * so the two surfaces cannot disagree with each other or with the charged
 * total. Do not reintroduce per-field reads here.
 *
 * The previous version rendered `subtotal + shipping_total + tax_total`, which
 * double-counted shipping (Medusa's `subtotal` already contains
 * `shipping_subtotal`, and `tax_total` already contains `shipping_tax_total`).
 * Measured live 2026-07-29: displayed 343.00 + 11.00 + 34.30 = 388.30 against
 * a charged total of 377.30.
 *
 * It also hard-coded "FREE" whenever shipping was 0 — which fired BEFORE a
 * shipping method had been selected, promising something not yet determined.
 * `cartTotalRows` omits the row until a method exists instead. If "FREE" is
 * wanted once a method IS selected and costs nothing, add it there (with a
 * test), not as a special case here.
 */
const Totals = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const { rows, total, currencyCode } = cartTotalRows(cart as CartLikeTotals)

  return (
    <div className="pt-2 pb-5" style={{ borderTop: "1px solid var(--hairline)" }}>
      {rows.map((row) => (
        <Row
          key={row.key}
          testId={`checkout-${row.key}`}
          label={row.label}
          value={`${row.negative ? "− " : ""}${convertToLocale({
            amount: row.amount,
            currency_code: currencyCode,
          })}`}
          accent={row.negative}
        />
      ))}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--ink)" }}>
        <div className="flex justify-between items-baseline">
          <span className="text-[13px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
            TOTAL
          </span>
          <span
            className="font-[var(--display)] text-[28px] text-[var(--ink)]"
            style={{ fontWeight: 900 }}
            data-testid="checkout-total"
          >
            <span style={{ color: "var(--orange)" }}>$</span>
            {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {isAffirmEnabled() && total > 0 && (
          <div
            className="text-right mt-1.5 font-[var(--mono)] text-[11px] tracking-[0.03em] text-[var(--ink-soft)]"
          >
            OR 4× ${(total / 4).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} WITH AFFIRM
          </div>
        )}
      </div>
    </div>
  )
}

const Row = ({
  label,
  value,
  accent,
  testId,
}: {
  label: string
  value: string
  accent?: boolean
  testId?: string
}) => (
  <div className="flex justify-between items-baseline py-1.5">
    <span className="text-[13px] text-[var(--graphite)]">{label}</span>
    <span
      className="text-[14px] font-medium"
      style={{ color: accent ? "var(--orange-deep)" : "var(--ink)" }}
      data-testid={testId}
    >
      {value}
    </span>
  </div>
)

export default CheckoutSummary
