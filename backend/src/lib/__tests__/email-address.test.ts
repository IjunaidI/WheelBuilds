// WB-119 Task 1 — shared email helpers, promoted out of the newsletter module
// so `support-request` can use the same rules without a copy-paste drift pair.
import { isValidEmail, normalizeEmail } from "../email-address"

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  QA@Example.COM ")).toBe("qa@example.com")
  })
})

describe("isValidEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.com"])("accepts %s", (e) => {
    expect(isValidEmail(e)).toBe(true)
  })

  it.each([
    "",
    "a",
    "no-at.example.com",
    "two@@example.com",
    "spaces in@example.com",
    "a@b",
  ])("rejects %s", (e) => {
    expect(isValidEmail(e)).toBe(false)
  })

  it("rejects an address longer than 254 chars", () => {
    expect(isValidEmail(`${"a".repeat(250)}@b.co`)).toBe(false)
  })
})
