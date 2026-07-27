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
  //     pollutes the model, fragmenting grouping.
  //
  //     ⚠️ These MUST cover every shape parseTireSize can canonicalize, or the
  //     group key silently changes. Step 1's `split(sizeToken)` is a LITERAL
  //     substring removal, so the moment the parser rewrites a token (dash ->
  //     R, dropped LT/P/ST designation, lowercase x -> X) it stops matching the
  //     description text and the raw size survives into the model. That is not
  //     cosmetic: `Brand|Model` IS the tire group key, so a leaked size splits
  //     one product into per-size groups, and apply then tries to CREATE a
  //     product whose variant SKUs already live on the old one -- "Product
  //     variant with sku: X, already exists" (observed on the 2026-07-27
  //     tires apply: group keys like "BKT|AT 33X8-18 AT171").
  const SIZE_SHAPED = [
    // metric + dash-metric, optional trailing XL / service designation:
    // 225/75-15, 255/35ZR19, 225/60R18XL, 375/45R24LT
    /\b(?:P|LT|ST)?\d{2,3}\/\d{2,3}(?:Z?[RBDT]|-)\d{2}(?:XL|LT|P|ST)?\b/g,
    // inch / flotation, either separator, either prefix position, and the
    // unicode multiplication sign the feed sometimes uses:
    // 33X12.50R20, LT35X12.50-20, 33x12.50R20LT, 37×12.50R18LT
    /\b(?:P|LT|ST)?\d+(?:\.\d+)?[xX×]\d+(?:\.\d+)?(?:[RBDT]|-)\d{2}(?:LT|P|ST)?\b/g,
    // slash-inch (drag / rock-crawler): 29.0/10.5R18, 18.5/39R17LT, 17/49-20LT
    /\b(?:P|LT|ST)?\d+(?:\.\d+)?\/\d+(?:\.\d+)?(?:[RBD]|-)\d{2}(?:LT|P|ST)?\b/g,
  ]
  for (const re of SIZE_SHAPED) work = work.replace(re, " ")

  // 2. Remove a parenthesised service description, e.g. "(96Y)".
  work = work.replace(/\([^)]*\)/g, " ")

  // 3. Remove service description: <2-3 digits><speed letter> optionally
  //    followed by a ply/load-range letter, e.g. "118S", "128R E", "99W".
  //    The optional middle group covers the DUAL (single/dual-wheel) load
  //    index the feed writes with a slash -- "124/121S", "121/119R" -- and the
  //    bare trailing slash covers "125/P" / "127/Q". These only became visible
  //    once the parser started resolving sizes that previously fell back to a
  //    per-SKU group; left in place they leak into the model and fork the
  //    group key exactly like a leaked size does.
  work = work.replace(/(?:^|\s)\d{2,3}(?:\/\d{2,3})?\/?[A-Z]\b(?:\s+[A-Z]\b)?/g, " ")

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
