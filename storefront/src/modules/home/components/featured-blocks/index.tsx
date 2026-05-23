import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import ImgPlaceholder from "@modules/common/components/img-placeholder"

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

const EditorialBlock = ({ idx, name, brand, blurb, price, flip }: Block) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 64,
      alignItems: "center",
      padding: "80px 80px",
      direction: flip ? "rtl" : "ltr",
    }}
  >
    <div style={{ direction: "ltr", position: "relative" }}>
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
      <div className="label" style={{ marginBottom: 14 }}>
        FEATURED · {brand}
      </div>
      <h3
        className="display"
        style={{ fontSize: 56, margin: 0, color: "var(--ink)" }}
      >
        {name}
      </h3>
      <p
        style={{
          fontSize: 16,
          color: "var(--graphite)",
          margin: "20px 0 28px",
          maxWidth: 480,
          lineHeight: 1.55,
        }}
      >
        {blurb}
      </p>
      <div
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 28,
          borderTop: "1px solid var(--hairline)",
          borderBottom: "1px solid var(--hairline)",
          padding: "20px 0",
        }}
      >
        {[
          { l: "DIAMETER", v: "22\"" as React.ReactNode },
          { l: "WIDTH", v: "10\"" as React.ReactNode },
          { l: "FINISHES", v: "4" as React.ReactNode },
          {
            l: "FROM",
            v: (
              <span>
                <span style={{ color: "var(--orange)" }}>$</span>
                {price}
              </span>
            ),
          },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div className="label-muted" style={{ fontSize: 10 }}>
              {s.l}
            </div>
            <div
              style={{
                fontFamily: "var(--display)",
                fontWeight: 900,
                fontSize: 22,
                marginTop: 4,
              }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>
      <LocalizedClientLink href="/store" className="btn btn-primary">
        Shop This Wheel <Icon name="arrow-right" size={16} color="white" />
      </LocalizedClientLink>
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
