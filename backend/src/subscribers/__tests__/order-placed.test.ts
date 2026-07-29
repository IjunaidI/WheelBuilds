// WB-119 Q-19 — a failed order-confirmation email must be visible.
//
// WB-094 made the Resend provider THROW instead of silently recording
// success. But this subscriber wrapped createNotifications in
// `try { … } catch { console.error(…) }`, which threw that signal straight
// back away: the failure never reached the Medusa logger, so in production
// "the customer didn't get their email" was indistinguishable from "sent
// fine". The tester's "confirmation email — didnt receive any" is exactly
// that blind spot.
import orderPlacedHandler from "../order-placed"

const makeContainer = (notify: jest.Mock, logger: any) => ({
  resolve: (key: string) => {
    const k = String(key).toLowerCase()
    if (k.includes("notification")) return { createNotifications: notify }
    if (k.includes("order")) {
      return {
        retrieveOrder: jest.fn().mockResolvedValue({
          id: "order_1",
          email: "qa@example.com",
          shipping_address: { id: "addr_1" },
          items: [],
        }),
        orderAddressService_: {
          retrieve: jest.fn().mockResolvedValue({ id: "addr_1" }),
        },
      }
    }
    return logger
  },
})

const makeLogger = () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })

describe("order-placed subscriber (WB-119 Q-19)", () => {
  it("reports a send failure through the Medusa logger, not console", async () => {
    const logger = makeLogger()
    const notify = jest.fn().mockRejectedValue(new Error("Resend rejected"))

    await orderPlacedHandler({
      event: { data: { id: "order_1" } },
      container: makeContainer(notify, logger),
    } as any)

    expect(logger.error).toHaveBeenCalled()
    const msg = logger.error.mock.calls.map((c: any[]) => String(c[0])).join(" ")
    expect(msg).toMatch(/order_1/)
    expect(msg).toMatch(/Resend rejected/)
  })

  it("does not log an error when the send succeeds", async () => {
    const logger = makeLogger()
    const notify = jest.fn().mockResolvedValue(undefined)

    await orderPlacedHandler({
      event: { data: { id: "order_1" } },
      container: makeContainer(notify, logger),
    } as any)

    expect(notify).toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("does not rethrow — a placed, paid order must not be retried into a duplicate send", async () => {
    const logger = makeLogger()
    const notify = jest.fn().mockRejectedValue(new Error("boom"))

    await expect(
      orderPlacedHandler({
        event: { data: { id: "order_1" } },
        container: makeContainer(notify, logger),
      } as any)
    ).resolves.toBeUndefined()
  })
})
