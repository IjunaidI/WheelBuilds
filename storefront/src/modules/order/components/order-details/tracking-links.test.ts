import { describe, it, expect } from "vitest"
import { trackingLinks } from "./tracking-links"

describe("trackingLinks", () => {
  it("returns an empty array when there are no fulfillments", () => {
    expect(trackingLinks(undefined)).toEqual([])
    expect(trackingLinks(null)).toEqual([])
    expect(trackingLinks([])).toEqual([])
  })

  it("returns an empty array when fulfillments have no labels", () => {
    expect(trackingLinks([{ labels: [] }, {}])).toEqual([])
  })

  it("flattens labels from multiple fulfillments into one ordered list", () => {
    const result = trackingLinks([
      {
        labels: [
          { tracking_number: "1Z1", tracking_url: "https://ups.example/1Z1" },
        ],
      },
      {
        labels: [
          { tracking_number: "1Z2", tracking_url: "https://ups.example/1Z2" },
          { tracking_number: "1Z3", tracking_url: null },
        ],
      },
    ])

    expect(result).toEqual([
      { number: "1Z1", url: "https://ups.example/1Z1" },
      { number: "1Z2", url: "https://ups.example/1Z2" },
      { number: "1Z3" },
    ])
  })

  it("skips a label that has no tracking number", () => {
    expect(
      trackingLinks([
        { labels: [{ tracking_number: "", tracking_url: "https://x" }] },
      ])
    ).toEqual([])
    expect(
      trackingLinks([{ labels: [{ tracking_url: "https://x" }] }])
    ).toEqual([])
  })
})
