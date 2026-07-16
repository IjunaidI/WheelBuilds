import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import { cn } from "@/lib/utils"

type MicroLinkProps = {
  href: string
  /** Defaults to true. Set false for trailing-text-only variants. */
  arrow?: boolean
  /** Tone: `accent` (orange, default) or `ink`. */
  tone?: "accent" | "ink"
  className?: string
  children: React.ReactNode
}

/**
 * The recurring "VIEW ALL 08 →" / "EXPLORE →" / "BROWSE BRANDS →" pattern that
 * sits at the end of every section. Mono uppercase + tight letter-spacing +
 * inline arrow icon. Always a country-scoped link.
 *
 *   <MicroLink href="/collections">View all 08</MicroLink>
 *   <MicroLink href="/categories" tone="ink">Explore</MicroLink>
 */
const MicroLink = ({
  href,
  arrow = true,
  tone = "accent",
  className,
  children,
}: MicroLinkProps) => {
  // WB-096 X6: --orange-deep — this is 12px mono accent text, needs the
  // 4.5:1 AA floor. The trailing arrow icon keeps its own hardcoded fill
  // below (icon glyph, not text — out of this task's scope).
  const color = tone === "accent" ? "var(--orange-deep)" : "var(--ink)"
  return (
    <LocalizedClientLink
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] no-underline transition-opacity hover:opacity-75",
        className
      )}
      style={{ color }}
    >
      {children}
      {arrow && (
        <Icon
          name="arrow-right"
          size={14}
          color={tone === "accent" ? "#FF6A00" : "#0B0B0C"}
          strokeWidth={2}
        />
      )}
    </LocalizedClientLink>
  )
}

export default MicroLink
