import { hostFromDatabaseUrl, confirmMatches } from "../confirm-host"

describe("purge-products confirm-host", () => {
  const url = "postgres://user:pw@trolley.proxy.rlwy.net:5432/railway"
  it("extracts the host", () => {
    expect(hostFromDatabaseUrl(url)).toBe("trolley.proxy.rlwy.net")
  })
  it("matches only when confirm echoes the host", () => {
    expect(confirmMatches({ confirm: "trolley.proxy.rlwy.net" }, url)).toBe(true)
    expect(confirmMatches({ confirm: "wrong" }, url)).toBe(false)
    expect(confirmMatches({}, url)).toBe(false)
  })
})
