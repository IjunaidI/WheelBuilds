import { resolveOptional } from "../resolve-optional"

describe("resolveOptional", () => {
  it("returns the service when resolve succeeds", () => {
    const scope = { resolve: () => ({ ok: 1 }) }
    expect(resolveOptional(scope, "anything")).toEqual({ ok: 1 })
  })
  // bare catch is intentional: ANY resolver failure should degrade gracefully
  // (not 500); the behavior stays correct even if Awilix changes its error class.
  it("returns null when resolve throws (module not registered)", () => {
    const scope = { resolve: () => { throw new Error("AwilixResolutionError: Could not resolve 'x'") } }
    expect(resolveOptional(scope, "x")).toBeNull()
  })
})
