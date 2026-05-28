"use client"

import { useParams, useRouter } from "next/navigation"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import {
  clearRecentSearches,
  useRecentSearches,
} from "@lib/stores/recent-searches"

type RecentSearchesProps = {
  onClose: () => void
}

const RecentSearches = ({ onClose }: RecentSearchesProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const recent = useRecentSearches()

  if (recent.length === 0) return null

  const go = (q: string) => {
    onClose()
    router.push(`/${countryCode}/store?q=${encodeURIComponent(q)}`)
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Label tone="ink">Recent</Label>
        <Button
          variant="link"
          size="sm"
          onClick={clearRecentSearches}
          className="h-auto p-0 text-[11px] font-normal text-[var(--ink-soft)] no-underline hover:text-[var(--ink)] hover:no-underline"
        >
          Clear
        </Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {recent.map((r, i) => (
          <button
            key={r}
            type="button"
            onClick={() => go(r)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderBottom:
                i < recent.length - 1 ? "1px solid var(--hairline)" : "none",
              background: "none",
              border: "none",
              borderRadius: 0,
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <Icon name="search" size={14} color="#8A8A8E" />
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: "var(--graphite)",
                fontFamily: "var(--mono)",
              }}
            >
              {r}
            </span>
            <Icon
              name="arrow-right"
              size={12}
              color="#8A8A8E"
              style={{ transform: "rotate(-45deg)" }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export default RecentSearches
