export type Option = { value: string; label: string }

// Defensive coercion of a wheel-size cataloging payload into {value,label} pairs.
// The catalog endpoints proxy the wheel-size v2 body verbatim ({ data: [...] }),
// but the exact element shape is pinned by the Task-1 validation gate; until then
// we accept the documented `data[]` array (objects with slug/name, or bare strings)
// plus a few common variants, and let the seed cover anything we can't read.
//
// Precedence for the option VALUE is slug-first: `item.slug ?? item.value ?? item.id
// ?? item.name`. This matters most for `/modifications/` items — a trim's slug is
// what `by_model`'s `modification` param actually narrows on (WB-104 T4); falling
// back to the display NAME would silently defeat trim narrowing if a payload ever
// omitted `slug` while still carrying a `name`.
export const toOptions = (payload: any): Option[] => {
  const arr: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : []
  return arr
    .map((item): Option | null => {
      if (item == null) return null
      if (typeof item === "string" || typeof item === "number") {
        const s = String(item)
        return { value: s, label: s }
      }
      const value = item.slug ?? item.value ?? item.id ?? item.name
      const label = item.name ?? item.title ?? item.trim ?? item.label ?? value
      if (value == null) return null
      return { value: String(value), label: String(label) }
    })
    .filter((o): o is Option => o !== null)
}
