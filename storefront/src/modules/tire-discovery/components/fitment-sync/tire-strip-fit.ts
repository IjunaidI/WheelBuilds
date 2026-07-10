// storefront/src/modules/tire-discovery/components/fitment-sync/tire-strip-fit.ts

// Tire fit params (WB-079 B1). shouldStripFit lives in the wheel twin and is
// param-set-agnostic; only the key set differs.
export const TIRE_FIT_PARAM_KEYS = ["fit", "fitl", "fits"] as const
