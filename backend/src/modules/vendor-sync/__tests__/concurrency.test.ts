import { mapWithConcurrency } from "../pipeline/concurrency"

const tick = () => new Promise((r) => setTimeout(r, 5))

describe("mapWithConcurrency", () => {
  it("processes every item and preserves index order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40])
  })

  it("never exceeds the concurrency limit", async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++
      peak = Math.max(peak, active)
      await tick()
      active--
    })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it("stops scheduling new items once shouldStop flips true", async () => {
    const seen: number[] = []
    let stop = false
    const out = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      1,
      async (n) => {
        seen.push(n)
        if (n === 2) stop = true
        return n
      },
      () => stop
    )
    // items after the stop are never started
    expect(seen).toEqual([1, 2])
    expect(out[4]).toBeUndefined()
    expect(out[5]).toBeUndefined()
  })

  it("a caught-error fn keeps the batch going (caller catches)", async () => {
    const errors: number[] = []
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      try {
        if (n === 2) throw new Error("boom")
        return n
      } catch {
        errors.push(n)
        return undefined as any
      }
    })
    expect(errors).toEqual([2])
    expect(out[0]).toBe(1)
    expect(out[2]).toBe(3)
  })
})
