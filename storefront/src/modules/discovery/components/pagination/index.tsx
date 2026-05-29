"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Icon from "@modules/common/components/icon"
import { useDiscoveryQuery } from "../../data/use-discovery-query"

type DiscoveryPaginationProps = {
  currentPage: number
  totalPages: number
}

/**
 * Compact numeric pagination with prev/next. Truncates with ellipses when
 * there are more than 7 pages.
 */
const DiscoveryPagination = ({
  currentPage,
  totalPages,
}: DiscoveryPaginationProps) => {
  const { setPage } = useDiscoveryQuery()

  if (totalPages <= 1) return null

  const pages = buildPageList(currentPage, totalPages)

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1 mt-12 pt-6 border-t border-[var(--hairline)]"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setPage(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
      </Button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`gap-${i}`}
            className="px-2 text-[var(--ink-soft)] font-[var(--mono)] text-[12px]"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            aria-current={p === currentPage ? "page" : undefined}
            className={cn(
              "h-9 min-w-[36px] px-2.5 rounded-[var(--radius)] text-[13px] font-semibold font-[var(--mono)] transition-colors",
              p === currentPage
                ? "bg-[var(--ink)] text-white"
                : "text-[var(--ink)] hover:bg-[var(--soft)]"
            )}
          >
            {p.toString().padStart(2, "0")}
          </button>
        )
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <Icon name="arrow-right" size={14} />
      </Button>
    </nav>
  )
}

const buildPageList = (
  current: number,
  total: number
): (number | "...")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = Array.from(set)
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)
  const out: (number | "...")[] = []
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    out.push(cur)
    if (sorted[i + 1] != null && sorted[i + 1] - cur > 1) out.push("...")
  }
  return out
}

export default DiscoveryPagination
