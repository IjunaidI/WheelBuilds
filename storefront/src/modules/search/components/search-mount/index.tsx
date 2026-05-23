"use client"

import { useEffect } from "react"
import {
  closeSearch,
  openSearch,
  useSearchOpen,
} from "@lib/stores/search-store"
import SearchDrawer from "../search-drawer"

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

const SearchMount = () => {
  const open = useSearchOpen()

  /** Cmd/Ctrl+K toggle from anywhere; Esc closes when open. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmdOrCtrl = isMac() ? e.metaKey : e.ctrlKey
      if (cmdOrCtrl && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        openSearch()
        return
      }
      if (e.key === "Escape" && open) {
        e.preventDefault()
        closeSearch()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  /** Lock body scroll while drawer is open. */
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <div
        onClick={closeSearch}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,15,16,0.35)",
          zIndex: 80,
        }}
      />
      <SearchDrawer onClose={closeSearch} />
    </>
  )
}

export default SearchMount
