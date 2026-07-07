"use client"

import { FormEvent, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → the fit navigation shows the top progress bar
import { toast } from "sonner"
import Icon from "@modules/common/components/icon"
import Spinner from "@modules/common/icons/spinner"
import Field from "@modules/common/components/field"
import Select from "@modules/common/components/select"
import { Button } from "@/components/ui/button"
import { useGarage } from "@lib/garage/use-garage"
import { fitmentDestinationUrl, FitmentTarget } from "./destination-url"
import { getFitmentContext } from "@lib/stores/fitment-context"
import {
  getMakes,
  getModels,
  getYears,
  getModifications,
} from "@lib/data/fitment"
import { resolveFitmentForVehicle } from "@lib/data/fitment-resolve"
import {
  MAKES,
  MODELS_BY_MAKE,
  TRIMS_BY_MODEL,
  YEARS,
} from "@lib/garage/vehicle-data"

type YmmPaneProps = {
  onClose: () => void
}

type Option = { value: string; label: string }

// Defensive coercion of a wheel-size cataloging payload into {value,label} pairs.
// The catalog endpoints proxy the wheel-size v2 body verbatim ({ data: [...] }),
// but the exact element shape is pinned by the Task-1 validation gate; until then
// we accept the documented `data[]` array (objects with slug/name, or bare strings)
// plus a few common variants, and let the seed cover anything we can't read.
const toOptions = (payload: any): Option[] => {
  const arr: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : []
  return arr
    .map((item): Option | null => {
      if (item == null) return null
      if (typeof item === "string" || typeof item === "number") {
        const s = String(item)
        return { value: s, label: s }
      }
      const value = item.slug ?? item.value ?? item.id ?? item.name
      const label = item.name ?? item.title ?? item.trim ?? item.label ?? value
      if (value == null) return null
      return { value: String(value), label: String(label) }
    })
    .filter((o): o is Option => o !== null)
}

// Fallback seeds derived from the static vehicle-data.ts lists (used when a fetch fails).
const makeSeed: Option[] = MAKES.map((m) => ({ value: m, label: m }))
const modelSeed = (make: string): Option[] =>
  (MODELS_BY_MAKE[make] ?? []).map((m) => ({ value: m, label: m }))
const yearSeed: Option[] = YEARS.map((y) => ({ value: String(y), label: String(y) }))
const trimSeed = (model: string): Option[] =>
  (TRIMS_BY_MODEL[model] ?? []).map((t) => ({ value: t, label: t }))

const YmmPane = ({ onClose }: YmmPaneProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const { add, setActive, update } = useGarage()

  const [make, setMake] = useState("")
  const [model, setModel] = useState("")
  const [year, setYear] = useState("")
  // modification value is the slug; we also stash its human label for the saved vehicle.
  const [modificationSlug, setModificationSlug] = useState("")

  const [makeOptions, setMakeOptions] = useState<Option[]>([])
  const [modelOptions, setModelOptions] = useState<Option[]>([])
  const [yearOptions, setYearOptions] = useState<Option[]>([])
  const [modificationOptions, setModificationOptions] = useState<Option[]>([])

  const [loadingMakes, setLoadingMakes] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [loadingYears, setLoadingYears] = useState(false)
  const [loadingMods, setLoadingMods] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  // Route by the surface the drawer was opened from: on a tire surface (/tires or
  // a tire PDP) a car pick fits tires, everywhere else it fits wheels. Captured at
  // mount; no visible control (page context drives it).
  const [target] = useState<FitmentTarget>(() => getFitmentContext())

  // Load makes on mount; fall back to the static seed if the catalog fetch fails.
  useEffect(() => {
    let cancelled = false
    setLoadingMakes(true)
    getMakes()
      .then((r) => {
        if (cancelled) return
        const opts = toOptions(r?.makes)
        setMakeOptions(opts.length ? opts : makeSeed)
      })
      .catch(() => {
        if (!cancelled) setMakeOptions(makeSeed)
      })
      .finally(() => {
        if (!cancelled) setLoadingMakes(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Make → models
  useEffect(() => {
    if (!make) {
      setModelOptions([])
      return
    }
    let cancelled = false
    setLoadingModels(true)
    getModels(make)
      .then((r) => {
        if (cancelled) return
        const opts = toOptions(r?.models)
        setModelOptions(opts.length ? opts : modelSeed(make))
      })
      .catch(() => {
        if (!cancelled) setModelOptions(modelSeed(make))
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false)
      })
    return () => {
      cancelled = true
    }
  }, [make])

  // Make + model → years
  useEffect(() => {
    if (!make || !model) {
      setYearOptions([])
      return
    }
    let cancelled = false
    setLoadingYears(true)
    getYears(make, model)
      .then((r) => {
        if (cancelled) return
        const opts = toOptions(r?.years)
        setYearOptions(opts.length ? opts : yearSeed)
      })
      .catch(() => {
        if (!cancelled) setYearOptions(yearSeed)
      })
      .finally(() => {
        if (!cancelled) setLoadingYears(false)
      })
    return () => {
      cancelled = true
    }
  }, [make, model])

  // Make + model + year → modifications (value = slug, label = trim name)
  useEffect(() => {
    if (!make || !model || !year) {
      setModificationOptions([])
      return
    }
    let cancelled = false
    setLoadingMods(true)
    getModifications(make, model, year)
      .then((r) => {
        if (cancelled) return
        const opts = toOptions(r?.modifications)
        setModificationOptions(opts.length ? opts : trimSeed(model))
      })
      .catch(() => {
        if (!cancelled) setModificationOptions(trimSeed(model))
      })
      .finally(() => {
        if (!cancelled) setLoadingMods(false)
      })
    return () => {
      cancelled = true
    }
  }, [make, model, year])

  const canSubmit = Boolean(year && make && model && !submitting)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const trimLabel =
        modificationOptions.find((o) => o.value === modificationSlug)?.label ?? ""
      const vehicle = add({
        year: Number(year),
        make,
        model,
        trim: trimLabel || undefined,
        modificationSlug,
      })
      setActive(vehicle.id)
      // fire the (human-initiated) fitment lookup, then write it back
      const result = await resolveFitmentForVehicle(make, model, modificationSlug, year, "usdm")

      let boltPatterns: string[] = []
      let oemTireSizes: string[] = []

      switch (result.kind) {
        case "ok": {
          const fitment = result.fitment
          update(vehicle.id, {
            canonicalBoltPatterns: fitment.canonicalBoltPatterns,
            hubBoreMm: fitment.hubBoreMm ?? undefined,
            diameterWindow: fitment.diameterWindow,
            widthWindow: fitment.widthWindow,
            offsetWindow: fitment.offsetWindow,
            oemTireSizes: fitment.oemTireSizes,
            oemTires: fitment.oemTires,
            fitmentStatus: fitment.status,
          })
          // "Did we find something to filter by?" is target-specific: tires filter
          // on OEM tire sizes, wheels on bolt patterns. Only toast (and only about
          // the RIGHT thing) when the relevant data is missing — otherwise the tire
          // flow would wrongly show a "no wheel specs" message.
          const hasFit =
            target === "tires"
              ? (fitment.oemTireSizes?.length ?? 0) > 0
              : fitment.status === "ok" && fitment.canonicalBoltPatterns.length > 0
          if (!hasFit) {
            toast(
              target === "tires"
                ? "No tire fitment for this vehicle yet"
                : "No fitment data for this vehicle yet",
              {
                description:
                  target === "tires"
                    ? "We couldn't find factory tire sizes for it — showing all tires."
                    : "We couldn't find wheel specs for it — showing the full catalog.",
              }
            )
          }
          boltPatterns = fitment.status === "ok" ? fitment.canonicalBoltPatterns : []
          oemTireSizes = fitment.oemTireSizes ?? []
          break
        }
        case "unavailable":
          toast.error("Fitment temporarily unavailable", {
            description: "Please contact support.",
          })
          break
        case "failed":
          // A non-503 failure (network blip, unexpected 4xx/5xx) —
          // resolveFitmentForVehicle already degrades a 503 to "unavailable" above;
          // anything else lands here (WB-073 G8). The vehicle is already fully
          // saved+active by `add`/`setActive` above — NOT rolled back, because it's
          // in the exact same "saved, fitment unresolved" shape as any pre-fitment
          // vehicle the garage pane already knows how to re-resolve on next select
          // (see garage-pane's `needsResolve`), so selecting it again is the natural
          // retry path. Keep the drawer open and tell the user rather than routing
          // to an unfiltered catalog or closing on a silent failure.
          toast.error("Couldn't check fitment right now — please try again.")
          return
      }
      onClose()
      router.push(fitmentDestinationUrl({ countryCode, target, boltPatterns, oemTireSizes }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Make">
          <Select
            value={make}
            onChange={(e) => {
              setMake(e.target.value)
              setModel("")
              setYear("")
              setModificationSlug("")
            }}
            required
            disabled={loadingMakes}
          >
            <option value="">
              {loadingMakes ? "Loading makes…" : "Select make"}
            </option>
            {makeOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Model">
          <Select
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              setYear("")
              setModificationSlug("")
            }}
            required
            disabled={!make || loadingModels}
          >
            <option value="">
              {!make
                ? "Select make first"
                : loadingModels
                ? "Loading models…"
                : "Select model"}
            </option>
            {modelOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year">
          <Select
            value={year}
            onChange={(e) => {
              setYear(e.target.value)
              setModificationSlug("")
            }}
            required
            disabled={!model || loadingYears}
          >
            <option value="">
              {!model
                ? "Select model first"
                : loadingYears
                ? "Loading years…"
                : "Select year"}
            </option>
            {yearOptions.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Trim">
          <Select
            value={modificationSlug}
            onChange={(e) => setModificationSlug(e.target.value)}
            disabled={!year || loadingMods}
          >
            <option value="">
              {!year
                ? "Select year first"
                : loadingMods
                ? "Loading trims…"
                : "Any trim"}
            </option>
            {modificationOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={!canSubmit} className="w-full mt-2">
        {submitting ? (
          <>
            <Spinner size="16" color="white" /> Checking fit…
          </>
        ) : (
          <>
            Find My Fit <Icon name="arrow-right" size={16} color="white" />
          </>
        )}
      </Button>
    </form>
  )
}

export default YmmPane
