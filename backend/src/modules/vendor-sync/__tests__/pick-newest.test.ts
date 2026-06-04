import { pickNewestFeed } from "../feed-source/pick-newest"

const f = (name: string, modifyTime: number) => ({ name, modifyTime, size: 100 })

describe("pickNewestFeed", () => {
  it("returns the newest file matching the pattern", () => {
    const files = [f("inv-2026-05-01.csv", 1000), f("inv-2026-05-03.csv", 3000), f("inv-2026-05-02.csv", 2000)]
    expect(pickNewestFeed(files, /^inv-.*\.csv$/)?.name).toBe("inv-2026-05-03.csv")
  })
  it("ignores files that do not match the pattern", () => {
    const files = [f("readme.txt", 9000), f("inv-2026-05-01.csv", 1000)]
    expect(pickNewestFeed(files, /^inv-.*\.csv$/)?.name).toBe("inv-2026-05-01.csv")
  })
  it("returns null when nothing matches", () => {
    expect(pickNewestFeed([f("readme.txt", 9000)], /^inv-.*\.csv$/)).toBeNull()
    expect(pickNewestFeed([], /.*/)).toBeNull()
  })
})
