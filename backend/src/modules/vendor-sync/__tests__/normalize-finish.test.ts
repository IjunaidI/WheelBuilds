import { normalizeFinish } from "../search/normalize-finish"

describe("normalizeFinish", () => {
  it("maps black-family finishes to black", () => {
    expect(normalizeFinish("Gloss Black")).toBe("black")
    expect(normalizeFinish("Matte Black")).toBe("black")
    expect(normalizeFinish("Satin Black Milled")).toBe("black")
  })

  it("maps bronze/gold/copper finishes to bronze", () => {
    expect(normalizeFinish("Satin Bronze")).toBe("bronze")
    expect(normalizeFinish("Brushed Gold")).toBe("bronze")
    expect(normalizeFinish("Copper")).toBe("bronze")
  })

  it("maps silver/chrome/machined finishes to silver", () => {
    expect(normalizeFinish("Brushed Silver")).toBe("silver")
    expect(normalizeFinish("Chrome")).toBe("silver")
    expect(normalizeFinish("Machined")).toBe("silver")
    expect(normalizeFinish("Gunmetal")).toBe("silver")
  })

  it("defaults unknown or empty finishes to black", () => {
    expect(normalizeFinish(null)).toBe("black")
    expect(normalizeFinish("")).toBe("black")
    expect(normalizeFinish("Rainbow Glitter")).toBe("black")
  })

  it("prefers bronze over silver when both keywords are present", () => {
    // BRONZE is checked before SILVER, so "bronze" wins over "chrome".
    expect(normalizeFinish("Bronze Chrome")).toBe("bronze")
  })

  it("covers the remaining keyword buckets", () => {
    expect(normalizeFinish("Brass")).toBe("bronze")
    expect(normalizeFinish("Graphite")).toBe("silver")
    expect(normalizeFinish("Titanium")).toBe("silver")
    expect(normalizeFinish("Gray")).toBe("silver")
  })

  it("treats a black wheel with a milled/machined/chrome accent as black", () => {
    // "black" dominates a silver-accent keyword — a Gloss Black Machined wheel
    // is a black wheel to a shopper, and must bucket identically to its Milled
    // sibling (the two used to split silver vs black).
    expect(normalizeFinish("Gloss Black Machined")).toBe("black")
    expect(normalizeFinish("Gloss Black Milled")).toBe("black")
    expect(normalizeFinish("Black Chrome")).toBe("black")
  })

  it("buckets bare machined/milled (no black) as silver", () => {
    expect(normalizeFinish("Machined")).toBe("silver")
    expect(normalizeFinish("Milled")).toBe("silver")
  })
})
