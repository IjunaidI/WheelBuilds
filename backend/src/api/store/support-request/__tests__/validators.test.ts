// WB-119 Q-04 / Q-20 — this endpoint is public and unauthenticated, so the
// validator is the only thing standing between a stranger and the database.
import { parseSupportRequest } from "../validators"

const valid = { name: "QA Tester", email: "qa@example.com", message: "Does this fit?" }

describe("parseSupportRequest", () => {
  it("accepts a minimal valid body", () => {
    expect(parseSupportRequest(valid).ok).toBe(true)
  })

  it("accepts the optional fitment fields", () => {
    const r = parseSupportRequest({
      ...valid,
      phone: "+15555550100",
      subject: "Fitment",
      source: "fitment-check",
      vehicle: "2019 Toyota Corolla LE",
      product_handle: "nitto-terra-grappler",
      country_code: "us",
    })
    expect(r.ok).toBe(true)
  })

  it.each([
    ["missing name", { ...valid, name: undefined }],
    ["whitespace-only name", { ...valid, name: "   " }],
    ["missing message", { ...valid, message: undefined }],
    ["whitespace-only message", { ...valid, message: "  " }],
    ["missing email", { ...valid, email: undefined }],
  ])("rejects %s", (_label, body) => {
    expect(parseSupportRequest(body).ok).toBe(false)
  })

  it("rejects an over-long message rather than letting it reach the DB", () => {
    expect(parseSupportRequest({ ...valid, message: "x".repeat(5001) }).ok).toBe(false)
  })

  it("rejects a non-object body", () => {
    expect(parseSupportRequest(null).ok).toBe(false)
    expect(parseSupportRequest("hello").ok).toBe(false)
    expect(parseSupportRequest(undefined).ok).toBe(false)
  })

  it("returns a field-scoped error message on failure", () => {
    const r = parseSupportRequest({ ...valid, email: undefined })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.error).toMatch(/email/)
  })

  it("trims the values it returns", () => {
    const r = parseSupportRequest({
      name: "  QA  ",
      email: " QA@Example.com ",
      message: "  hi  ",
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.name).toBe("QA")
      expect(r.data.message).toBe("hi")
    }
  })
})
