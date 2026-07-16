/**
 * WCAG 2.x relative-luminance contrast ratio between two sRGB hex colors.
 * Pure function, no DOM — used to pin WB-096 X6's token values (--orange-deep,
 * --ink-soft) against the .frame page background so a future edit can't
 * silently regress them below the 4.5:1 AA floor for normal text.
 *
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Parses a `#RRGGBB` (or `#RGB`) hex string into 0-255 channel values. */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.trim().replace(/^#/, "")
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`contrastRatio: not a valid hex color: "${hex}"`)
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** WCAG relative luminance (0 = black, 1 = white) of a `#RRGGBB` hex color. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  )
}

/**
 * WCAG contrast ratio between two `#RRGGBB` hex colors, in the range [1, 21].
 * Order of `fg`/`bg` doesn't matter — the formula always divides the lighter
 * luminance by the darker one.
 */
export function contrastRatio(fg: string, bg: string): number {
  const lFg = relativeLuminance(fg)
  const lBg = relativeLuminance(bg)
  const lighter = Math.max(lFg, lBg)
  const darker = Math.min(lFg, lBg)
  return (lighter + 0.05) / (darker + 0.05)
}
