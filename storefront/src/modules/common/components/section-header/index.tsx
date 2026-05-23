import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"

type SectionHeaderProps = {
  /** Optional huge orange counter (e.g. "08"). Skips the column when absent. */
  counter?: string
  /** Optional small label above the title (e.g. "FRESH DROPS"). String is auto-wrapped in `<Label>`; pass a node for full control. */
  eyebrow?: React.ReactNode
  /** Section heading text. */
  title: string
  /** Optional descriptive paragraph below the title. */
  description?: React.ReactNode
  /** Right-aligned trailing action (a `<MicroLink>`, button, or anything). */
  action?: React.ReactNode
  /** Bottom margin in pixels. Defaults to 48. */
  marginBottom?: number
}

/**
 * The recurring "huge counter + title + description + action" pattern at the
 * top of every home section. Replaces ~25 lines of inline-styled flex/grid in
 * each section component.
 *
 *   <SectionHeader
 *     counter="08"
 *     title="New This Week"
 *     description="Fresh fitments from Blackline, Vanguard, Meridian and more."
 *     action={<MicroLink href="/collections">View all 08</MicroLink>}
 *   />
 *
 * Pass only the props you need; omitted slots collapse cleanly.
 */
const SectionHeader = ({
  counter,
  eyebrow,
  title,
  description,
  action,
  marginBottom = 48,
}: SectionHeaderProps) => (
  <header
    style={{
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 24,
      marginBottom,
    }}
  >
    <div style={{ display: "flex", alignItems: "flex-end", gap: 24, minWidth: 0 }}>
      {counter && (
        <Display size={88} tone="orange" as="span">
          {counter}
        </Display>
      )}
      <div style={{ paddingBottom: counter ? 12 : 0 }}>
        {eyebrow && (
          <div style={{ marginBottom: 12 }}>
            {typeof eyebrow === "string" ? <Label>{eyebrow}</Label> : eyebrow}
          </div>
        )}
        <Display size={40}>{title}</Display>
        {description && (
          <p
            style={{
              fontSize: 13,
              color: "var(--graphite)",
              marginTop: 6,
              marginBottom: 0,
              maxWidth: 480,
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
    {action && <div style={{ flexShrink: 0 }}>{action}</div>}
  </header>
)

export default SectionHeader
