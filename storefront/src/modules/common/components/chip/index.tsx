"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { cn } from "@/lib/utils"

type ChipProps = {
  /** Renders a clickable button. Provide `href` to render a link instead. */
  onClick?: () => void
  href?: string
  /** Visual variant. `soft` is the default neutral pill; `accent` is orange; `outline` is a hairline-bordered pill. */
  variant?: "soft" | "accent" | "outline"
  /** Compact / regular size. Defaults to regular. */
  size?: "sm" | "md"
  /** Render an orange leading dot. Used for fitment-confirmed chips. */
  dot?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * The recurring small-pill pattern used for popular searches, brand chips,
 * style chips, build chips, fitment chips, swatch labels. One component, three
 * visual variants. Replaces the per-section `style={{...}}` chips that drifted
 * apart visually.
 *
 *   <Chip onClick={...}>22 inch</Chip>
 *   <Chip variant="accent" dot>Fitment OK</Chip>
 *   <Chip variant="outline" size="sm">FORGED</Chip>
 *
 * Renders a link when `href` is provided (uses LocalizedClientLink under the
 * hood — country code is prepended). Otherwise renders a button.
 */
const Chip = ({
  onClick,
  href,
  variant = "soft",
  size = "md",
  dot = false,
  className,
  children,
}: ChipProps) => {
  const base = cn(
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors",
    size === "sm" ? "px-3 py-1 text-[11px]" : "px-3.5 py-1.5 text-[12px]",
    variant === "soft" &&
      "bg-[var(--soft)] text-[var(--ink)] hover:bg-[var(--hairline)]",
    variant === "accent" &&
      "bg-[var(--orange)] text-white hover:bg-[#E55A00]",
    variant === "outline" &&
      "border border-[var(--hairline)] bg-transparent text-[var(--ink)] hover:bg-[var(--soft)]",
    className
  )

  const content = (
    <>
      {dot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: variant === "accent" ? "white" : "var(--orange)",
          }}
        />
      )}
      {children}
    </>
  )

  if (href) {
    return (
      <LocalizedClientLink href={href} className={base}>
        {content}
      </LocalizedClientLink>
    )
  }

  return (
    <button type="button" onClick={onClick} className={base}>
      {content}
    </button>
  )
}

export default Chip
