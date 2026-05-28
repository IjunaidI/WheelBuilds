"use client"

import { useParams, useRouter } from "next/navigation"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"
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
    router.push(`/${countryCode}/store?q=${encodeURIComponent(q)}`)
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <Label tone="ink" style={{ marginBottom: 12, display: "block" }}>
        Popular searches
      </Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {POPULAR.map((p) => (
          <Chip key={p} variant="outline" size="sm" onClick={() => submit(p)}>
            {p}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export default PopularSearches
