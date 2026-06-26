"use client"

import { FormEvent, useState } from "react"
import { toast } from "sonner"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import TextInput from "@modules/common/components/text-input"
import { Button } from "@/components/ui/button"
import { newsletterSubscribe } from "@modules/home/actions"

const Newsletter = () => {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    const res = await newsletterSubscribe(email)
    setSubmitting(false)
    if (res.ok) {
      setEmail("")
      toast.success("Subscribed", {
        description: "You're on the list. Watch for the next drop.",
      })
    } else {
      toast.error("Subscription failed", {
        description: res.error ?? "Try again in a moment.",
      })
    }
  }

  return (
    <section
      className="px-5 py-16 xsmall:px-8 small:px-20 small:py-24"
      style={{
        background: "var(--soft)",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div className="grid grid-cols-1 small:grid-cols-2 items-center gap-10 small:gap-16">
        <div>
          <Label style={{ marginBottom: 14, display: "block" }}>
            NEWSLETTER · WEEKLY
          </Label>
          <Display size={40} className="small:!text-[56px]">
            Get the
            <br />
            drops first.
          </Display>
          <div className="text-[14px] text-[var(--graphite)] mt-4 max-w-[380px]">
            Restock alerts, new fitments, and the occasional unannounced sale.
            No spam, unsub anytime.
          </div>
        </div>
        <form
          onSubmit={submit}
          className="flex flex-col"
        >
          <div className="flex flex-col xsmall:flex-row gap-2">
            <TextInput
              type="email"
              required
              placeholder="you@domain.com"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              inputSize="lg"
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={submitting}
              style={{ height: 56, padding: "0 28px" }}
              className="w-full xsmall:w-auto"
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
