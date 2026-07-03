"use client"

import { usePathname } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { isNavLinkActive } from "./nav-active"

type NavItem = { label: string; href: string }

/**
 * Primary-nav links with a path-derived active highlight. A client island so it
 * can read `usePathname()` — the parent Nav stays a server component.
 */
const NavLinks = ({ items }: { items: NavItem[] }) => {
  const pathname = usePathname()
  return (
    <>
      {items.map((it) => (
        <LocalizedClientLink
          key={it.label}
          href={it.href}
          className={"nav-link" + (isNavLinkActive(pathname, it.href) ? " active" : "")}
        >
          {it.label}
        </LocalizedClientLink>
      ))}
    </>
  )
}

export default NavLinks
