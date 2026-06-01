import { parseVehicleCreate } from "../validators"

describe("parseVehicleCreate", () => {
  it("accepts a well-formed vehicle", () => {
    const r = parseVehicleCreate({ client_id: "c1", year: 2021, make: "Ford", model: "F-150", trim: "XLT" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.make).toBe("Ford")
  })
  it("rejects a missing make", () => {
    const r = parseVehicleCreate({ client_id: "c1", year: 2021, model: "F-150" })
    expect(r.ok).toBe(false)
  })
  it("strips is_active so a client cannot create an active vehicle", () => {
    const r = parseVehicleCreate({ client_id: "c1", year: 2021, make: "Ford", model: "F-150", is_active: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect("is_active" in r.data).toBe(false)
  })
})
