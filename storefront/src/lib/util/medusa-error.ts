import { extractMedusaMessage } from "./error-message"

export default function medusaError(error: any): never {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx.
    // Diagnostic logging is best-effort — a malformed config/response shape
    // must never prevent the real error message below from surfacing.
    try {
      const cfg = error.config ?? error.response.config
      if (cfg?.url) {
        const u = new URL(cfg.url, cfg.baseURL)
        console.error("Resource:", u.toString())
      }
      console.error("Response data:", error.response.data)
      console.error("Status code:", error.response.status)
      console.error("Headers:", error.response.headers)
    } catch {
      // ignore — logging only
    }

    // Extract the user-facing message via the shared helper (WB-079 F15).
    const message = extractMedusaMessage(error) ?? "An error occurred."

    throw new Error(message)
  } else if (error.request) {
    // The request was made but no response was received
    throw new Error("No response received: " + error.request)
  } else {
    // Something happened in setting up the request that triggered an Error
    throw new Error("Error setting up the request: " + error.message)
  }
}
