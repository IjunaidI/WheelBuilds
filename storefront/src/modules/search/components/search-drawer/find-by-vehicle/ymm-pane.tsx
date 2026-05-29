"use client"

import { FormEvent, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import Field from "@modules/common/components/field"
import Select from "@modules/common/components/select"
import { Button } from "@/components/ui/button"
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
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ")
    toast.success("Vehicle saved", {
      description: `${label} is now your active vehicle.`,
    })
    onClose()
    router.push(`/${countryCode}/store`)
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Year">
          <Select
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
          </Select>
        </Field>
        <Field label="Make">
          <Select
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
          </Select>
        </Field>
        <Field label="Model">
          <Select
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              setTrim("")
            }}
            required
            disabled={!make}
          >
            <option value="">
              {make ? "Select model" : "Select make first"}
            </option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Trim">
          <Select
            value={trim}
            onChange={(e) => setTrim(e.target.value)}
            disabled={!model}
          >
            <option value="">
              {model ? "Any trim" : "Select model first"}
            </option>
            {trimOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={!canSubmit} className="w-full mt-2">
        Find My Fit <Icon name="arrow-right" size={16} color="white" />
      </Button>
      <Label
        tone="muted"
        style={{
          marginTop: 10,
          display: "block",
          textAlign: "center",
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
          SEARCH BY LICENSE PLATE →
        </span>
      </Label>
    </form>
  )
}

export default YmmPane
