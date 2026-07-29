"use client"

import { useState } from "react"

import Field from "@modules/common/components/field"
import Label from "@modules/common/components/label"
import TextInput from "@modules/common/components/text-input"
import { Button } from "@/components/ui/button"

import { submitSupportRequest } from "../../actions"

type ContactFormProps = {
  /** Prefilled by the PDP fitment CTAs (WB-119 Q-20). */
  defaultSubject?: string
  defaultMessage?: string
  vehicle?: string
  productHandle?: string
  /** "contact" | "fitment-check" — recorded so leads are distinguishable. */
  source?: string
  countryCode?: string
}

type Status = "idle" | "sending" | "sent"

/**
 * WB-119 Q-04 / Q-20.
 *
 * Submissions are persisted server-side BEFORE any notification is attempted,
 * so this form works even though transactional email cannot currently be sent
 * at all (no sending domain). That is why the success copy promises a reply
 * but deliberately states no timeframe — nobody has confirmed one, and the
 * inbox may not be monitored yet (client-input item 5).
 */
const ContactForm = ({
  defaultSubject,
  defaultMessage,
  vehicle,
  productHandle,
  source,
  countryCode,
}: ContactFormProps) => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [subject, setSubject] = useState(defaultSubject ?? "")
  const [message, setMessage] = useState(defaultMessage ?? "")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setStatus("sending")

    const res = await submitSupportRequest({
      name,
      email,
      message,
      phone: phone || null,
      subject: subject || null,
      source: source ?? "contact",
      vehicle: vehicle ?? null,
      product_handle: productHandle ?? null,
      country_code: countryCode ?? null,
    })

    if (res.ok) {
      setStatus("sent")
      return
    }

    setStatus("idle")
    setError(res.error ?? "Couldn't send that — please try again")
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white p-6"
      >
        <Label tone="accent" style={{ marginBottom: 8, display: "block" }}>
          MESSAGE RECEIVED
        </Label>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--graphite)", margin: 0 }}>
          Thanks — we&apos;ve got your message and we&apos;ll reply by email.
        </p>
      </div>
    )
  }

  const sending = status === "sending"

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 small:grid-cols-2 gap-4">
        <Field label="Your name" htmlFor="support-name">
          <TextInput
            id="support-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Email" htmlFor="support-email">
          <TextInput
            id="support-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Phone (optional)" htmlFor="support-phone">
          <TextInput
            id="support-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Subject (optional)" htmlFor="support-subject">
          <TextInput
            id="support-subject"
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>
      </div>

      {vehicle && (
        <p
          className="font-[var(--mono)]"
          style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }}
        >
          VEHICLE: {vehicle}
        </p>
      )}

      <Field label="How can we help?" htmlFor="support-message">
        <textarea
          id="support-message"
          name="message"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          className="w-full rounded-[var(--radius)] border border-[var(--hairline)] bg-white px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)] focus-visible:ring-offset-1"
        />
      </Field>

      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--orange-deep)", margin: 0 }}>
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  )
}

export default ContactForm
