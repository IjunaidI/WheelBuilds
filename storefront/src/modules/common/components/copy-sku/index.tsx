"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import Label from "@modules/common/components/label"

type CopySkuProps = {
  /** The SELECTED variant/size's real vendor part number (WB-098 Task 3) — callers re-render this with a fresh `sku` as the picker's selection changes, so the row always tracks what's actually selected. Never render this component at all when the selection has no sku (see both purchase panels' `selectedVariant?.sku` / `selectedSize?.sku` guards) rather than passing an empty string here. */
  sku: string
  className?: string
}

/**
 * Click-to-copy SKU row for the PDP purchase panels (WB-098 Task 3). The
 * vendor part number already exists on every Medusa variant (backend
 * vendor-sync `apply.ts` sets `sku: r.partNumber`) — this just surfaces it
 * and lets a shopper (or a phone-support rep) copy it verbatim instead of
 * reading it off screen.
 */
const CopySku = ({ sku, className }: CopySkuProps) => {
  const [copied, setCopied] = useState(false)
  // Holds the pending "Copied" -> "Copy" revert timer so a rapid re-click (or
  // an unmount, e.g. the shopper switches variants right after copying) can
  // clear it instead of letting it fire against stale/unmounted state.
  const revertTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (revertTimeoutRef.current) {
        clearTimeout(revertTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sku)
      setCopied(true)
      toast.success("Copied", { description: sku })
      if (revertTimeoutRef.current) {
        clearTimeout(revertTimeoutRef.current)
      }
      revertTimeoutRef.current = setTimeout(() => {
        setCopied(false)
        revertTimeoutRef.current = null
      }, 2000)
    } catch {
      toast.error("Couldn't copy", {
        description: "Please copy it manually.",
      })
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy SKU ${sku}`}
      className={className ?? "mt-3 flex items-center gap-2"}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      <Label tone="muted">SKU</Label>
      <span
        className="font-[var(--mono)]"
        style={{ fontSize: 12, color: "var(--ink-soft)" }}
      >
        {sku}
      </span>
      <span
        className="font-[var(--mono)] uppercase"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--ink-soft)",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  )
}

export default CopySku
