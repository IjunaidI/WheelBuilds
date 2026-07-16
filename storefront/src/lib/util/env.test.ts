import { describe, it, expect } from "vitest"
import { isFallbackBaseUrl, FALLBACK_BASE_URL, getBaseURL } from "./env"

describe("FALLBACK_BASE_URL", () => {
  it("is the exact loopback value getBaseURL() falls back to when NEXT_PUBLIC_BASE_URL is unset", () => {
    // WB-095 X3: single source of truth -- isFallbackBaseUrl and getBaseURL
    // both read this constant so they can never drift apart.
    expect(FALLBACK_BASE_URL).toBe("https://localhost:8000")
  })
})

describe("isFallbackBaseUrl", () => {
  it("is true for the exact getBaseURL() fallback", () => {
    expect(isFallbackBaseUrl("https://localhost:8000")).toBe(true)
  })

  it("tolerates a trailing slash", () => {
    expect(isFallbackBaseUrl("https://localhost:8000/")).toBe(true)
  })

  it("is false for a real production base URL", () => {
    expect(isFallbackBaseUrl("https://wheelbuilds.com")).toBe(false)
  })

  it("is false for a different localhost port -- not the specific fallback value", () => {
    expect(isFallbackBaseUrl("https://localhost:3000")).toBe(false)
  })

  it("is false for an empty string", () => {
    expect(isFallbackBaseUrl("")).toBe(false)
  })
})

describe("getBaseURL", () => {
  it("returns the fallback when NEXT_PUBLIC_BASE_URL is unset", () => {
    const prev = process.env.NEXT_PUBLIC_BASE_URL
    delete process.env.NEXT_PUBLIC_BASE_URL
    try {
      expect(isFallbackBaseUrl(getBaseURL())).toBe(true)
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_BASE_URL
      } else {
        process.env.NEXT_PUBLIC_BASE_URL = prev
      }
    }
  })
})
