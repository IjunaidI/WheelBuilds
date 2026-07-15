import "server-only"

/**
 * next/og's ImageResponse (satori) can't use next/font — it needs raw font
 * bytes. This fetches just the Antonio 700 glyph subset needed for `text`
 * from Google Fonts. Returns null on any failure so callers fall back to
 * satori's built-in default font instead of failing the build/request.
 */
export async function getAntonioFontData(
  text: string
): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Antonio:wght@700&text=${encodeURIComponent(
      text
    )}`
    const css = await (await fetch(cssUrl)).text()
    const match = css.match(
      /src: url\(([^)]+)\) format\('(opentype|truetype)'\)/
    )
    if (!match) {
      return null
    }
    const fontRes = await fetch(match[1])
    if (!fontRes.ok) {
      return null
    }
    return await fontRes.arrayBuffer()
  } catch {
    return null
  }
}
