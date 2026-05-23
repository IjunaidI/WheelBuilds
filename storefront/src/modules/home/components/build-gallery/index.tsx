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

const BuildGallery = () => (
  <section
    style={{
      padding: "120px 80px",
      background: "var(--soft)",
    }}
  >
    <SectionHeader
      eyebrow="#WHEELBUILDS · 14.2K POSTS"
      title="Shot by our community."
      action={<MicroLink href="#">Explore the gallery</MicroLink>}
    />
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridAutoRows: "70px",
        gap: 12,
      }}
    >
      {TILES.map((t, i) => (
        <div
          key={i}
          style={{
            gridColumn: `span ${t.w}`,
            gridRow: `span ${t.h}`,
            position: "relative",
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
              ON {t.name}
            </Chip>
          </div>
        </div>
      ))}
    </div>
  </section>
)

export default BuildGallery
