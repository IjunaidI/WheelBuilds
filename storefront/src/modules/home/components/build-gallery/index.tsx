import ImgPlaceholder from "@modules/common/components/img-placeholder"
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import Chip from "@modules/common/components/chip"

const TILES = [
  { w: 5, h: 4, name: "BLACKLINE BL-7" },
  { w: 4, h: 4, name: "MERIDIAN GT" },
  { w: 3, h: 4, name: "ATLAS AT-9" },
  { w: 3, h: 5, name: "RONIN R1" },
  { w: 5, h: 5, name: "VANGUARD V8" },
  { w: 4, h: 3, name: "STRIKER S6" },
  { w: 4, h: 4, name: "KAIDO K-09" },
  { w: 4, h: 3, name: "FORGEHAUS F-1" },
]

const Tile = ({ name, w, h }: (typeof TILES)[number]) => (
  <div
    className="build-tile relative aspect-square small:aspect-auto"
    style={{
      // Spans get media-queried OFF on mobile via .build-tile in
      // wheel-builds.css so the inline values don't fight the 2-col grid.
      gridColumn: `span ${w}`,
      gridRow: `span ${h}`,
    }}
  >
    <ImgPlaceholder
      label="VEHICLE BUILD"
      dark
      radius={6}
      style={{ width: "100%", height: "100%" }}
    />
    <div style={{ position: "absolute", left: 12, bottom: 12 }}>
      <Chip variant="outline" size="sm" dot>
        ON {name}
      </Chip>
    </div>
  </div>
)

const BuildGallery = () => (
  <section
    className="px-5 py-16 xsmall:px-8 small:px-20 small:py-[120px]"
    style={{ background: "var(--soft)" }}
  >
    <SectionHeader
      eyebrow="#WHEELBUILDS · 14.2K POSTS"
      title="Shot by our community."
      action={<MicroLink href="#">Explore the gallery</MicroLink>}
    />
    {/* Mobile: simple 2-col aspect-square grid. small+: editorial 12-col
        with mixed spans (the span values on the tiles only take effect
        because the parent declares grid-template-columns: repeat(12,...)). */}
    <div
      className="grid grid-cols-2 small:grid-cols-12 gap-3"
      style={{ gridAutoRows: "70px" }}
    >
      {TILES.map((t) => (
        <Tile key={t.name} {...t} />
      ))}
    </div>
  </section>
)

export default BuildGallery
