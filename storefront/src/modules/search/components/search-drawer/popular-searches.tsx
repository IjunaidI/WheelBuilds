"use client"

import { useParams, useRouter } from "next/navigation"
import { addRecentSearch } from "@lib/stores/recent-searches"

const POPULAR = [
  "22 inch",
  "Bronze finish",
  "6×135",
  "Beadlock",
  "Forged",
  "Concave",
  "Truck wheels",
]

type PopularSearchesProps = {
  onClose: () => void
}

const PopularSearches = ({ onClose }: PopularSearchesProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }

  const submit = (q: string) => {
    addRecentSearch(q)
    onClose()
    router.push(`/${countryCode}/results/${encodeURIComponent(q)}`)
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div className="label" style={{ marginBottom: 12, color: "var(--ink)" }}>
        Popular searches
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {POPULAR.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => submit(p)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 30,
              padding: "0 12px",
              background: "var(--soft)",
              border: "1px solid var(--hairline)",
              borderRadius: 15,
              fontSize: 12,
              color: "var(--ink)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

export default PopularSearches
