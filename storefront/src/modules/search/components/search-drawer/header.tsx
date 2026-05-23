"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Icon from "@modules/common/components/icon"
import { addRecentSearch } from "@lib/stores/recent-searches"

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

type HeaderProps = {
  onClose: () => void
}

const Header = ({ onClose }: HeaderProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K")

  useEffect(() => {
    setShortcutLabel(isMac() ? "⌘ K" : "Ctrl K")
    inputRef.current?.focus()
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    addRecentSearch(trimmed)
    onClose()
    router.push(`/${countryCode}/results/${encodeURIComponent(trimmed)}`)
  }

  return (
    <div
      style={{
        padding: "20px 24px 16px",
        borderBottom: "1px solid var(--hairline)",
        background: "white",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: "var(--display)",
            fontWeight: 900,
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: "0.01em",
          }}
        >
          Search
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "var(--ink)",
            display: "inline-flex",
          }}
        >
          <Icon name="x" size={20} />
        </button>
      </div>
      <form
        onSubmit={submit}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 56,
          border: "1px solid var(--ink)",
          borderRadius: 4,
          padding: "0 16px",
          background: "white",
        }}
      >
        <Icon name="search" size={20} color="#0F0F10" strokeWidth={1.8} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search wheels, brands, fitments…"
          type="search"
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 16,
            fontFamily: "var(--body)",
            color: "var(--ink)",
            minWidth: 0,
          }}
        />
        <kbd
          aria-hidden
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--muted)",
            border: "1px solid var(--hairline)",
            padding: "2px 6px",
            borderRadius: 3,
            background: "var(--soft)",
            letterSpacing: "0.04em",
          }}
        >
          {shortcutLabel}
        </kbd>
      </form>
    </div>
  )
}

export default Header
