import { MedusaError } from "@medusajs/framework/utils"
import { ResendNotificationService } from "../services/resend"
import { PASSWORD_RESET } from "../templates/password-reset"

// resend.emails.send() RESOLVES { data, error } — it never rejects for an invalid
// API key / unverified sender domain / rate limit / validation error. Mock the SDK
// so we can drive both the "resolved with error" and "resolved success" shapes,
// plus a genuine transport throw (network failure).
const sendMock = jest.fn()

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}))

// The real templates render JSX via react-email components, which this repo's
// swc/jest transform isn't configured for (classic JSX runtime, no `React` in
// scope — see jest.config.js). That's orthogonal to what this spec covers (the
// Resend transport/error-handling contract), so stub template generation and
// keep the rest of the module's real exports (e.g. PASSWORD_RESET).
jest.mock("../templates", () => ({
  ...jest.requireActual("../templates"),
  generateEmailTemplate: jest.fn(() => "mock-email-content"),
}))

function buildLogger() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  } as any
}

function buildService(logger: ReturnType<typeof buildLogger>) {
  return new ResendNotificationService(
    { logger },
    { api_key: "re_test_key", from: "noreply@example.com" }
  )
}

function buildNotification() {
  return {
    to: "customer@example.com",
    channel: "email",
    template: PASSWORD_RESET,
    data: {
      resetLink: "https://example.com/us/reset-password?token=abc",
      emailOptions: { subject: "Reset your password" },
    },
  } as any
}

describe("ResendNotificationService (WB-094 A1 - fail loud on Resend API error)", () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  it("throws a MedusaError when Resend resolves with an error instead of swallowing it as success", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid from address" },
    })
    const logger = buildLogger()
    const service = buildService(logger)

    const result = service.send(buildNotification())

    await expect(result).rejects.toBeInstanceOf(MedusaError)
    await expect(result).rejects.toThrow(
      'Resend rejected "password-reset" to customer@example.com: validation_error'
    )
    await expect(result).rejects.toThrow('Invalid from address')
    expect(logger.log).not.toHaveBeenCalled()
  })

  it("resolves normally and logs success when Resend returns a successful response", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null })
    const logger = buildLogger()
    const service = buildService(logger)

    const result = await service.send(buildNotification())

    expect(result).toEqual({})
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Successfully sent "password-reset" email')
    )
  })

  it("wraps a genuine transport throw (e.g. network failure) in a MedusaError", async () => {
    sendMock.mockRejectedValue(new Error("ECONNRESET"))
    const logger = buildLogger()
    const service = buildService(logger)

    const result = service.send(buildNotification())

    await expect(result).rejects.toBeInstanceOf(MedusaError)
    await expect(result).rejects.toThrow('ECONNRESET')
    expect(logger.log).not.toHaveBeenCalled()
  })
})
