"use client"

import { FormEvent, useState } from "react"
import { toast } from "sonner"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"

const Newsletter = () => {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    // No backend wired yet — fake success after a tick.
    setTimeout(() => {
      setSubmitting(false)
      setEmail("")
      toast.success("Subscribed", {
        description: "You're on the list. Watch for the next drop.",
      })
    }, 300)
  }

  return (
    <section
      style={{
        background: "var(--soft)",
        padding: "96px 80px",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          alignItems: "center",
          gap: 64,
        }}
      >
        <div>
          <Label style={{ marginBottom: 14, display: "block" }}>
            NEWSLETTER · WEEKLY
          </Label>
          <Display size={56}>
            Get the
            <br />
            drops first.
          </Display>
          <div
            style={{
              fontSize: 14,
              color: "var(--graphite)",
              marginTop: 16,
              maxWidth: 380,
            }}
          >
            Restock alerts, new fitments, and the occasional unannounced sale.
            No spam, unsub anytime.
          </div>
        </div>
        <form
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column" }}
        >
          <div style={{ display: "flex", gap: 8, height: 56 }}>
            <input
              type="email"
              required
              placeholder="you@domain.com"
              aria-label="Email address"
              className="field input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              style={{ flex: 1, height: 56, fontSize: 15 }}
            />
            <Button
              type="submit"
              disabled={submitting}
              style={{ height: 56, padding: "0 28px" }}
            >
              {submitting ? "..." : "Subscribe"}
            </Button>
          </div>
          <Label
            tone="muted"
            style={{ marginTop: 12, display: "block", letterSpacing: "0.04em" }}
          >
            BY SUBSCRIBING YOU AGREE TO OUR PRIVACY POLICY.
          </Label>
        </form>
      </div>
    </section>
  )
}

export default Newsletter
