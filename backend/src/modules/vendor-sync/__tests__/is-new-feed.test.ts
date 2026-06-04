import { isNewFeed } from "../feed-source/is-new-feed"

describe("isNewFeed", () => {
  it("is new when there is no prior run", () => {
    expect(isNewFeed({ name: "inv.csv", modifyTime: 100 }, null)).toBe(true)
  })
  it("is new when the name changed", () => {
    expect(isNewFeed({ name: "inv-2.csv", modifyTime: 100 }, { name: "inv-1.csv", modifyTime: 100 })).toBe(true)
  })
  it("is new when the modify time changed", () => {
    expect(isNewFeed({ name: "inv.csv", modifyTime: 200 }, { name: "inv.csv", modifyTime: 100 })).toBe(true)
  })
  it("is NOT new when name and modify time both match", () => {
    expect(isNewFeed({ name: "inv.csv", modifyTime: 100 }, { name: "inv.csv", modifyTime: 100 })).toBe(false)
  })
})
