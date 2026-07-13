/**
 * Extract a tire's model name from the free-text PartDescription.
 *
 * The WheelPros tire feed has no model column; the model is embedded in the
 * description at an inconsistent position (before OR after the size) surrounded
 * by strippable noise. Strategy: remove everything we recognise (size token,
 * service description, noise tokens, brand, trailing size-code) and keep the
 * remainder as the model. Mirrors computeWheelGroupKey's confident-else-per-SKU
 * shape: an un-extractable model returns { model: null, confident: false }, and
 * the caller falls back to a per-SKU group key. Pure function -- no side effects.
 */

// Tokens that are never part of a model name.
const NOISE_TOKENS = new Set([
  "SL", "XL", "BL", "BLK", "TT", "TL", "TR", // load range / sidewall / tube
])

export function extractTireModel(
  brand: string,
  description: string,
  sizeToken: string | null
): { model: string | null; confident: boolean } {
  if (!description || description.trim() === "") {
    return { model: null, confident: false }
  }

  let work = ` ${description.trim()} `

  // 1. Remove the size token (exact substring the parser matched).
  if (sizeToken) {
    work = work.split(sizeToken).join(" ")
  }

  // 1b. Also strip any size-SHAPED token whose literal form differs from the
  //     canonicalized sizeToken -- e.g. a dash-metric size "ST225/75-15" whose
  //     sizeToken was canonicalized to "225/75R15" (WB-089 L8). Without this,
  //     the glued-prefix leftover survives the alpha filter (step 6) and
  //     pollutes the model, fragmenting grouping. Matches metric (...Z?[RBD]RR)
  //     and dash-metric (...-RR) with an optional glued P/LT/ST prefix.
  work = work.replace(/\b(?:P|LT|ST)?\d{2,3}\/\d{2,3}(?:Z?[RBD]|-)\d{2}\b/g, " ")

  // 2. Remove a parenthesised service description, e.g. "(96Y)".
  work = work.replace(/\([^)]*\)/g, " ")

  // 3. Remove service description: <2-3 digits><speed letter> optionally
  //    followed by a ply/load-range letter, e.g. "118S", "128R E", "99W".
  work = work.replace(/(?:^|\s)\d{2,3}[A-Z]\b(?:\s+[A-Z]\b)?/g, " ")

  // 4. Remove ply ratings ("8PR"), the trailing numeric size-code ("2355517",
  //    "451224"), and standalone decimals ("26.7", "SL29.8" -> the 29.8 part).
  work = work.replace(/\b\d+PR\b/g, " ")
  work = work.replace(/\b\d{4,}\b/g, " ")
  work = work.replace(/\d+\.\d+/g, " ")

  // 5. Remove the leading tire-class prefix and the brand when present.
  work = work.replace(/\b(P|LT|ST)\b/g, " ")
  const brandTrim = brand.trim()
  if (brandTrim) {
    work = work.replace(new RegExp(`\\b${escapeRegExp(brandTrim)}\\b`, "gi"), " ")
  }

  // 6. Drop any remaining pure-noise tokens and any token that carries no
  //    alphabetic character at all (leftover size-ish junk such as
  //    "285/45-22" when the upstream parser couldn't extract a sizeToken for
  //    a dash-form metric size); keep the rest in order.
  const kept = work
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !NOISE_TOKENS.has(t.toUpperCase()) &&
        /[A-Za-z]/.test(t)
    )

  const model = kept.join(" ").trim()
  // A model is only trustworthy when the row actually parsed as a tire (a real
  // size token was found). Junk text with letters but no parseable size → not
  // confident → per-SKU group fallback, so garbage never becomes a grouped
  // product title (WB-089 L8).
  const confident = model.length > 0 && /[A-Za-z]/.test(model) && sizeToken != null
  return { model: confident ? model : null, confident }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
