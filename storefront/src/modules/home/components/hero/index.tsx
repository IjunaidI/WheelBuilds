"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Wheel from "@modules/common/components/wheel"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import VehicleTile from "@modules/common/components/vehicle-tile"
import { Button } from "@/components/ui/button"
import { openSearch } from "@lib/stores/search-store"
import { useGarage } from "@lib/garage/use-garage"

const TRUST_POINTS = [
  { l: "Fitment guaranteed", s: "Or your money back" },
  { l: "Free returns", s: "30 days, unmounted" },
  { l: "Free ship $199+", s: "2–3 day delivery" },
  { l: "Authorized dealer", s: "42 brands" },
]

const Hero = () => {
  const { active, vehicles } = useGarage()

  const garageCountLabel =
    vehicles.length === 0
      ? "BUILD YOUR GARAGE"
      : vehicles.length === 1
        ? "USE MY GARAGE (1 SAVED)"
        : `USE MY GARAGE (${vehicles.length} SAVED)`

  const primaryCtaText = active
    ? `Find My Fit · See wheels for your ${active.make}`
    : "Find My Fit · Start with your vehicle"

  return (
    <section
      style={{
        padding: "80px 80px 96px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Watermark wheel — sits behind, on the right */}
      <div
        style={{
          position: "absolute",
          right: -120,
          top: 60,
          opacity: 0.55,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div
          className="wheel-glow"
          style={{ position: "absolute", inset: -80, zIndex: 0 }}
        />
        <Wheel
          size={620}
          finish="black"
          style={{ position: "relative", zIndex: 1 }}
        />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1280 }}>
        <Label bar style={{ marginBottom: 28 }}>
          FITMENT FIRST · STEP 01 OF 02
        </Label>
        <Display size={132} as="h1">
          What do
          <br />
          you drive?
        </Display>
        <p
          style={{
            fontSize: 18,
            color: "var(--graphite)",
            maxWidth: 580,
            margin: "28px 0 40px",
            lineHeight: 1.5,
          }}
        >
          Tell us once. We&apos;ll show you only the wheels confirmed to fit,
          ship them in 2–3 days, and back every fitment with our money-back
          guarantee.
        </p>

        {/* Mega vehicle selector — 4 huge tiles. All open the search drawer. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <VehicleTile
            idx="1"
            label="Year"
            value={active ? String(active.year) : undefined}
            onClick={openSearch}
          />
          <VehicleTile
            idx="2"
            label="Make"
            value={active?.make}
            onClick={openSearch}
          />
          <VehicleTile
            idx="3"
            label="Model"
            value={active?.model}
            onClick={openSearch}
          />
          <VehicleTile
            idx="4"
            label="Trim"
            value={active?.trim}
            onClick={openSearch}
          />
        </div>

        {/* CTA row */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {active ? (
            <Button asChild size="lg">
              <LocalizedClientLink href="/store">
                {primaryCtaText}
                <Icon name="arrow-right" size={18} color="white" />
              </LocalizedClientLink>
            </Button>
          ) : (
            <Button size="lg" onClick={openSearch}>
              {primaryCtaText}
              <Icon name="arrow-right" size={18} color="white" />
            </Button>
          )}
          <Button asChild variant="link" size="sm">
            <LocalizedClientLink href="/store">
              Or browse all wheels →
            </LocalizedClientLink>
          </Button>
          <span style={{ flex: 1 }} />
          <Button
            variant="outline"
            size="sm"
            onClick={openSearch}
            className="font-[var(--mono)] tracking-[0.06em]"
          >
            <Icon name="garage" size={14} strokeWidth={1.6} />
            {garageCountLabel}
          </Button>
        </div>

        {/* Trust line */}
        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid var(--hairline)",
            display: "flex",
            gap: 40,
            alignItems: "center",
            flexWrap: "wrap",
            maxWidth: 880,
          }}
        >
          {TRUST_POINTS.map((t) => (
            <div
              key={t.l}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <Icon name="check" size={16} color="#FF6A00" strokeWidth={2.5} />
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {t.l}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-soft)",
                    marginTop: 1,
                  }}
                >
                  {t.s}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Hero
