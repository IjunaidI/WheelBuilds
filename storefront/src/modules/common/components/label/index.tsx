import { cn } from "@/lib/utils"

type LabelProps = {
  /** Tone of the label. `accent` is orange (default), `muted` is the WB --ink-soft gray, `ink` is solid ink. */
  tone?: "accent" | "muted" | "ink"
  /** Render an orange leading bar before the text. Used by hero / section eyebrows. */
  bar?: boolean
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

const toneColor: Record<NonNullable<LabelProps["tone"]>, string> = {
  accent: "var(--orange)",
  muted: "var(--ink-soft)",
  ink: "var(--ink)",
}

/**
 * Mono uppercase eyebrow label. Replaces the inline `.label` / `.label-muted`
 * CSS class plus repeated mono/uppercase/letter-spacing inline styles across
 * the home, drawer, and footer.
 *
 *   <Label>FITMENT FIRST · STEP 01 OF 02</Label>
 *   <Label bar>FITMENT FIRST</Label>            // with orange leading bar
 *   <Label tone="muted">2 saved vehicles</Label>
 */
const Label = ({
  tone = "accent",
  bar = false,
  className,
  style,
  children,
}: LabelProps) => {
  if (bar) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-3 font-[var(--mono)] text-[11px] font-semibold uppercase tracking-[0.08em]",
          className
        )}
        style={{ color: toneColor[tone], ...style }}
      >
        <span
          aria-hidden
          className="inline-block h-px w-8"
          style={{ background: "var(--orange)" }}
        />
        {children}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "font-[var(--mono)] text-[11px] font-semibold uppercase tracking-[0.08em]",
        className
      )}
      style={{ color: toneColor[tone], ...style }}
    >
      {children}
    </span>
  )
}

export default Label
