"use client"

import { useParams, useRouter } from "next/navigation"
import Icon from "@modules/common/components/icon"
import Wheel, { Finish } from "@modules/common/components/wheel"

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
        <span className="label" style={{ color: "var(--ink)" }}>
          Trending
        </span>
        <button
          type="button"
          onClick={() => {
            onClose()
            router.push(`/${countryCode}/store`)
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 11,
            color: "var(--orange)",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          See all
        </button>
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
              <div className="label" style={{ fontSize: 9, marginBottom: 2 }}>
                {t.brand}
              </div>
              <div
                style={{
                  fontFamily: "var(--display)",
                  fontWeight: 900,
                  fontSize: 14,
                  color: "var(--ink)",
                  textTransform: "uppercase",
                }}
              >
                {t.name}
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--display)",
                fontWeight: 900,
                fontSize: 15,
                color: "var(--ink)",
              }}
            >
              <span style={{ color: "var(--orange)" }}>$</span>
              {t.price}
            </div>
            <Icon name="arrow-right" size={14} color="#8A8A8E" />
          </button>
        ))}
      </div>
    </div>
  )
}

export default Trending
