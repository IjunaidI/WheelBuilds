import { meiliConfigured, emitMeiliReconcile } from "../meili-reconcile"

describe("meili reconcile (WB-089 L1)", () => {
  it("meiliConfigured requires both env vars", () => {
    expect(meiliConfigured({ MEILISEARCH_HOST: "h", MEILISEARCH_ADMIN_KEY: "k" } as any)).toBe(true)
    expect(meiliConfigured({ MEILISEARCH_HOST: "h" } as any)).toBe(false)
    expect(meiliConfigured({} as any)).toBe(false)
  })

  it("emitMeiliReconcile emits meilisearch.sync when configured", async () => {
    process.env.MEILISEARCH_HOST = "h"
    process.env.MEILISEARCH_ADMIN_KEY = "k"
    const emit = jest.fn()
    const ok = await emitMeiliReconcile({ resolve: () => ({ emit }) } as any)
    expect(ok).toBe(true)
    expect(emit).toHaveBeenCalledWith({ name: "meilisearch.sync", data: {} })
  })

  it("is a no-op when Meili is not configured", async () => {
    delete process.env.MEILISEARCH_HOST
    delete process.env.MEILISEARCH_ADMIN_KEY
    const emit = jest.fn()
    expect(await emitMeiliReconcile({ resolve: () => ({ emit }) } as any)).toBe(false)
    expect(emit).not.toHaveBeenCalled()
  })
})
