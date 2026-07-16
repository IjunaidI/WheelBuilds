/**
 * The single leaf variant / size each PDP hero renders by DEFAULT — i.e.
 * before any user interaction, which (per WB-095 Task 5's fix wave) is also
 * exactly what a fresh page load renders server-side. `productJsonLd` needs
 * this so the JSON-LD `Offer`'s price + availability can never disagree with
 * the page's own default render.
 *
 * Before this helper existed, `json-ld.ts` priced the GLOBAL cheapest
 * purchasable offset across every finish/bolt-pattern combination on the
 * product — which coincided with the Hero's actual default only by luck
 * (live-verified: a 60% mismatch rate across 60 wheel products, deltas up to
 * 38%, wrong in both directions — sometimes advertising a cheaper price than
 * the page shows, sometimes a pricier one; sometimes claiming InStock for a
 * variant the page shows as Out of stock).
 *
 * Fit mode (`?fit=1` + an active garage vehicle) is NEVER the SSR default:
 * `lib/garage/use-garage.ts`'s `getServerSnapshot()` always returns
 * `active: null`, so `components/hero/index.tsx`'s `fitView` is always
 * `null` server-side (and for the client's very first hydration paint,
 * before `useSyncExternalStore` can settle on the real localStorage
 * snapshot) — regardless of the `fit` query param. The Hero's own default
 * selection (its `activeFinishRaw` / `selectedBoltPattern` / `selectedSize` /
 * `selectedOffsetMm` `useState` initializers) is therefore ALWAYS this
 * non-fit chain, which is what `pickDefaultSelection` reproduces. The Hero
 * now seeds those four `useState`s directly from this function so the two
 * surfaces can't drift apart again; its LIVE re-snap effects (finish switch,
 * bolt-pattern switch, bore/load cascade, fit-mode toggling) are untouched —
 * they already funnel through the same shared primitives this calls
 * (`pickDefaultSize`, `resolveLeafVariant`, …, from `group-sizes.ts`).
 */
import {
  boltPatternsForFinish,
  pickDefaultSize,
  resolveLeafVariant,
  sizesForBoltPattern,
} from "./group-sizes"
import { pickDefaultTireSize, TireSizeOption } from "./tire/tire-size-options"
import { OffsetVariant, ProductDetail, SizeOption, TireProductDetail } from "./types"

export type DefaultSelection = {
  finishRaw: string
  boltPattern: string
  size: SizeOption | null
  /** null only alongside `size: null` (nothing purchasable at all). */
  offsetMm: number | null
  /**
   * The resolved leaf — the exact same variant the Hero's own `currentOffset`
   * converges to on first render. `null` when nothing is purchasable.
   */
  leaf: OffsetVariant | null
}

/**
 * Replicates `components/hero/index.tsx`'s non-fit-mode default chain: first
 * finish -> that finish's bolt patterns (first) -> `pickDefaultSize` -> the
 * size's own default offset -> bore/load snap -> `resolveLeafVariant`.
 *
 * The bore/load snap is a no-op refinement in practice — `resolveLeafVariant`
 * treats a `null` bore/load as a wildcard, so seeding them FROM the
 * offset-only resolution and re-resolving always converges back to the same
 * leaf (stable-sort ties keep the same first-ranked candidate at every
 * narrowing step). It's kept explicit here anyway so this function reads as
 * a literal mirror of the Hero's real steps, not a shortcut a future reader
 * has to re-derive and re-verify.
 */
export function pickDefaultSelection(product: ProductDetail): DefaultSelection {
  const finish = product.finishOptions[0]
  const finishRaw = finish?.raw ?? "—"
  const finishSizeOptions = finish?.sizeOptions ?? product.sizeOptions

  const boltPatternOptions = boltPatternsForFinish(finishSizeOptions)
  const boltPattern = boltPatternOptions[0] ?? product.boltPattern

  const visibleSizes = sizesForBoltPattern(finishSizeOptions, boltPattern)
  const size = pickDefaultSize(visibleSizes)
  if (!size) {
    return { finishRaw, boltPattern, size: null, offsetMm: null, leaf: null }
  }

  const offsetMm = size.defaultOffsetMm ?? size.offsetMm ?? 0
  const bore = resolveLeafVariant(size, offsetMm)?.centerBoreMm ?? null
  const load = resolveLeafVariant(size, offsetMm, bore)?.loadRatingLb ?? null
  const leaf =
    resolveLeafVariant(size, offsetMm, bore, load) ??
    resolveLeafVariant(size, offsetMm, bore) ??
    resolveLeafVariant(size, offsetMm)

  return { finishRaw, boltPattern, size, offsetMm, leaf }
}

/** The wheel leaf `productJsonLd` prices — see `pickDefaultSelection` above. */
export function pickDefaultLeaf(product: ProductDetail): OffsetVariant | null {
  return pickDefaultSelection(product).leaf
}

/**
 * The tire PDP's default size, mirroring `components/tire/hero/index.tsx`'s
 * own `useMemo(() => pickDefaultTireSize(product.sizeOptions), ...)` — the
 * tire hero has no finish/bolt-pattern/bore/load axes, so this is already a
 * single pure call. This wrapper just gives the tire path the same named
 * seam as the wheel path, so both the Hero and `productJsonLd` call the same
 * function instead of each reaching for `pickDefaultTireSize` independently.
 */
export function pickDefaultTireLeaf(
  product: TireProductDetail
): TireSizeOption | undefined {
  return pickDefaultTireSize(product.sizeOptions)
}
