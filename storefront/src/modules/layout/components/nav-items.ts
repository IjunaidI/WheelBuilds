/** Shared primary-nav items (single source for desktop nav + mobile drawer). */
export const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Wheels", href: "/store" },
  { label: "Tires", href: "/tires" },
  // Interim: /collections + /categories 404 today. WB-099 adds dedicated
  // /brands + /styles landing pages; until then these open discovery.
  { label: "Brands", href: "/store" },
  { label: "Style", href: "/store" },
  { label: "Support", href: "/contact" },
]
