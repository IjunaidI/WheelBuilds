import { ImageResponse } from "next/og"
import { getAntonioFontData } from "@lib/og/get-antonio-font"
import { WordmarkScene } from "@lib/og/wordmark-scene"

export const alt = "Wheel Builds — fitment-first wheel & tire builds"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  const fontData = await getAntonioFontData()

  return new ImageResponse(<WordmarkScene fontLoaded={!!fontData} />, {
    ...size,
    fonts: fontData
      ? [{ name: "Antonio", data: fontData, weight: 700, style: "normal" }]
      : undefined,
  })
}
