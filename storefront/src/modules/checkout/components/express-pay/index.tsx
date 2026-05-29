"use client"

import { toast } from "sonner"
import Label from "@modules/common/components/label"

/**
 * Apple Pay / Google Pay express buttons + "OR PAY WITH CARD" rule. The
 * buttons are visual chrome for now — wiring to real wallet providers is an
 * integration follow-up. On click they toast a "coming soon" hint so users
 * aren't left wondering what happened.
 */
const ExpressPay = () => {
  const handleApple = () =>
    toast("Apple Pay coming soon", {
      description: "Use the form below to pay with a card meanwhile.",
    })
  const handleGoogle = () =>
    toast("Google Pay coming soon", {
      description: "Use the form below to pay with a card meanwhile.",
    })

  return (
    <div>
      <Label tone="ink" style={{ display: "block", marginBottom: 12 }}>
        EXPRESS CHECKOUT
      </Label>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handleApple}
          aria-label="Pay with Apple Pay"
          className="h-14 rounded text-white flex items-center justify-center gap-1.5 text-[18px] font-medium hover:opacity-90 transition-opacity"
          style={{ background: "#000" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden>
            <path d="M17.05 12.04c-.03-2.91 2.38-4.31 2.49-4.38-1.36-1.99-3.47-2.26-4.22-2.29-1.8-.18-3.51 1.06-4.42 1.06-.92 0-2.32-1.04-3.81-1.01-1.96.03-3.77 1.14-4.78 2.89-2.04 3.53-.52 8.76 1.46 11.63.97 1.4 2.12 2.97 3.62 2.92 1.46-.06 2.01-.94 3.77-.94 1.76 0 2.26.94 3.8.91 1.57-.03 2.56-1.43 3.52-2.83 1.11-1.62 1.57-3.19 1.6-3.27-.04-.02-3.07-1.18-3.1-4.69M14.27 3.27c.8-.97 1.34-2.31 1.19-3.65-1.15.05-2.55.77-3.38 1.73-.74.86-1.39 2.23-1.22 3.54 1.28.1 2.6-.65 3.41-1.62" />
          </svg>
          Pay
        </button>
        <button
          type="button"
          onClick={handleGoogle}
          aria-label="Pay with Google Pay"
          className="h-14 rounded text-white flex items-center justify-center gap-2 text-[16px] font-medium hover:opacity-90 transition-opacity"
          style={{ background: "#000" }}
        >
          <svg width="44" height="20" viewBox="0 0 44 20" aria-hidden>
            <text x="0" y="16" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="16">
              <tspan fill="#4285F4">G</tspan>
              <tspan fill="#EA4335">o</tspan>
              <tspan fill="#FBBC04">o</tspan>
              <tspan fill="#4285F4">g</tspan>
              <tspan fill="#34A853">l</tspan>
              <tspan fill="#EA4335">e</tspan>
            </text>
          </svg>
          Pay
        </button>
      </div>
      <div className="flex items-center gap-3.5 mt-6">
        <span className="flex-1 h-px" style={{ background: "var(--hairline)" }} />
        <span className="font-[var(--mono)] text-[11px] text-[var(--ink-soft)] tracking-[0.1em]">
          OR PAY WITH CARD
        </span>
        <span className="flex-1 h-px" style={{ background: "var(--hairline)" }} />
      </div>
    </div>
  )
}

export default ExpressPay
