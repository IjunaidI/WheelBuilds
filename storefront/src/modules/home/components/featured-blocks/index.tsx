import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Wheel from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import { getFeaturedProducts } from "@modules/home/data/get-featured"
import type { DiscoveryProduct } from "@modules/discovery/data/types"

const money = (cents: number) => Math.round(cents / 100).toLocaleString()

const Stat = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div>
    <Label tone="muted" style={{ fontSize: 10, display: "block" }}>
      {l}
    </Label>
    <Display size={20} as="div" className="small:!text-[22px]" style={{ marginTop: 4 }}>
      {v}
    </Display>
  </div>
)

const EditorialBlock = ({
  product,
  idx,
  total,
  flip,
}: {
  product: DiscoveryProduct
  idx: number
  total: number
  flip: boolean
}) => (
  <div
    className={`grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16 items-center px-5 py-12 xsmall:px-8 small:px-20 small:py-20 ${
      flip ? "small:[direction:rtl]" : ""
    }`}
  >
    <div className="relative" style={{ direction: "ltr" }}>
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-[var(--soft)]"
        style={{ aspectRatio: "4/3" }}
      >
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={`${product.brand} ${product.name}`}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-8"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Wheel size={220} finish={product.finishes[0] ?? "black"} />
          </div>
        )}
      </div>
      <div className="counter" style={{ position: "absolute", top: 20, left: 20 }}>
        FT.0{idx} / 0{total}
      </div>
    </div>
    <div style={{ direction: "ltr" }}>
      <Label style={{ marginBottom: 14, display: "block" }}>FEATURED · {product.brand}</Label>
      <Display size={36} as="h3" className="small:!text-[56px]">
        {product.name}
      </Display>
      <div className="grid grid-cols-2 small:grid-cols-4 gap-5 mt-7 mb-7 border-y border-[var(--hairline)] py-5">
        {product.diameter > 0 && <Stat l="DIAMETER" v={`${product.diameter}"`} />}
        {product.width > 0 && <Stat l="WIDTH" v={`${product.width}"`} />}
        {product.boltPattern && <Stat l="BOLT" v={product.boltPattern} />}
        <Stat
          l="FROM"
          v={
            <span>
              <span style={{ color: "var(--orange)" }}>$</span>
              {money(product.priceCents)}
            </span>
          }
        />
      </div>
      <Button asChild className="w-full small:w-auto">
        <LocalizedClientLink href={`/products/${product.handle}`}>
          Shop This Wheel <Icon name="arrow-right" size={16} color="white" />
        </LocalizedClientLink>
      </Button>
    </div>
  </div>
)

const FeaturedBlocks = async () => {
  const products = await getFeaturedProducts(3)
  if (products.length === 0) return null

  return (
    <section style={{ borderTop: "1px solid var(--hairline)" }}>
      {products.map((p, i) => (
        <div key={p.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
          <EditorialBlock product={p} idx={i + 1} total={products.length} flip={i % 2 === 1} />
        </div>
      ))}
    </section>
  )
}

export default FeaturedBlocks
