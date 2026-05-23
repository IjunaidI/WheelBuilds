"use client"

import { useEffect } from "react"
import {
  closeSearch,
  openSearch,
  useSearchOpen,
} from "@lib/stores/search-store"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import SearchDrawer from "../search-drawer"

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

const SearchMount = () => {
  const open = useSearchOpen()

  /** Cmd/Ctrl+K opens from anywhere; Esc/overlay-click/etc are handled by Radix. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmdOrCtrl = isMac() ? e.metaKey : e.ctrlKey
      if (cmdOrCtrl && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeSearch()}>
      <SheetContent
        side="right"
        hideCloseButton
        aria-label="Search"
        className="frame w-full sm:max-w-[480px] p-0 border-l border-[var(--hairline)] bg-white flex flex-col"
      >
        <SheetTitle className="sr-only">Search</SheetTitle>
        <SheetDescription className="sr-only">
          Find wheels by vehicle, brand, or keyword.
        </SheetDescription>
        <SearchDrawer onClose={closeSearch} />
      </SheetContent>
    </Sheet>
  )
}

export default SearchMount
