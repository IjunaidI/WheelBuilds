import { describe, it, expect } from "vitest"
import { track } from "./track"

/**
 * The vitest project runs with `environment: "node"` (see vitest.config.ts),
 * so there is no real `window` unless a test installs one -- matching the
 * pattern `lib/garage/local-storage-garage.test.ts` uses for the same
 * reason. That gives this suite both guarded paths for free: no `window` at
 * all (SSR), and a `window` with no `plausible` (the real "analytics off"
 * shape `Analytics` produces when `NEXT_PUBLIC_ANALYTICS_DOMAIN` is unset).
 */
function installFakeWindow(plausible?: (...args: unknown[]) => void) {
  ;(globalThis as any).window = plausible ? { plausible } : {}
  return () => {
    delete (globalThis as any).window
  }
}

describe("track", () => {
  it("no-ops (no throw) when there is no window at all (SSR)", () => {
    expect(() => track("add_to_cart")).not.toThrow()
  })

  it("no-ops (no throw) when window.plausible is undefined -- the analytics-off path", () => {
    const uninstall = installFakeWindow(undefined)
    try {
      expect(() => track("add_to_cart", { value: 10 })).not.toThrow()
    } finally {
      uninstall()
    }
  })

  it("calls window.plausible with the event and props nested under `props`", () => {
    const calls: unknown[][] = []
    const uninstall = installFakeWindow((...args: unknown[]) => {
      calls.push(args)
    })
    try {
      track("purchase", { value: 42, currency: "USD" })
      expect(calls).toEqual([
        ["purchase", { props: { value: 42, currency: "USD" } }],
      ])
    } finally {
      uninstall()
    }
  })

  it("calls window.plausible with no options object when no props are given", () => {
    const calls: unknown[][] = []
    const uninstall = installFakeWindow((...args: unknown[]) => {
      calls.push(args)
    })
    try {
      track("begin_checkout")
      expect(calls).toEqual([["begin_checkout", undefined]])
    } finally {
      uninstall()
    }
  })
})
