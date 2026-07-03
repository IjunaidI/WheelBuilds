import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { canonicalizeTireSize } from "../canonicalize-tire-size"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/tire-size-canonical-golden.json"), "utf8")
) as { input: string; output: string }[]

describe("canonicalizeTireSize golden (storefront twin)", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(canonicalizeTireSize(input)).toBe(output)
    })
  }
})
