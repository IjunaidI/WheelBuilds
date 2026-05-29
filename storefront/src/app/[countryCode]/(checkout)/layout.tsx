import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Logo from "@modules/common/components/logo"

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="frame w-full bg-white relative small:min-h-screen">
      <div className="h-16 border-b border-[var(--hairline)] bg-white">
        <nav className="flex h-full items-center justify-between px-5 small:px-10">
          <LocalizedClientLink
            href="/cart"
            className="flex items-center gap-3"
            data-testid="back-to-cart-link"
          >
            <Logo size={16} />
            <span className="hidden small:inline font-[var(--mono)] text-[11px] tracking-[0.06em] text-[var(--ink-soft)] uppercase">
              / CHECKOUT
            </span>
          </LocalizedClientLink>
          <div className="flex items-center gap-4 small:gap-6 text-[12px] text-[var(--graphite)]">
            <span className="hidden small:inline-flex items-center gap-2">
              <Icon name="shield" size={14} strokeWidth={1.6} />
              <span className="font-[var(--mono)] text-[11px] tracking-[0.06em]">
                SECURE · SSL ENCRYPTED
              </span>
            </span>
            <span
              className="hidden small:inline-block"
              style={{ width: 1, height: 14, background: "var(--hairline)" }}
            />
            <a
              href="tel:+18555557433"
              className="text-[12px] font-medium text-[var(--graphite)] hover:text-[var(--ink)] no-underline"
            >
              <span className="hidden small:inline">Need help? </span>
              <span className="small:hidden inline-flex items-center gap-1.5">
                <Icon name="shield" size={14} strokeWidth={1.6} />
              </span>
              <span className="hidden xsmall:inline">(855) 555-RIDE</span>
            </a>
          </div>
        </nav>
      </div>
      <div className="relative" data-testid="checkout-container">{children}</div>
      <div className="border-t border-[var(--hairline)] py-6 px-5 small:px-10 flex flex-col small:flex-row gap-4 small:gap-0 justify-between items-center bg-white">
        <div className="font-[var(--mono)] text-[10px] tracking-[0.06em] text-[var(--ink-soft)] uppercase text-center small:text-left">
          © {new Date().getFullYear()} WHEEL/BUILDS · TERMS · PRIVACY · REFUND POLICY
        </div>
        <div className="flex items-center gap-2">
          {["VISA", "MC", "AMEX", "DISC", "APPLE", "GPAY"].map((n) => (
            <span
              key={n}
              className="font-[var(--mono)] text-[10px] text-[var(--graphite)] px-2 py-1 rounded-sm bg-white"
              style={{ border: "1px solid var(--hairline)", fontWeight: 700 }}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
