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
  <section className="px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-[120px] small:pb-20">
    <SectionHeader
      counter="08"
      title="New This Week"
      description="Fresh fitments from Blackline, Vanguard, Meridian and more — first to land, first to ship."
      action={<MicroLink href="/collections">View all 08</MicroLink>}
    />
    <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
      {DROPS.map((d) => (
        <ProductCard key={d.name} {...d} isNew compact />
      ))}
    </div>
  </section>
)

export default NewDropsRow
