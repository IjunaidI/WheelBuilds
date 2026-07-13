import { handleSuffix, suffixedHandle, isHandleConflictError } from "../pipeline/handle-collision"

describe("handle collision (WB-089 L10)", () => {
  it("suffix is deterministic per group_key and 6 hex chars", () => {
    expect(handleSuffix("Falken|Wildpeak")).toBe(handleSuffix("Falken|Wildpeak"))
    expect(handleSuffix("Falken|Wildpeak")).toMatch(/^[0-9a-f]{6}$/)
  })
  it("distinct group_keys colliding on a base handle get distinct handles", () => {
    const a = suffixedHandle("xd-820-grenade", "XD 820|Grenade")
    const b = suffixedHandle("xd-820-grenade", "XD|820-Grenade")
    expect(a).not.toBe(b)
    expect(a.startsWith("xd-820-grenade-")).toBe(true)
  })
  it("recognises a handle uniqueness violation, not unrelated errors", () => {
    expect(isHandleConflictError({ code: "23505" })).toBe(true)
    expect(isHandleConflictError({ message: 'Product with handle "x" already exists' })).toBe(true)
    expect(isHandleConflictError(new Error("network timeout"))).toBe(false)
  })
})
