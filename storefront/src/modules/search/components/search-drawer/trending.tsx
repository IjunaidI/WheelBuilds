"use client"

import { useParams, useRouter } from "next/navigation"
import Icon from "@modules/common/components/icon"
import Wheel, { Finish } from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"

const TRENDING: {
  name: string
  brand: string
  finish: Finish
  price: string
  query: string
}[] = [
  {
    name: "BLACKLINE BL-7",
    brand: "BLACKLINE FORGED",
    finish: "black",
    price: "1,249",
    query: "blackline bl-7",
  },
  {
    name: "VANGUARD V8 MESH",
    brand: "VANGUARD",
    finish: "bronze",
    price: "1,049",
    query: "vanguard v8",
  },
  {
    name: "ATLAS AT-9 BEADLOCK",
    brand: "ATLAS OFFROAD",
    finish: "bronze",
    price: "789",
    query: "atlas at-9",
  },
]

type TrendingProps = {
  onClose: () => void
}

const Trending = ({ onClose }: TrendingProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }

  const go = (q: string) => {
    onClose()
    router.push(`/${countryCode}/results/${encodeURIComponent(q)}`)
  }

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
        {TRENDING.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => go(t.query)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 12px",
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              background: "white",
              cursor: "pointer",
              width: "100%",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <Wheel size={56} finish={t.finish} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label style={{ fontSize: 9, marginBottom: 2, display: "block" }}>
                {t.brand}
              </Label>
              <Display size={14} as="div">
                {t.name}
              </Display>
            </div>
            <Display size={15} as="div">
              <span style={{ color: "var(--orange)" }}>$</span>
              {t.price}
            </Display>
            <Icon name="arrow-right" size={14} color="#8A8A8E" />
          </button>
        ))}
      </div>
    </div>
  )
}

export default Trending
