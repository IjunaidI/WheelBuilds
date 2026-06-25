import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeFinish } from "../search/normalize-finish"

// from backend/src/modules/vendor-sync/__tests__/ up to repo root:
// __tests__ → vendor-sync → modules → src → backend → root = 5
const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/finish-normalize-golden.json"), "utf8")
) as { input: string; output: "black" | "bronze" | "silver" }[]

describe("normalizeFinish matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${output}`, () => {
      expect(normalizeFinish(input)).toBe(output)
    })
  }
})
