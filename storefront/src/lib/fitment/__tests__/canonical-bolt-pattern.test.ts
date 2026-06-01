// storefront/src/lib/fitment/__tests__/canonical-bolt-pattern.test.ts
import { it, expect, describe } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalBoltPatterns } from "../canonical-bolt-pattern"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/bolt-pattern-canonical-golden.json"), "utf8")
) as { input: string; output: string[] }[]

describe("canonicalBoltPatterns twin matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(canonicalBoltPatterns(input)).toEqual(output)
    })
  }
})
