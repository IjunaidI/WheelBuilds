import { Suspense } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import GaragePill from "@modules/layout/components/garage-pill"
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
      {/* Utility bar — 40px */}
      <div
        style={{
          height: 40,
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          padding: "0 40px",
          justifyContent: "space-between",
          background: "white",
        }}
      >
        <LocalizedClientLink
          href="/"
          style={{ textDecoration: "none", display: "inline-flex" }}
        >
          <Logo size={16} />
        </LocalizedClientLink>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <GaragePill />
          <SearchTrigger />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            color: "var(--ink)",
          }}
        >
          <LocalizedClientLink
            href="/account"
            aria-label="Account"
            style={{ display: "inline-flex", color: "inherit" }}
          >
            <Icon name="user" size={16} />
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/account"
            aria-label="Saved"
            style={{ display: "inline-flex", color: "inherit" }}
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

      {/* Primary nav — 56px */}
      <div
        style={{
          height: 56,
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          padding: "0 40px",
          gap: 32,
          background: "white",
        }}
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
