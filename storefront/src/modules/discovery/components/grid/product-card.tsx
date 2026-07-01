import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel from "@modules/common/components/wheel"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import Chip from "@modules/common/components/chip"
import FitBadge from "./fit-badge"
import { DiscoveryProduct } from "../../data/types"

const FINISH_SWATCH: Record<string, string> = {
  black: "#1A1A1B",
  bronze: "#9C6A3F",
  silver: "#C8C8CB",
}

const formatPrice = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString()}`

type DiscoveryProductCardProps = {
  product: DiscoveryProduct
  /** When true (discovery fit mode), link to the PDP with ?fit=1 so the PDP filters variants to the active vehicle. */
  fit?: boolean
}

/**
 * Discovery product card — the canonical product tile. Renders the real vendor
 * thumbnail (with a <Wheel> fallback), a NEW chip, the FitBadge island, sale
 * pricing, and the variant summary. `handle` resolves to the real PDP. Reused
 * by the Discovery grid, the PDP "Similar wheels" row, and the home NEW THIS
 * WEEK rail.
 */
const DiscoveryProductCard = ({ product, fit = false }: DiscoveryProductCardProps) => (
  <LocalizedClientLink
    href={`/products/${product.handle}${fit ? "?fit=1" : ""}`}
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
        <Wheel size={180} finish={product.finishes[0] ?? "black"} />
      )}
      {product.isNew && (
        <div className="absolute top-2.5 left-2.5">
          <Chip variant="accent" size="sm">
            NEW
          </Chip>
        </div>
      )}
      <FitBadge patterns={product.boltPatternsCanonical} />
    </div>

    <div className="p-3 flex flex-col gap-1">
      <Label tone="muted" style={{ fontSize: 9, display: "block" }}>
        {product.brand}
      </Label>
      <Display size={16} as="div" style={{ marginTop: 2 }}>
        {product.name}
      </Display>

      <div className="flex items-center gap-1.5 mt-2">
        {(product.finishes.length ? product.finishes : ["black"]).slice(0, 3).map((f, i) => (
          <span
            key={`${f}-${i}`}
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--hairline)]"
            style={{ background: FINISH_SWATCH[f] ?? FINISH_SWATCH.black }}
          />
        ))}
        <Label
          tone="muted"
          style={{ fontSize: 10, marginLeft: 4, letterSpacing: "0.06em" }}
        >
          {product.diameter}" · {product.boltPattern}
        </Label>
      </div>

      <div className="border-t border-[var(--hairline)] mt-3 pt-3 flex items-baseline justify-between">
        <span className="text-[10px] font-[var(--mono)] uppercase tracking-[0.08em] text-[var(--ink-soft)]">
          From
        </span>
        <span className="flex items-baseline gap-2">
          {product.originalPriceCents && (
            <span className="text-[12px] text-[var(--ink-soft)] line-through">
              {formatPrice(product.originalPriceCents)}
            </span>
          )}
          <span className="font-[var(--display)] text-[18px] font-black text-[var(--ink)]">
            <span style={{ color: "var(--orange)" }}>$</span>
            {Math.round(product.priceCents / 100).toLocaleString()}
          </span>
        </span>
      </div>
    </div>
  </LocalizedClientLink>
)

export default DiscoveryProductCard
