export type CanSubmitYmmParams = {
  year: string
  make: string
  model: string
  subModel: string
  submitting: boolean
}

/**
 * WB-113: the sub-model axis is now MANDATORY — Make/Model/Year alone no
 * longer unlock "Find My Fit". Extracted as a pure fn (rather than left
 * inline as ymm-pane.tsx's `canSubmit`) so the mandatory-gate rule is
 * independently testable: this repo's vitest config has no jsdom/RTL
 * (`environment: "node"` — vitest.config.ts), so a `.tsx` component-render
 * test mounting YmmPane isn't an available option here.
 */
export function canSubmitYmm({ year, make, model, subModel, submitting }: CanSubmitYmmParams): boolean {
  return Boolean(year && make && model && subModel && !submitting)
}
