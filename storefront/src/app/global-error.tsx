"use client"

import { useEffect } from "react"

/**
 * WB-082: last-resort boundary — catches errors thrown by the ROOT layout
 * itself, so it must render its own <html>/<body> and can't rely on fonts,
 * Tailwind, or `.frame` tokens. Inline styles only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[error-boundary:global]", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#FAFAF8",
          color: "#111",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.12em",
              color: "#FF6A00",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            WHEEL/BUILDS
          </div>
          <h1 style={{ fontSize: 28, margin: "0 0 10px" }}>
            Something broke on our end
          </h1>
          <p style={{ fontSize: 14, color: "#555", margin: "0 0 22px" }}>
            The site hit an unexpected error. It's been logged.
            {error.digest ? ` (Ref: ${error.digest})` : ""}
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#FF6A00",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
