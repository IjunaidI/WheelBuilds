"use client"

import { useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Logo from "@modules/common/components/logo"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Wheels", href: "/store" },
  { label: "Brands", href: "/collections" },
  { label: "Style", href: "/categories" },
  { label: "Build Gallery", href: "#" },
  { label: "Deals", href: "#" },
  { label: "Support", href: "#" },
]

const ACCOUNT_ITEMS: { label: string; href: string; icon: "user" | "heart" | "bag" }[] = [
  { label: "Account", href: "/account", icon: "user" },
  { label: "Saved", href: "/account", icon: "heart" },
  { label: "Cart", href: "/cart", icon: "bag" },
]

/**
 * Mobile hamburger menu — slides in from the left via Vaul. Hidden on small+
 * (where the regular nav row is visible).
 */
const MobileMenu = () => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="small:hidden inline-flex items-center justify-center w-8 h-8 -ml-1 text-[var(--ink)]"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <Drawer
        open={open}
        onOpenChange={(next: boolean) => setOpen(next)}
        direction="left"
        shouldScaleBackground={false}
      >
        <DrawerContent
          aria-label="Menu"
          className="frame inset-y-0 left-0 right-auto top-0 mt-0 h-full w-[85%] max-w-[360px] rounded-none border-0 border-r border-[var(--hairline)] bg-white flex flex-col"
        >
          <DrawerTitle className="sr-only">Menu</DrawerTitle>
          <DrawerDescription className="sr-only">
            Site navigation and account links.
          </DrawerDescription>

          <div className="flex items-center justify-between p-5 border-b border-[var(--hairline)]">
            <LocalizedClientLink
              href="/"
              onClick={() => setOpen(false)}
              style={{ textDecoration: "none", display: "inline-flex" }}
            >
              <Logo size={18} />
            </LocalizedClientLink>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="h-8 w-8"
            >
              <Icon name="x" size={20} />
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto p-5">
            <Label tone="muted" style={{ display: "block", marginBottom: 12 }}>
              SHOP
            </Label>
            <ul className="flex flex-col gap-1 mb-8">
              {NAV_ITEMS.map((it) => (
                <li key={it.label}>
                  <LocalizedClientLink
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="block py-3 text-[18px] font-[var(--display)] font-black uppercase tracking-[0.01em] text-[var(--ink)] no-underline border-b border-[var(--hairline)]"
                  >
                    {it.label}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>

            <Label tone="muted" style={{ display: "block", marginBottom: 12 }}>
              YOUR ACCOUNT
            </Label>
            <ul className="flex flex-col gap-1">
              {ACCOUNT_ITEMS.map((it) => (
                <li key={it.label}>
                  <LocalizedClientLink
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 py-3 text-[14px] font-semibold text-[var(--ink)] no-underline border-b border-[var(--hairline)]"
                  >
                    <Icon name={it.icon} size={16} />
                    {it.label}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </nav>
        </DrawerContent>
      </Drawer>
    </>
  )
}

export default MobileMenu
