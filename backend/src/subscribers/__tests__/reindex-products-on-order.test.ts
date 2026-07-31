// WB-128 — see the subscriber's docstring for why this gap exists at all.
import reindexProductsOnOrder from "../reindex-products-on-order"

const makeContainer = (opts: {
  order?: any
  emit?: jest.Mock
  logger?: any
  retrieveThrows?: boolean
}) => {
  const logger = opts.logger ?? { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const emit = opts.emit ?? jest.fn().mockResolvedValue(undefined)
  return {
    logger,
    emit,
    container: {
      resolve: (key: string) => {
        const k = String(key).toLowerCase()
        if (k.includes("event")) return { emit }
        if (k.includes("order")) {
          return {
            retrieveOrder: opts.retrieveThrows
              ? jest.fn().mockRejectedValue(new Error("db down"))
              : jest.fn().mockResolvedValue(opts.order ?? { id: "order_1", items: [] }),
          }
        }
        return logger
      },
    } as any,
  }
}

const run = (container: any, name = "order.placed") =>
  reindexProductsOnOrder({ event: { name, data: { id: "order_1" } }, container } as any)

describe("reindexProductsOnOrder (WB-128)", () => {
  it("emits one product.updated per distinct product in the order", async () => {
    const { container, emit } = makeContainer({
      order: {
        id: "order_1",
        items: [{ product_id: "prod_1" }, { product_id: "prod_1" }, { product_id: "prod_2" }],
      },
    })
    await run(container)

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith([
      { name: "product.updated", data: { id: "prod_1" } },
      { name: "product.updated", data: { id: "prod_2" } },
    ])
  })

  it("also re-indexes on cancellation and on a received return (restock)", async () => {
    for (const evt of ["order.canceled", "order.return_received"]) {
      const { container, emit } = makeContainer({
        order: { id: "order_1", items: [{ product_id: "prod_1" }] },
      })
      await run(container, evt)
      expect(emit).toHaveBeenCalledWith([
        { name: "product.updated", data: { id: "prod_1" } },
      ])
    }
  })

  it("warns rather than emitting when no product resolves", async () => {
    const { container, emit, logger } = makeContainer({ order: { id: "order_1", items: [] } })
    await run(container)
    expect(emit).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it("NEVER throws — a re-index failure must not fail the order event", async () => {
    // Throwing would have the event bus retry a COMPLETED purchase.
    const { container, logger } = makeContainer({ retrieveThrows: true })
    await expect(run(container)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })

  it("logs loudly when it fails, naming the consequence", async () => {
    const { container, logger } = makeContainer({ retrieveThrows: true })
    await run(container)
    const msg = logger.error.mock.calls.map((c: any[]) => String(c[0])).join(" ")
    expect(msg).toMatch(/order_1/)
    expect(msg).toMatch(/stale stock/i)
  })

  it("swallows an event-bus failure the same way", async () => {
    const emit = jest.fn().mockRejectedValue(new Error("bus down"))
    const { container, logger } = makeContainer({
      order: { id: "order_1", items: [{ product_id: "prod_1" }] },
      emit,
    })
    await expect(run(container)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})
