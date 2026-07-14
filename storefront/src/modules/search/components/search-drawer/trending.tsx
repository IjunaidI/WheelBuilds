"use client"

import { useParams, useRouter } from "next/navigation"
import Icon from "@modules/common/components/icon"
import Wheel from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button } from "@/components/ui/button"
import { formatCentsUsd } from "@lib/util/money"
import type { TrendingProduct } from "./trending-data"

type TrendingProps = {
  onClose: () => void
  /** Real newest-products, pre-mapped by toTrendingProducts (WB-085 N3). */
  products: TrendingProduct[]
}

const Trending = ({ onClose, products }: TrendingProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }

  if (products.length === 0) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Label tone="ink">Trending</Label>
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            onClose()
            router.push(`/${countryCode}/store`)
          }}
          className="h-auto p-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--orange)] no-underline hover:no-underline"
        >
          See all
        </Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {products.map((p) => (
          <LocalizedClientLink
            key={p.handle}
            href={`/products/${p.handle}`}
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 12px",
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              background: "white",
              width: "100%",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <Wheel size={56} finish={p.finish ?? "black"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label style={{ fontSize: 9, marginBottom: 2, display: "block" }}>
                {p.brand}
              </Label>
              <Display size={14} as="div">
                {p.name}
              </Display>
            </div>
            <Display size={15} as="div">
              <span style={{ color: "var(--orange)" }}>$</span>
              {formatCentsUsd(p.priceCents).slice(1)}
            </Display>
            <Icon name="arrow-right" size={14} color="#8A8A8E" />
          </LocalizedClientLink>
        ))}
      </div>
    </div>
  )
}

export default Trending
