import { describe, it, expect } from "vitest"
import { passwordError } from "./password"

describe("passwordError", () => {
  it("returns an error string under 8 characters", () => {
    expect(passwordError("")).toEqual(expect.any(String))
    expect(passwordError("short1")).toEqual(expect.any(String))
    expect(passwordError("1234567")).toEqual(expect.any(String))
  })

  it("returns null at 8+ characters", () => {
    expect(passwordError("12345678")).toBeNull()
    expect(passwordError("a-very-long-passphrase")).toBeNull()
  })
})
