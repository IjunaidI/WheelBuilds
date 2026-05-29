import Display from "@modules/common/components/display"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel from "@modules/common/components/wheel"
import { Button } from "@/components/ui/button"

/**
 * "Nothing in your cart" state served from the checkout route when the cart
 * is missing or empty. Uses the dark watermark wheel + headline layout from
 * the design bundle so users who hit /checkout direct still land somewhere
 * branded instead of a 404.
 */
const EmptyCart = () => (
  <div
    className="px-5 small:px-10 py-16 small:py-28"
    style={{ background: "var(--soft)", minHeight: "calc(100vh - 64px)" }}
  >
    <div className="max-w-[960px] mx-auto grid grid-cols-1 small:grid-cols-2 gap-12 small:gap-16 items-center">
      <div>
        <Label tone="accent" style={{ marginBottom: 14, display: "block" }}>
          CART · EMPTY
        </Label>
        <Display size={56} as="h1" className="small:!text-[88px]">
          Nothing
          <br />
          in your cart.
        </Display>
        <p className="text-[14px] small:text-[15px] text-[var(--graphite)] mt-5 mb-8 max-w-[400px] leading-[1.55]">
          Tell us what you drive and we&apos;ll show you only wheels confirmed
          to fit — in stock and ready to ship.
        </p>
        <div className="flex flex-col xsmall:flex-row gap-3">
          <Button asChild size="lg">
            <LocalizedClientLink href="/store">
              Browse wheels
              <Icon name="arrow-right" size={16} color="white" />
            </LocalizedClientLink>
          </Button>
          <Button asChild variant="outline" size="lg">
            <LocalizedClientLink href="/account">
              Open my Garage
            </LocalizedClientLink>
          </Button>
        </div>
      </div>
      <div className="relative flex justify-center items-center h-[280px] small:h-[440px]">
        <div className="wheel-glow absolute" style={{ inset: -20 }} />
        <Wheel size={280} finish="black" style={{ opacity: 0.4 }} />
      </div>
    </div>
  </div>
)

export default EmptyCart
