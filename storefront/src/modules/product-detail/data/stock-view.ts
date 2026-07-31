import type { FinishOption } from "./types"

/**
 * Trims a PDP's option tree to variants that can actually be bought
 * (WB-124).
 *
 * The discovery "In stock only" filter sets `in_stock` on a product when **any
 * one** variant has stock — so a tyre with 2 buyable sizes out of 62 passes it.
 * Measured live 2026-07-30: `falken-sincera-sn250` 2/62, `toyo-extensa-hp2`
 * 10/62, `black-rhino-hard-alloys-utv-pkb` 1/21. Worst on tyres, where
 * choosing a size IS the interaction, so the shopper picks the size they came
 * for and finds it unavailable.
 *
 * Rather than redefine `in_stock` in the search index — which would need a
 * backend deploy and a full reconcile, and still could not promise the
 * shopper's specific size — the intent is carried into the PDP via
 * `?in_stock=1` and the options are filtered HERE, against live Store-API
 * stock. This mirrors what WB-060 already does for fitment, and composes with
 * it: apply the fit trim first, then this, and the shopper sees only sizes
 * that both fit their vehicle and are buyable.
 *
 * `low_stock` is deliberately KEPT — low stock is still purchasable, and
 * hiding it would under-serve the shopper and under-sell the catalogue.
 */

/** Availability values that a shopper can actually buy. */
const BUYABLE = new Set(["in_stock", "low_stock"])

export type StockView = {
  /** Finishes with ≥1 buyable size, each trimmed to its buyable sizes/offsets. */
  finishOptions: FinishOption[]
  /** True when trimming actually removed something (drives the banner). */
  didTrim: boolean
}

/**
 * Returns the trimmed tree, or the input untouched when trimming would leave
 * nothing selectable.
 *
 * Stranding a shopper on a PDP with no size to pick would be a worse bug than
 * the one being fixed, and it is reachable: `in_stock` is computed at index
 * time, so a product can sell out between the last sync and this render. When
 * that happens `didTrim` is false and no banner claims a filter is active.
 */
export function buildStockView(finishOptions: FinishOption[]): StockView {
  const trimmed = finishOptions
    .map((finish) => {
      const sizeOptions = finish.sizeOptions
        .map((size) => {
          const offsetVariants = (size.offsetVariants ?? []).filter((o) =>
            BUYABLE.has(o.availability)
          )
          return { ...size, offsetVariants }
        })
        // A size survives when it is itself buyable and still has an offset to
        // select. Both checks matter: the size's own availability is the
        // best-of-siblings roll-up (see get-product.ts), so it can read
        // buyable while every individual offset has since been filtered out.
        .filter(
          (size) => BUYABLE.has(size.availability) && size.offsetVariants.length > 0
        )
      return { ...finish, sizeOptions }
    })
    .filter((finish) => finish.sizeOptions.length > 0)

  if (trimmed.length === 0) {
    return { finishOptions, didTrim: false }
  }

  const before = finishOptions.reduce((n, f) => n + f.sizeOptions.length, 0)
  const after = trimmed.reduce((n, f) => n + f.sizeOptions.length, 0)

  return { finishOptions: trimmed, didTrim: after < before }
}
