/** Escape a value for a Meilisearch filter string literal. */
export const lit = (v: string | number): string =>
  typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '\\"')}"`
