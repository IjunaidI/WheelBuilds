import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import { Finish } from "@modules/common/components/wheel"
import ProductCard from "./product-card"

const DROPS: {
  name: string
  brand: string
  price: string
  finish: Finish
}[] = [
  { name: "BLACKLINE BL-7", brand: "BLACKLINE FORGED", price: "1,249", finish: "black" },
  { name: "VANGUARD V8 MESH", brand: "VANGUARD", price: "1,049", finish: "bronze" },
  { name: "MERIDIAN GT", brand: "MERIDIAN", price: "1,389", finish: "silver" },
  { name: "RONIN R1 MONOBLOCK", brand: "RONIN MOTORSPORT", price: "1,899", finish: "black" },
  { name: "ATLAS AT-9", brand: "ATLAS OFFROAD", price: "789", finish: "bronze" },
  { name: "STRIKER S6", brand: "STRIKER", price: "949", finish: "black" },
]

const NewDropsRow = () => (
  <section style={{ padding: "120px 80px 80px" }}>
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 48,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
        <span
          className="display"
          style={{
            fontSize: 88,
            color: "var(--orange)",
            letterSpacing: "-0.02em",
          }}
        >
          08
        </span>
        <div style={{ paddingBottom: 12 }}>
          <div
            className="display"
            style={{ fontSize: 40, color: "var(--ink)" }}
          >
            New This Week
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--graphite)",
              marginTop: 6,
              maxWidth: 400,
            }}
          >
            Fresh fitments from Blackline, Vanguard, Meridian and more — first
            to land, first to ship.
          </div>
        </div>
      </div>
      <LocalizedClientLink
        href="/collections"
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
        View all 08 <Icon name="arrow-right" size={14} color="#FF6A00" />
      </LocalizedClientLink>
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 16,
      }}
    >
      {DROPS.map((d) => (
        <ProductCard key={d.name} {...d} isNew compact />
      ))}
    </div>
  </section>
)

export default NewDropsRow
