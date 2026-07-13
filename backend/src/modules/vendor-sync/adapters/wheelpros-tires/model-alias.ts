/**
 * Expand common vendor model ABBREVIATIONS to their human marketing name for
 * DISPLAY + SEARCH only. Deliberately NOT applied to the group_key/handle
 * (adapters/wheelpros-tires/group-key.ts, buildTireGroupHandle) so product
 * identity + URLs stay stable and expanding a name never re-groups or
 * re-creates a product (WB-089 L8).
 *
 * Keys are the raw extracted model, UPPERCASED. Seeded with the one entry
 * verified from the repo's tire fixtures; add more ONLY from the live feed's
 * real `SELECT DISTINCT model` list (human-verified) — never invent entries.
 * An unknown model passes through unchanged (safe default).
 */
const TIRE_MODEL_ALIASES: Record<string, string> = {
  "WDPEAK AT4W": "Wildpeak A/T4W",
}

export function expandTireModelName(model: string | null): string | null {
  if (!model) return model
  return TIRE_MODEL_ALIASES[model.trim().toUpperCase()] ?? model
}
