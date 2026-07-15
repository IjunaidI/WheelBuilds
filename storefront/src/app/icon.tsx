import { ImageResponse } from "next/og"
import { getAntonioFontData } from "@lib/og/get-antonio-font"

// DESIGN.md §2 tokens: --ink ground, --orange rule/dot, --surface glyph.
const INK = "#0F0F10"
const ORANGE = "#FF6A00"
const SURFACE = "#FFFFFF"
const GLYPH = "W"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default async function Icon() {
  const fontData = await getAntonioFontData()

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: INK,
        }}
      >
        <div
          style={{
            display: "flex",
            // Conditional spread, never `fontFamily: fontData ? "Antonio" : undefined` —
            // satori treats a present-but-undefined fontFamily as a crash
            // (`.split()` on undefined), not a fallback. See get-antonio-font.ts.
            ...(fontData ? { fontFamily: "Antonio" } : {}),
            fontWeight: 700,
            fontSize: 22,
            lineHeight: 1,
            color: SURFACE,
          }}
        >
          {GLYPH}
        </div>
        <div
          style={{
            display: "flex",
            width: 14,
            height: 3,
            backgroundColor: ORANGE,
            marginTop: 2,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: "Antonio", data: fontData, weight: 700, style: "normal" }]
        : undefined,
    }
  )
}
