import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import ImgPlaceholder from "@modules/common/components/img-placeholder"

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
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 48,
      }}
    >
      <div>
        <div className="label" style={{ marginBottom: 12 }}>
          #WHEELBUILDS · 14.2K POSTS
        </div>
        <div className="display" style={{ fontSize: 40, color: "var(--ink)" }}>
          Shot by our
          <br />
          community.
        </div>
      </div>
      <LocalizedClientLink
        href="#"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--orange)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textDecoration: "none",
          display: "inline-flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        Explore the gallery <Icon name="arrow-right" size={14} color="#FF6A00" />
      </LocalizedClientLink>
    </div>
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
          <div
            className="build-chip"
            style={{ position: "absolute", left: 12, bottom: 12 }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: "var(--orange)",
              }}
            />
            ON {t.name}
          </div>
        </div>
      ))}
    </div>
  </section>
)

export default BuildGallery
