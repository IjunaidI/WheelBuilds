import { describe, it, expect, afterEach } from "vitest"
import { isExpressPayEnabled, isAffirmEnabled } from "./config"

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
})

describe("checkout provider flags", () => {
  it("isExpressPayEnabled true only for the literal 'true'", () => {
    process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED = "true"
    expect(isExpressPayEnabled()).toBe(true)
  })
  it("isExpressPayEnabled false when unset / 'false' / other", () => {
    delete process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED
    expect(isExpressPayEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED = "false"
    expect(isExpressPayEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED = "1"
    expect(isExpressPayEnabled()).toBe(false)
  })
  it("isAffirmEnabled true only for the literal 'true'", () => {
    process.env.NEXT_PUBLIC_AFFIRM_ENABLED = "true"
    expect(isAffirmEnabled()).toBe(true)
    process.env.NEXT_PUBLIC_AFFIRM_ENABLED = "false"
    expect(isAffirmEnabled()).toBe(false)
  })
})
