"use client"

import { useParams, useRouter } from "next/navigation"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"

/**
 * Popular chips route to Discovery FACET FILTERS, not free-text `q`. The index's
 * searchable attributes are only title/brand/skus, so a free-text "22 inch" or
 * "Bronze finish" would land on a near-empty /store. Each chip below maps to a
 * real filter param parsed by parseQueryFromSearchParams (finishes / diameters),
 * so it lands on a populated, filtered grid. Finish buckets are guaranteed to
 * exist (every wheel normalizes into black/bronze/silver).
 */
const POPULAR: { label: string; param: string; value: string }[] = [
  { label: "Black", param: "finishes", value: "black" },
  { label: "Bronze", param: "finishes", value: "bronze" },
  { label: "Silver / polished", param: "finishes", value: "silver" },
  { label: '17"', param: "diameters", value: "17" },
  { label: '20"', param: "diameters", value: "20" },
  { label: '22"', param: "diameters", value: "22" },
]

type PopularSearchesProps = {
  onClose: () => void
}

const PopularSearches = ({ onClose }: PopularSearchesProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }

  const submit = (param: string, value: string) => {
    onClose()
    router.push(`/${countryCode}/store?${param}=${encodeURIComponent(value)}`)
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <Label tone="ink" style={{ marginBottom: 12, display: "block" }}>
        Popular searches
      </Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {POPULAR.map((p) => (
          <Chip
            key={p.label}
            variant="outline"
            size="sm"
            onClick={() => submit(p.param, p.value)}
          >
            {p.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export default PopularSearches
