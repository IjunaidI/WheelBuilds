import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeFinish } from "../normalize-finish"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/finish-normalize-golden.json"), "utf8")
) as { input: string; output: "black" | "bronze" | "silver" }[]

describe("normalizeFinish twin matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${output}`, () => {
      expect(normalizeFinish(input)).toBe(output)
    })
  }
})
