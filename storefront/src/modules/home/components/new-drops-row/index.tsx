import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
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
    <SectionHeader
      counter="08"
      title="New This Week"
      description="Fresh fitments from Blackline, Vanguard, Meridian and more — first to land, first to ship."
      action={<MicroLink href="/collections">View all 08</MicroLink>}
    />
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
