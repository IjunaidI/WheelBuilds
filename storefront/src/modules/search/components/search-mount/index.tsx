"use client"

import { useEffect } from "react"
import {
  closeSearch,
  openSearch,
  useSearchOpen,
} from "@lib/stores/search-store"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import SearchDrawer from "../search-drawer"

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

const SearchMount = () => {
  const open = useSearchOpen()

  /** Cmd/Ctrl+K opens from anywhere; Esc / drag-to-dismiss / overlay-click are handled by Vaul. */
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
    <Drawer
      open={open}
      onOpenChange={(next: boolean) => !next && closeSearch()}
      direction="right"
      shouldScaleBackground={false}
    >
      <DrawerContent
        aria-label="Search"
        className="frame inset-y-0 right-0 left-auto top-0 mt-0 h-full w-full sm:max-w-[480px] rounded-none border-0 border-l border-[var(--hairline)] bg-white"
      >
        <DrawerTitle className="sr-only">Search</DrawerTitle>
        <DrawerDescription className="sr-only">
          Find wheels by vehicle, brand, or keyword.
        </DrawerDescription>
        <SearchDrawer onClose={closeSearch} />
      </DrawerContent>
    </Drawer>
  )
}

export default SearchMount
