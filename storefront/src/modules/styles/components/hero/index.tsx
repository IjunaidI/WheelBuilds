import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"

type StylesHeroProps = {
  /** Small mono eyebrow line above the title, e.g. "6 STYLES · CURATED" or "STYLE · 42 RESULTS". */
  eyebrow: string
  /** Page H1 — either "Shop by Style" (index) or the STYLE_DEFS label (slug page). */
  title: string
  description?: string
}

/**
 * Shared page-level header for `/styles` and `/styles/[slug]` (WB-099 Task
 * 4) — the style-flavored twin of `modules/brands/components/hero`. Kept as
 * its own module-scoped component (not imported from `brands/`) following
 * this codebase's convention of a dedicated hero per landing surface (see
 * also `product-detail/components/hero` vs `.../tire/hero`), even though the
 * two are structurally identical Label+Display compositions.
 */
const StylesHero = ({ eyebrow, title, description }: StylesHeroProps) => (
  <header className="px-5 pt-6 xsmall:px-8 small:px-20 small:pt-8">
    <Label tone="muted" style={{ display: "block", marginBottom: 6 }}>
      {eyebrow}
    </Label>
    <Display size={32} as="h1" className="small:!text-[48px]">
      {title}
    </Display>
    {description && (
      <p
        style={{
          fontSize: 13,
          color: "var(--graphite)",
          marginTop: 8,
          marginBottom: 0,
          maxWidth: 640,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    )}
  </header>
)

export default StylesHero
