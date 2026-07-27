/** Hard cap on a single summarized reason, so one pathological message can
 * never dominate a log line. */
const MAX_REASON_LENGTH = 200

/**
 * Collapse a row-normalization failure into ONE compact line.
 *
 * Adapters fail rows two different ways: `schema.parse(raw)` throws a ZodError
 * whose `.message` is the pretty-printed JSON of its `issues` array (~13 lines
 * for a single missing field), while the hand-rolled checks throw ordinary
 * Errors ("Invalid size format: \"18\""). stage.ts used to interpolate
 * `err.message` straight into a warn, so a routine production run emitted
 * hundreds of lines of JSON for ~65 skipped rows out of 40k — enough noise to
 * bury the summary line underneath it.
 *
 * Zod issues collapse to `path: message` pairs so the reason stays both
 * readable AND stable across rows, which is what lets stage.ts aggregate
 * "BoltPattern is required × 56" instead of printing it 56 times.
 */
export function summarizeNormalizationError(err: unknown): string {
  const issues = (err as { issues?: unknown })?.issues
  let reason: string

  if (Array.isArray(issues) && issues.length > 0) {
    reason = issues
      .map((issue: any) => {
        const path =
          Array.isArray(issue?.path) && issue.path.length > 0
            ? issue.path.join(".")
            : "(root)"
        return `${path}: ${issue?.message ?? "invalid"}`
      })
      .join("; ")
  } else {
    reason = err instanceof Error ? err.message : String(err)
  }

  // Whitespace-collapse so a multi-line message can never re-expand into the
  // many-lines-per-row shape this function exists to prevent.
  reason = reason.replace(/\s+/g, " ").trim()
  if (reason.length > MAX_REASON_LENGTH) {
    reason = `${reason.slice(0, MAX_REASON_LENGTH)}…`
  }
  return reason || "unknown error"
}
