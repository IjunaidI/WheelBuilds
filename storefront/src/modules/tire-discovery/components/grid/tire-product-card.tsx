import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import Chip from "@modules/common/components/chip"
import TireFitBadge from "./tire-fit-badge"
import { TireDiscoveryProduct } from "../../data/types"
import { showOutOfStock } from "@modules/discovery/data/show-out-of-stock"
import { formatCentsUsd } from "@lib/util/money"

/** "18\"–22\"" for a range, "22\"" for one, "" for none. Exported for tests. */
export function rimRangeLabel(rims: number[]): string {
  if (!rims.length) return ""
  const min = rims[0]
  const max = rims[rims.length - 1]
  return min === max ? `${min}"` : `${min}"–${max}"`
}

type TireProductCardProps = { product: TireDiscoveryProduct }

const TireProductCard = ({ product }: TireProductCardProps) => {
  const rim = rimRangeLabel(product.rimDiameters)
  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="product-card group block"
      aria-label={`${product.brand} ${product.name}`}
    >
      <div className="relative aspect-square bg-[var(--soft)] flex items-center justify-center overflow-hidden">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={`${product.brand} ${product.name}`}
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-contain p-4"
          />
        ) : (
          <div className="h-[70%] w-[70%] rounded-full border-[10px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]" aria-hidden />
        )}
        {product.isNew && (
          <div className="absolute top-2.5 left-2.5">
            <Chip variant="accent" size="sm">NEW</Chip>
          </div>
        )}
        <TireFitBadge fitSpecs={product.fitSpecs} />
        {showOutOfStock(product.inStock) && (
          <div className="absolute bottom-2.5 right-2.5">
            <Chip
              size="sm"
              className="bg-[var(--ink-soft)] text-white hover:bg-[var(--ink-soft)]"
            >
              OUT OF STOCK
            </Chip>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1">
        <Label tone="muted" style={{ fontSize: 9, display: "block" }}>{product.brand}</Label>
        <Display size={16} as="div" style={{ marginTop: 2 }}>{product.name}</Display>

        <Label tone="muted" style={{ fontSize: 10, marginTop: 8, letterSpacing: "0.06em" }}>
          {product.sizeCount} {product.sizeCount === 1 ? "size" : "sizes"}{rim ? ` · ${rim}` : ""}
        </Label>

        <div className="border-t border-[var(--hairline)] mt-3 pt-3 flex items-baseline justify-between">
          {product.priceCents > 0 ? (
            <>
              <span className="text-[10px] font-[var(--mono)] uppercase tracking-[0.08em] text-[var(--ink-soft)]">From</span>
              <span className="font-[var(--display)] text-[18px] font-black text-[var(--ink)]">
                <span style={{ color: "var(--orange)" }}>$</span>
                {formatCentsUsd(product.priceCents).slice(1)}
              </span>
            </>
          ) : (
            <span className="text-[10px] font-[var(--mono)] uppercase tracking-[0.08em] text-[var(--ink-soft)]">Price on request</span>
          )}
        </div>
      </div>
    </LocalizedClientLink>
  )
}

export default TireProductCard
