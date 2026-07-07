import { parseVehicleCreate, parseVehicleMerge } from "../validators"

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

describe("parseVehicleMerge", () => {
  const validVehicle = { client_id: "c1", year: 2021, make: "Ford", model: "F-150" }

  it("accepts a merge with 50 vehicles", () => {
    const vehicles = Array(50).fill(validVehicle)
    const r = parseVehicleMerge({ vehicles })
    expect(r.ok).toBe(true)
  })

  it("rejects a merge with 51 vehicles", () => {
    const vehicles = Array(51).fill(validVehicle)
    const r = parseVehicleMerge({ vehicles })
    expect(r.ok).toBe(false)
  })
})
