import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { boreClears } from "../bore-clearance"

const golden = JSON.parse(readFileSync(join(__dirname, "../../../../../fixtures/bore-clearance-golden.json"), "utf8"))

describe("bore-clearance golden (storefront twin)", () => {
  for (const { bore, hub, clears } of golden) {
    it(`bore=${bore} hub=${hub} → ${clears}`, () => {
      expect(boreClears(bore, hub)).toBe(clears)
    })
  }
})
