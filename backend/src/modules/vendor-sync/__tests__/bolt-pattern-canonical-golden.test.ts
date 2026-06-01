import { readFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalBoltPatterns } from "../search/bolt-pattern-canonical"
// from backend/src/modules/vendor-sync/__tests__/ up to repo root: __tests__→vendor-sync→modules→src→backend→root = 5
const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/bolt-pattern-canonical-golden.json"), "utf8")
) as { input: string; output: string[] }[]
describe("canonicalBoltPatterns matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(canonicalBoltPatterns(input)).toEqual(output)
    })
  }
})
