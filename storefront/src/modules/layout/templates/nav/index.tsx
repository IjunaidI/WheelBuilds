import { Suspense } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import GaragePill from "@modules/layout/components/garage-pill"
import MobileMenu from "@modules/layout/components/mobile-menu"
import Icon from "@modules/common/components/icon"
import Logo from "@modules/common/components/logo"
import SearchTrigger from "@modules/search/components/search-trigger"

const NAV_ITEMS: { label: string; href: string; active?: boolean }[] = [
  { label: "Wheels", href: "/store", active: true },
  { label: "Brands", href: "/collections" },
  { label: "Style", href: "/categories" },
  { label: "Build Gallery", href: "#" },
  { label: "Deals", href: "#" },
  { label: "Support", href: "#" },
]

export default async function Nav() {
  return (
    <div className="sticky top-0 inset-x-0 z-50">
      {/* Utility bar — 56px on mobile (more breathing room for fat-finger taps), 40px on small+ */}
      <div
        className="flex items-center justify-between px-4 small:px-10 bg-white h-14 small:h-10"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        {/* Left: hamburger (mobile) + logo */}
        <div className="flex items-center gap-3">
          <MobileMenu />
          <LocalizedClientLink
            href="/"
            style={{ textDecoration: "none", display: "inline-flex" }}
          >
            <Logo size={16} />
          </LocalizedClientLink>
        </div>

        {/* Middle: garage pill (xsmall+) + search */}
        <div className="flex items-center gap-4 small:gap-[18px]">
          <div className="hidden xsmall:flex">
            <GaragePill />
          </div>
          <SearchTrigger />
        </div>

        {/* Right: account + cart. Hide user/heart on mobile (they're in the drawer). */}
        <div className="flex items-center gap-4 small:gap-[18px] text-[var(--ink)]">
          <LocalizedClientLink
            href="/account"
            aria-label="Account"
            className="hidden small:inline-flex"
            style={{ color: "inherit" }}
          >
            <Icon name="user" size={16} />
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/account"
            aria-label="Saved"
            className="hidden small:inline-flex"
            style={{ color: "inherit" }}
          >
            <Icon name="heart" size={16} />
          </LocalizedClientLink>
          <Suspense
            fallback={
              <LocalizedClientLink
                href="/cart"
                aria-label="Cart"
                style={{ display: "inline-flex", color: "inherit" }}
              >
                <Icon name="bag" size={16} />
              </LocalizedClientLink>
            }
          >
            <CartButton />
          </Suspense>
        </div>
      </div>

      {/* Primary nav — 56px. Hidden on mobile (mobile uses the hamburger drawer). */}
      <div
        className="hidden small:flex items-center px-10 bg-white h-14 gap-8"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        {NAV_ITEMS.map((it) => (
          <LocalizedClientLink
            key={it.label}
            href={it.href}
            className={"nav-link" + (it.active ? " active" : "")}
          >
            {it.label}
          </LocalizedClientLink>
        ))}
      </div>
    </div>
  )
}
