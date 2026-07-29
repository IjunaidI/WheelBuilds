/**
 * Centre-bore display rules (WB-121 Q-16).
 *
 * WheelPros uses **999** as a sentinel meaning *bore-to-order / machined to
 * fit* — which is genuinely what a forged wheel is. It is real feed data, not
 * corrupt: 45 live products carry it. But rendering it literally produced
 * "Center bore 999 mm", which is worse than hiding the row, because it is a
 * plausible-looking number a shopper could act on.
 *
 * WB-056 already established the principle — a spec we don't actually know is
 * omitted rather than faked — and added a `> 0` guard that catches 0 and null.
 * 999 sails straight through it.
 *
 * ⚠️ THIS IS A DISPLAY RULE ONLY. The sentinel is deliberately NOT stripped
 * from the data, because `centerBoreMm` also feeds the fitment hard gate via
 * `boreClears(bore, hub)`. That helper returns true when `bore == null` AND
 * when `999 >= hub - tolerance`, so 999 and null both "clear" — the verdict is
 * identical either way, and leaving the data untouched keeps it provably so.
 * Do not "clean" the value upstream without re-checking those 45 products'
 * fit verdicts.
 *
 * A sweep of the live index found no other sentinels: `diameters` and `widths`
 * are clean, and `offsets` 0 (328 products) and -1 are legitimate wheel specs,
 * not placeholders.
 */

/** The vendor's bore-to-order sentinel. */
export const CENTER_BORE_SENTINEL = 999

export type CenterBoreDisplay =
  /** Render "<n> mm". */
  | { kind: "value"; text: string }
  /** Render honest copy — the bore is machined per order, not unknown. */
  | { kind: "custom"; text: string }
  /** Render nothing: genuinely absent. */
  | { kind: "hidden" }

export function centerBoreDisplay(mm: number | null | undefined): CenterBoreDisplay {
  if (mm == null || !Number.isFinite(mm) || mm <= 0) return { kind: "hidden" }
  if (mm === CENTER_BORE_SENTINEL) {
    return { kind: "custom", text: "Custom / bore-to-order" }
  }
  return { kind: "value", text: `${mm} mm` }
}

/** True when this bore should not be offered as a selectable spec chip. */
export function isSentinelBore(mm: number | null | undefined): boolean {
  return mm === CENTER_BORE_SENTINEL
}
