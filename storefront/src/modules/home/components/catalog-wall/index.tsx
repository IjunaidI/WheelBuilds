import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel from "@modules/common/components/wheel"
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import Chip from "@modules/common/components/chip"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import type { DiscoveryProduct } from "@modules/discovery/data/types"

// Fixed visual rhythm (mixed 12-col spans on small+; .build-tile media-queries
// the spans off on mobile to a plain 2-col grid). Decorative layout only —
// content comes from real products.
const SPANS = [
  { w: 5, h: 4 },
  { w: 4, h: 4 },
  { w: 3, h: 4 },
  { w: 3, h: 5 },
  { w: 5, h: 5 },
  { w: 4, h: 3 },
  { w: 4, h: 4 },
  { w: 4, h: 3 },
]

const Tile = ({
  product,
  span,
}: {
  product: DiscoveryProduct
  span: { w: number; h: number }
}) => (
  <LocalizedClientLink
    href={`/products/${product.handle}`}
    className="build-tile relative aspect-square small:aspect-auto block overflow-hidden rounded-md bg-[var(--soft)]"
    style={{ gridColumn: `span ${span.w}`, gridRow: `span ${span.h}` }}
    aria-label={`${product.brand} ${product.name}`}
  >
    {product.thumbnail ? (
      <Image
        src={product.thumbnail}
        alt={`${product.brand} ${product.name}`}
        fill
        sizes="(min-width: 1024px) 40vw, 50vw"
        className="object-contain p-3"
      />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center">
        <Wheel size={120} finish={product.finish} />
      </div>
    )}
    <div style={{ position: "absolute", left: 12, bottom: 12 }}>
      <Chip variant="outline" size="sm" dot>
        {product.brand}
      </Chip>
    </div>
  </LocalizedClientLink>
)

const CatalogWall = async () => {
  const { newestProducts } = await getHomeCatalog()
  const tiles = newestProducts.slice(0, SPANS.length)
  if (tiles.length === 0) return null

  return (
    <section
      className="px-5 py-16 xsmall:px-8 small:px-20 small:py-[120px]"
      style={{ background: "var(--soft)" }}
    >
      <SectionHeader
        eyebrow="LATEST ARRIVALS"
        title="Straight off the truck."
        action={<MicroLink href="/store">Browse all wheels</MicroLink>}
      />
      <div className="grid grid-cols-2 small:grid-cols-12 gap-3" style={{ gridAutoRows: "70px" }}>
        {tiles.map((p, i) => (
          <Tile key={p.id} product={p} span={SPANS[i]} />
        ))}
      </div>
    </section>
  )
}

export default CatalogWall
