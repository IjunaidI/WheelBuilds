import { describe, it, expect, afterEach, vi } from "vitest"
import { canonicalUrl } from "./canonical"

describe("canonicalUrl (WB-095 X2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("builds an absolute URL pinned to the default region (us)", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://wheelbuilds.com")
    expect(canonicalUrl("/store")).toBe("https://wheelbuilds.com/us/store")
  })

  it("collapses the bare root path to just the region prefix, no trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://wheelbuilds.com")
    expect(canonicalUrl("/")).toBe("https://wheelbuilds.com/us")
  })

  it("falls back to env.ts's localhost default when NEXT_PUBLIC_BASE_URL is unset", () => {
    expect(canonicalUrl("/tires")).toBe("https://localhost:8000/us/tires")
  })

  it("never produces a double slash, even when the base URL has a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://wheelbuilds.com/")
    expect(canonicalUrl("/store")).toBe("https://wheelbuilds.com/us/store")
  })

  it("normalizes a path missing its leading slash the same way", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://wheelbuilds.com")
    expect(canonicalUrl("store")).toBe("https://wheelbuilds.com/us/store")
  })

  it("strips a trailing slash on the input path", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://wheelbuilds.com")
    expect(canonicalUrl("/store/")).toBe("https://wheelbuilds.com/us/store")
  })

  it("handles multi-segment paths, e.g. the PDP", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://wheelbuilds.com")
    expect(canonicalUrl("/products/some-handle")).toBe(
      "https://wheelbuilds.com/us/products/some-handle"
    )
  })

  it("pins to the default region regardless of any request-time country code -- the function accepts no country-code argument at all, so a /de or /gb request cannot leak through", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://wheelbuilds.com")
    expect(canonicalUrl("/store")).toBe("https://wheelbuilds.com/us/store")
  })
})
