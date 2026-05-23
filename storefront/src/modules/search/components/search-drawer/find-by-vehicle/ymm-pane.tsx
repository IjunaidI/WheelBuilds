"use client"

import { FormEvent, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Icon from "@modules/common/components/icon"
import { useGarage } from "@lib/garage/use-garage"
import {
  MAKES,
  MODELS_BY_MAKE,
  TRIMS_BY_MODEL,
  YEARS,
} from "@lib/garage/vehicle-data"

type YmmPaneProps = {
  onClose: () => void
}

const labelStyle: React.CSSProperties = {
  marginBottom: 6,
  fontSize: 10,
  fontFamily: "var(--mono)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-soft)",
}

const YmmPane = ({ onClose }: YmmPaneProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const { add, setActive } = useGarage()

  const [year, setYear] = useState("")
  const [make, setMake] = useState("")
  const [model, setModel] = useState("")
  const [trim, setTrim] = useState("")

  const modelOptions = useMemo(
    () => (make ? MODELS_BY_MAKE[make] ?? [] : []),
    [make]
  )
  const trimOptions = useMemo(
    () => (model ? TRIMS_BY_MODEL[model] ?? [] : []),
    [model]
  )

  const canSubmit = year && make && model

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const vehicle = add({
      year: Number(year),
      make,
      model,
      trim: trim || undefined,
    })
    setActive(vehicle.id)
    onClose()
    router.push(`/${countryCode}/store`)
  }

  return (
    <form onSubmit={submit}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div>
          <div style={labelStyle}>Year</div>
          <select
            className="field"
            style={{ width: "100%" }}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
          >
            <option value="">Select year</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Make</div>
          <select
            className="field"
            style={{ width: "100%" }}
            value={make}
            onChange={(e) => {
              setMake(e.target.value)
              setModel("")
              setTrim("")
            }}
            required
          >
            <option value="">Select make</option>
            {MAKES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Model</div>
          <select
            className="field"
            style={{ width: "100%" }}
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              setTrim("")
            }}
            required
            disabled={!make}
          >
            <option value="">{make ? "Select model" : "Select make first"}</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Trim</div>
          <select
            className="field"
            style={{ width: "100%" }}
            value={trim}
            onChange={(e) => setTrim(e.target.value)}
            disabled={!model}
          >
            <option value="">{model ? "Any trim" : "Select model first"}</option>
            {trimOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="submit"
        className="btn btn-primary"
        style={{
          width: "100%",
          marginTop: 8,
          opacity: canSubmit ? 1 : 0.5,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
        disabled={!canSubmit}
      >
        Find My Fit <Icon name="arrow-right" size={16} color="white" />
      </button>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-soft)",
          marginTop: 10,
          textAlign: "center",
          fontFamily: "var(--mono)",
          letterSpacing: "0.06em",
        }}
      >
        OR{" "}
        <span
          aria-disabled
          title="License-plate lookup coming soon"
          style={{
            color: "var(--orange)",
            fontWeight: 600,
            opacity: 0.6,
            cursor: "not-allowed",
          }}
        >
          SEARCH BY LICENSE PLATE â†’
        </span>
      </div>
    </form>
  )
}

export default YmmPane
