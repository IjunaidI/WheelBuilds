import { cn } from "@/lib/utils"

type DisplayProps = {
  /** Pixel font size. Defaults to 40 (the section-header size). */
  size?: number
  /** Color token. Defaults to ink. */
  tone?: "ink" | "orange" | "graphite" | "inherit"
  /** Render as a different element. Defaults to `h2`. Use `h1` for the hero, `span`/`div` for inline displays. */
  as?: keyof React.JSX.IntrinsicElements
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

const toneColor: Record<DisplayProps["tone"] & string, string> = {
  ink: "var(--ink)",
  orange: "var(--orange)",
  graphite: "var(--graphite)",
  inherit: "inherit",
}

/**
 * Antonio display headline. Replaces `<span className="display" style={{ fontSize: X, color: Y }}>`.
 * Size is a pixel number so callers stay in the same unit as DESIGN.md's size scale.
 *
 *   <Display size={132} as="h1">What do you drive?</Display>
 *   <Display size={88} tone="orange">08</Display>
 *   <Display>Shop by Style</Display>
 */
const Display = ({
  size = 40,
  tone = "ink",
  as: Tag = "h2",
  className,
  style,
  children,
}: DisplayProps) => {
  const TagAny = Tag as any
  return (
    <TagAny
      className={cn("display m-0", className)}
      style={{
        fontSize: size,
        lineHeight: size >= 88 ? 0.9 : size >= 40 ? 1 : 1.05,
        letterSpacing: size >= 88 ? "-0.025em" : "-0.01em",
        color: toneColor[tone],
        ...style,
      }}
    >
      {children}
    </TagAny>
  )
}

export default Display
