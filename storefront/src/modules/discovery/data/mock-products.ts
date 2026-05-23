/**
 * Mock product catalog for the Discovery chrome.
 *
 * Replace with a Meilisearch query when wiring real data — see
 * `get-products.ts` for the integration seam. Keep the shape stable
 * (DiscoveryProduct from `./types`) so consumers don't change.
 */

import { DiscoveryProduct } from "./types"

const BRANDS = [
  "BLACKLINE FORGED",
  "VANGUARD",
  "MERIDIAN FORGED",
  "RONIN MOTORSPORT",
  "ATLAS OFFROAD",
  "STRIKER",
  "AVANT GARDE",
  "FORGEHAUS",
  "KAIDO",
  "AEGIS",
  "MONARCH",
  "TYPHOON",
]

const FINISHES: ("black" | "bronze" | "silver")[] = ["black", "bronze", "silver"]
const DIAMETERS = [17, 18, 19, 20, 22, 24]
const WIDTHS = [8, 8.5, 9, 9.5, 10, 11, 12]
const BOLT_PATTERNS = ["5×114.3", "5×120", "5×130", "6×135", "6×139.7", "8×165.1"]
const CATEGORIES = ["off-road", "luxury", "street", "truck-dually", "drag", "utv"]

const MODELS = [
  "BL-7",
  "V8 MESH",
  "GT MONOBLOCK",
  "R1 MOTORSPORT",
  "AT-9 BEADLOCK",
  "S6",
  "AVN-21",
  "F-1 TURBINE",
  "K-09 LIP",
  "AE-6 SPLIT",
  "MR-3",
  "TX-8 CONCAVE",
  "BL-12 FORGED",
  "V12 DEEP DISH",
  "GT-X COMPETITION",
  "R2 STREET",
  "AT-11 PRO",
  "S8 LIMITED",
  "AVN-44",
  "F-2 STARFIRE",
  "K-12 BLACK",
  "AE-9 BRUSHED",
  "MR-5 POLISHED",
  "TX-10 BRONZE",
]

/**
 * Deterministic pseudo-random generator so the mock catalog stays stable
 * across renders (no hydration mismatch). We're not using Math.random() for
 * this very reason.
 */
const mulberry32 = (seed: number) => {
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(arr: readonly T[], rand: () => number): T =>
  arr[Math.floor(rand() * arr.length)] ?? arr[0]

const buildHandle = (brand: string, model: string) =>
  `${brand}-${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * 60 mock products. Bigger pool than the default page size so pagination has
 * something to show. Each call returns the same list (seeded).
 */
export const buildMockCatalog = (): DiscoveryProduct[] => {
  const rand = mulberry32(0xC0FFEE)
  const out: DiscoveryProduct[] = []

  for (let i = 0; i < 60; i++) {
    const brand = pick(BRANDS, rand)
    const model = pick(MODELS, rand)
    const finish = pick(FINISHES, rand)
    const diameter = pick(DIAMETERS, rand)
    const width = pick(WIDTHS, rand)
    const boltPattern = pick(BOLT_PATTERNS, rand)
    const priceCents = (700 + Math.floor(rand() * 1800)) * 100
    const onSale = rand() < 0.15

    // 1–3 categories per product
    const catCount = 1 + Math.floor(rand() * 3)
    const cats = new Set<string>()
    while (cats.size < catCount) cats.add(pick(CATEGORIES, rand))

    out.push({
      id: `mock-${i.toString().padStart(3, "0")}`,
      handle: `${buildHandle(brand, model)}-${i}`,
      brand,
      name: `${brand.split(" ")[0]} ${model}`,
      priceCents: onSale ? Math.floor(priceCents * 0.85) : priceCents,
      originalPriceCents: onSale ? priceCents : undefined,
      finish,
      diameter,
      width,
      boltPattern,
      categories: Array.from(cats),
      isNew: rand() < 0.2,
    })
  }

  return out
}

export const MOCK_CATALOG: DiscoveryProduct[] = buildMockCatalog()
