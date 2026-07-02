import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"

type TireBreadcrumbProps = {
  brand: string
  name: string
}

/**
 * Plain breadcrumb above the tire hero. Mirrors the wheel breadcrumb
 * (components/breadcrumb/index.tsx): mono uppercase, ink-soft, last segment
 * (the product name) rendered without a link and in ink. "Tires" is the tire
 * catalog's top-level route instead of the wheel "Wheels" → /store.
 */
const TireBreadcrumb = ({ brand, name }: TireBreadcrumbProps) => {
  const segments: { label: string; href?: string }[] = [
    { label: "Tires", href: "/tires" },
    { label: brand, href: `/tires?brands=${encodeURIComponent(brand)}` },
    { label: name },
  ]

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 font-[var(--mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink-soft)]"
    >
      {segments.map((s, i) => (
        <span key={`${s.label}-${i}`} className="inline-flex items-center gap-2">
          {s.href ? (
            <LocalizedClientLink
              href={s.href}
              className="text-[var(--ink-soft)] hover:text-[var(--ink)] no-underline"
            >
              {s.label}
            </LocalizedClientLink>
          ) : (
            <span className="text-[var(--ink)] font-semibold">{s.label}</span>
          )}
          {i < segments.length - 1 && (
            <Icon name="chevron-down" size={10} color="#8A8A8E" style={{ transform: "rotate(-90deg)" }} />
          )}
        </span>
      ))}
    </nav>
  )
}

export default TireBreadcrumb
