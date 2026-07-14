// storefront/src/lib/fitment/slugify.ts
//
// Slug-normalize a display string for direction-agnostic comparison, e.g. a
// garage drawer option VALUE ("land-rover") against a reverse-fitment
// identity NAME ("Land Rover"). Mirrors the backend vendor-sync pattern
// (backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts `slugify`) and
// the storefront's own YMM-seed slugifier (lib/garage/vehicle-data.ts
// `slugifyYmm`) — this is the general-purpose version used by fitment
// row-matching (WB-104 T2).

/** Lowercase, collapse any run of non-alphanumeric characters to a single
 *  `-`, and trim leading/trailing `-`. Safe to call on an already-slugified
 *  value (idempotent) or a human-readable name. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
