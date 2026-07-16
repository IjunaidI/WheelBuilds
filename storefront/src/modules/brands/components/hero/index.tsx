import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"

type BrandsHeroProps = {
  /** Small mono eyebrow line above the title, e.g. "12 BRANDS · ALL AUTHORIZED" or "BRAND · 42 RESULTS". */
  eyebrow: string
  /** Page H1 — either "Shop by Brand" (index) or the brand name (slug page). */
  title: string
  description?: string
}

/**
 * Shared page-level header for `/brands` and `/brands/[slug]` (WB-099 Task
 * 3). Deliberately NOT the same component as the Discovery rail's
 * `DiscoveryHeader` (that one owns sort/garage controls scoped to the
 * catalog grid) — this is the page-identity block that sits above it,
 * mirroring the same Label+Display formula so the two read as one system.
 */
const BrandsHero = ({ eyebrow, title, description }: BrandsHeroProps) => (
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

export default BrandsHero
