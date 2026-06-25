import { describe, it, expect } from "vitest"
import { retainedPromoCodes } from "./promo-codes"

const promo = (code: string | undefined) => ({ code }) as any

describe("retainedPromoCodes", () => {
  it("keeps all manual codes when no removeCode is given (add path)", () => {
    expect(retainedPromoCodes([promo("A"), promo("B")])).toEqual(["A", "B"])
  })
  it("excludes exactly the removed code (remove path)", () => {
    expect(retainedPromoCodes([promo("A"), promo("B")], "B")).toEqual(["A"])
  })
  it("drops automatic promotions (code null/undefined) — Medusa re-derives them", () => {
    expect(retainedPromoCodes([promo("A"), promo(undefined)])).toEqual(["A"])
  })
  it("drops automatic promotions even when they carry a code", () => {
    expect(
      retainedPromoCodes([promo("A"), { code: "AUTO", is_automatic: true } as any])
    ).toEqual(["A"])
  })
  it("empty list → empty", () => {
    expect(retainedPromoCodes([])).toEqual([])
  })
})
