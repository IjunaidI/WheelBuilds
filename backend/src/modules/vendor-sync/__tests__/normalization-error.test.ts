import { z } from "zod"
import { summarizeNormalizationError } from "../pipeline/normalization-error"

describe("summarizeNormalizationError", () => {
  it("collapses a real ZodError to one line of path: message pairs", () => {
    // The exact shape the wheels adapter throws for the feed's empty
    // BoltPattern rows -- ~13 lines of pretty JSON in err.message.
    const schema = z.object({ BoltPattern: z.string().min(1, "BoltPattern is required") })
    let err: unknown
    try {
      schema.parse({ BoltPattern: "" })
    } catch (e) {
      err = e
    }

    const summary = summarizeNormalizationError(err)
    expect(summary).toBe("BoltPattern: BoltPattern is required")
    expect(summary).not.toContain("\n")
  })

  it("joins multiple issues so ASANTIDISPLAY-style rows stay one line", () => {
    const schema = z.object({
      Size: z.string().min(1, "Size is required"),
      BoltPattern: z.string().min(1, "BoltPattern is required"),
    })
    let err: unknown
    try {
      schema.parse({ Size: "", BoltPattern: "" })
    } catch (e) {
      err = e
    }

    expect(summarizeNormalizationError(err)).toBe(
      "Size: Size is required; BoltPattern: BoltPattern is required"
    )
  })

  it("passes an ordinary Error's message through unchanged", () => {
    expect(
      summarizeNormalizationError(new Error('Invalid size format: "18"'))
    ).toBe('Invalid size format: "18"')
  })

  it("produces an IDENTICAL reason for two rows failing the same way (aggregation key)", () => {
    const schema = z.object({ BoltPattern: z.string().min(1, "BoltPattern is required") })
    const summarize = (raw: any) => {
      try {
        schema.parse(raw)
        return "no-throw"
      } catch (e) {
        return summarizeNormalizationError(e)
      }
    }
    expect(summarize({ BoltPattern: "" })).toBe(summarize({ BoltPattern: "" }))
  })

  it("collapses embedded newlines and truncates a pathological message", () => {
    const long = summarizeNormalizationError(new Error("x\n  y\n  z".padEnd(500, "!")))
    expect(long).not.toContain("\n")
    expect(long.length).toBeLessThanOrEqual(201)
    expect(long.endsWith("…")).toBe(true)
  })

  it("never returns an empty reason", () => {
    expect(summarizeNormalizationError(new Error(""))).toBe("unknown error")
  })
})
