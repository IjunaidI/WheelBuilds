"use client"

import { FormEvent, useEffect, useState } from "react"
import { useParams, usePathname } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → the fit navigation shows the top progress bar
import { toast } from "sonner"
import Icon from "@modules/common/components/icon"
import Spinner from "@modules/common/icons/spinner"
import Field from "@modules/common/components/field"
import Select from "@modules/common/components/select"
import { Button } from "@/components/ui/button"
import { useGarage } from "@lib/garage/use-garage"
import { fitmentDestinationUrl, FitmentTarget } from "./destination-url"
import { toOptions, Option } from "./to-options"
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
  slugifyYmm,
} from "@lib/garage/vehicle-data"

type YmmPaneProps = {
  onClose: () => void
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
  const pathname = usePathname()
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

  // Which fields are currently backed by the static seed (vs the live
  // wheel-size catalog) — the seed's option VALUE is a display name
  // ("Silverado 1500"), not a slug, so a value sourced from it must be
  // slugified before it's sent to resolveFitmentForVehicle (N4). A
  // live-catalog value is already a real slug and must not be re-slugified.
  const [makeIsSeed, setMakeIsSeed] = useState(false)
  const [modelIsSeed, setModelIsSeed] = useState(false)

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
        if (opts.length) {
          setMakeOptions(opts)
          setMakeIsSeed(false)
        } else {
          setMakeOptions(makeSeed)
          setMakeIsSeed(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMakeOptions(makeSeed)
          setMakeIsSeed(true)
        }
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
        if (opts.length) {
          setModelOptions(opts)
          setModelIsSeed(false)
        } else {
          setModelOptions(modelSeed(make))
          setModelIsSeed(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModelOptions(modelSeed(make))
          setModelIsSeed(true)
        }
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
      // fire the (human-initiated) fitment lookup, then write it back.
      // Slugify make/model ONLY when that field is currently backed by the
      // static seed — its option value is a display name ("Silverado 1500"),
      // and sending a display name to wheel-size silently resolves to
      // nothing (N4). A live-catalog value is already a real slug.
      const fitMake = makeIsSeed ? slugifyYmm(make) : make
      const fitModel = modelIsSeed ? slugifyYmm(model) : model
      const result = await resolveFitmentForVehicle(fitMake, fitModel, modificationSlug, year, "usdm")

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
        case "failed":
          // Both a degraded 503/quota response ("unavailable") and a non-503
          // failure (network blip, unexpected 4xx/5xx — "failed", WB-073 G8)
          // land here. The vehicle is already fully saved+active by
          // `add`/`setActive` above — NOT rolled back, because it's in the
          // exact same "saved, fitment unresolved" shape any window-less
          // vehicle can be in. `return` (not `break`) is load-bearing: it
          // skips the onClose()+router.push below, so a 503 can no longer
          // fall through to the UNFILTERED catalog looking like a filtered
          // one (N5/N7). Keep the drawer open with an honest message — no
          // "contact support" — and the "Re-check fit" button on the
          // current-vehicle row (find-by-vehicle/index.tsx) is the real
          // retry path now that garage-pane is orphaned.
          toast.error("Fitment temporarily unavailable — please try again.")
          return
      }
      onClose()
      const dest = fitmentDestinationUrl({ countryCode, target, boltPatterns, oemTireSizes })
      // If we're ALREADY on the destination discovery page, FitmentSync owns the
      // ?fit params and updates them from the now-active vehicle. Pushing the same
      // route here races FitmentSync's router.replace (which writes the FULL
      // windowed fit URL), and the two concurrent conflicting navigations deadlock
      // the App Router — the progress bar starts but never commits and the URL
      // never changes. Only navigate for a genuine cross-page jump (home->store,
      // store->tires); a same-page car switch is handled entirely by FitmentSync.
      if (dest.split("?")[0] !== pathname) router.push(dest)
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
