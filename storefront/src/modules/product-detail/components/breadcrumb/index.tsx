import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"

type BreadcrumbProps = {
  brand: string
  name: string
}

/**
 * Plain breadcrumb above the hero. Mono uppercase, ink-soft. Last segment
 * (the product name) is rendered without a link and in ink.
 */
const Breadcrumb = ({ brand, name }: BreadcrumbProps) => {
  const segments: { label: string; href?: string }[] = [
    { label: "Wheels", href: "/store" },
    { label: brand, href: `/store?brands=${encodeURIComponent(brand)}` },
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

export default Breadcrumb
