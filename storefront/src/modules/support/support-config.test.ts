// WB-119 Q-04 — each support channel renders ONLY when its env var is set.
// A fake support address is worse than none: it silently swallows customer
// mail. Values are pending from the client (docs/reference/client-input-needed.md
// item 4), so "unset" is the CURRENT production state, not an edge case.
import { describe, expect, it } from "vitest"

import { supportChannelsFrom } from "./support-config"

describe("supportChannelsFrom", () => {
  it("returns both channels when both are set", () => {
    expect(supportChannelsFrom("help@example.com", "+1 555 555 0100")).toEqual({
      email: "help@example.com",
      phone: "+1 555 555 0100",
      hasAny: true,
    })
  })

  it("omits a channel that is unset — never a placeholder", () => {
    expect(supportChannelsFrom(undefined, undefined)).toEqual({
      email: null,
      phone: null,
      hasAny: false,
    })
  })

  it("treats blank/whitespace env values as unset", () => {
    // An env var present-but-empty is the likeliest real misconfiguration:
    // `NEXT_PUBLIC_SUPPORT_PHONE=` in a Railway variable list.
    expect(supportChannelsFrom("   ", "")).toEqual({
      email: null,
      phone: null,
      hasAny: false,
    })
  })

  it("reports hasAny when only one channel is configured", () => {
    expect(supportChannelsFrom("help@example.com", undefined).hasAny).toBe(true)
    expect(supportChannelsFrom(undefined, "+15555550100").hasAny).toBe(true)
  })

  it("trims surrounding whitespace off a configured value", () => {
    expect(supportChannelsFrom("  help@example.com  ", " +1555 ")).toEqual({
      email: "help@example.com",
      phone: "+1555",
      hasAny: true,
    })
  })
})
