import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import ImgPlaceholder from "@modules/common/components/img-placeholder"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"

type Block = {
  idx: string
  name: string
  brand: string
  blurb: string
  price: string
  flip?: boolean
}

const BLOCKS: Block[] = [
  {
    idx: "1",
    name: "MERIDIAN GT MONOBLOCK",
    brand: "MERIDIAN FORGED",
    blurb:
      "One-piece forged. 22-inch. Built for the long haul on the kind of streets you want to be seen on.",
    price: "1,389",
  },
  {
    idx: "2",
    name: "ATLAS AT-9 BEADLOCK",
    brand: "ATLAS OFFROAD",
    blurb:
      "Triple-step bead retention, hardcoat anodized lip. The trail wheel that doesn't look like a trail wheel.",
    price: "789",
    flip: true,
  },
  {
    idx: "3",
    name: "RONIN R1 MOTORSPORT",
    brand: "RONIN MOTORSPORT",
    blurb:
      "Magnesium-alloy track weapon. 14.7 lbs at 18×9.5. Built in Japan, cut in Long Beach.",
    price: "1,899",
  },
]

type Stat = { l: string; v: React.ReactNode }

const STATS_FOR = (price: string): Stat[] => [
  { l: "DIAMETER", v: "22\"" },
  { l: "WIDTH", v: "10\"" },
  { l: "FINISHES", v: "4" },
  {
    l: "FROM",
    v: (
      <span>
        <span style={{ color: "var(--orange)" }}>$</span>
        {price}
      </span>
    ),
  },
]

const EditorialBlock = ({ idx, name, brand, blurb, price, flip }: Block) => (
  <div
    className={`grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16 items-center px-5 py-12 xsmall:px-8 small:px-20 small:py-20 ${
      flip ? "small:[direction:rtl]" : ""
    }`}
  >
    <div className="relative" style={{ direction: "ltr" }}>
      <ImgPlaceholder
        label="VEHICLE PHOTO · 3/4 ANGLE"
        dark
        radius={16}
        style={{ width: "100%", aspectRatio: "4/3" }}
      />
      <div
        className="counter"
        style={{ position: "absolute", top: 20, left: 20 }}
      >
        FT.0{idx} / 06
      </div>
    </div>
    <div style={{ direction: "ltr" }}>
      <Label style={{ marginBottom: 14, display: "block" }}>
        FEATURED · {brand}
      </Label>
      <Display size={36} as="h3" className="small:!text-[56px]">
        {name}
      </Display>
      <p className="text-[15px] small:text-[16px] text-[var(--graphite)] mt-5 mb-7 max-w-[480px] leading-[1.55]">
        {blurb}
      </p>
      <div className="grid grid-cols-2 small:grid-cols-4 gap-5 mb-7 border-y border-[var(--hairline)] py-5">
        {STATS_FOR(price).map((s) => (
          <div key={s.l}>
            <Label tone="muted" style={{ fontSize: 10, display: "block" }}>
              {s.l}
            </Label>
            <Display size={20} as="div" className="small:!text-[22px]" style={{ marginTop: 4 }}>
              {s.v}
            </Display>
          </div>
        ))}
      </div>
      <Button asChild className="w-full small:w-auto">
        <LocalizedClientLink href="/store">
          Shop This Wheel <Icon name="arrow-right" size={16} color="white" />
        </LocalizedClientLink>
      </Button>
    </div>
  </div>
)

const FeaturedBlocks = () => (
  <section style={{ borderTop: "1px solid var(--hairline)" }}>
    {BLOCKS.map((b, i) => (
      <div
        key={b.idx}
        style={{
          borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
        }}
      >
        <EditorialBlock {...b} />
      </div>
    ))}
  </section>
)

export default FeaturedBlocks
