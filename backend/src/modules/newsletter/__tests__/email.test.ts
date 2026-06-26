import { normalizeEmail, isValidEmail } from "../lib/email"

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com")
  })
})

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("a@b.co")).toBe(true)
    expect(isValidEmail("first.last@sub.domain.com")).toBe(true)
  })
  it("rejects missing @, missing dot, empty, spaces, double @", () => {
    expect(isValidEmail("no-at")).toBe(false)
    expect(isValidEmail("a@b")).toBe(false)
    expect(isValidEmail("")).toBe(false)
    expect(isValidEmail("a b@c.com")).toBe(false)
    expect(isValidEmail("a@@b.com")).toBe(false)
  })
})
