/**
 * Parse a wheel size string like "17X8.5" into diameter and width.
 */
export function parseSize(str: string): { diameterIn: number; widthIn: number } {
  const parts = str.toUpperCase().split('X')
  if (parts.length !== 2) {
    throw new Error(`Invalid size format: "${str}"`)
  }
  const diameterIn = parseFloat(parts[0])
  const widthIn = parseFloat(parts[1])
  if (isNaN(diameterIn) || isNaN(widthIn)) {
    throw new Error(`Invalid size values: "${str}"`)
  }
  return { diameterIn, widthIn }
}

/**
 * Parse a bolt pattern string like "5X5.0" into bolt count and bolt circle diameter.
 */
export function parseBoltPattern(str: string): { boltCount: number; boltCircleIn: number } {
  const parts = str.toUpperCase().split('X')
  if (parts.length !== 2) {
    throw new Error(`Invalid bolt pattern format: "${str}"`)
  }
  const boltCount = parseInt(parts[0], 10)
  const boltCircleIn = parseFloat(parts[1])
  if (isNaN(boltCount) || isNaN(boltCircleIn)) {
    throw new Error(`Invalid bolt pattern values: "${str}"`)
  }
  return { boltCount, boltCircleIn }
}

/**
 * Parse a vendor date string like "05/07/2026 10:06:48 PM" into a Date.
 */
export function parseVendorDate(str: string): Date {
  const trimmed = str.trim()
  // Format: MM/DD/YYYY HH:MM:SS AM/PM
  const match = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
  )
  if (!match) {
    throw new Error(`Invalid vendor date format: "${str}"`)
  }
  const [, month, day, year, hourStr, minute, second, ampm] = match
  let hour = parseInt(hourStr, 10)
  if (ampm.toUpperCase() === 'PM' && hour !== 12) {
    hour += 12
  } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
    hour = 0
  }
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    hour,
    parseInt(minute, 10),
    parseInt(second, 10)
  )
}

/**
 * Parse a price string like "369.99" into a number.
 */
export function parsePrice(str: string): number {
  const val = parseFloat(str)
  if (isNaN(val)) {
    throw new Error(`Invalid price: "${str}"`)
  }
  return val
}

/**
 * Parse a string into a number, returning null for empty/whitespace strings.
 */
export function parseOptionalNumber(str: string): number | null {
  if (!str || str.trim() === '') {
    return null
  }
  const val = parseFloat(str)
  if (isNaN(val)) {
    return null
  }
  return val
}
