"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Wheel from "@modules/common/components/wheel"
import { openSearch } from "@lib/stores/search-store"
import { useGarage } from "@lib/garage/use-garage"

type VehicleTileProps = {
  idx: string
  label: string
  value: string | undefined
  onClick: () => void
}

const VehicleTile = ({ idx, label, value, onClick }: VehicleTileProps) => {
  const hasValue = Boolean(value)
  return (
    <button
      type="button"
      onClick={onClick}
      className={"vehicle-tile" + (hasValue ? "" : " inactive")}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            color: "var(--muted)",
          }}
        >
          STEP 0{idx} · {label.toUpperCase()}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          color={hasValue ? "#FF6A00" : "#8A8A8E"}
        />
      </div>
      <div>
        <div
          style={{
            fontFamily: "var(--display)",
            fontWeight: 900,
            fontSize: hasValue ? 36 : 22,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            color: hasValue ? "var(--ink)" : "var(--muted)",
            lineHeight: 1,
          }}
        >
          {value ?? `Pick ${label.toLowerCase()}`}
        </div>
        {hasValue && (
          <div
            style={{
              height: 2,
              width: 28,
              background: "var(--orange)",
              marginTop: 10,
            }}
          />
        )}
      </div>
    </button>
  )
}

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
        <Wheel size={620} finish="black" style={{ position: "relative", zIndex: 1 }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1280 }}>
        <div
          className="label"
          style={{
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{ width: 32, height: 1, background: "var(--orange)" }}
          />
          FITMENT FIRST · STEP 01 OF 02
        </div>
        <h1
          className="display"
          style={{
            fontSize: 132,
            margin: 0,
            color: "var(--ink)",
            letterSpacing: "-0.025em",
            lineHeight: 0.9,
          }}
        >
          What do
          <br />
          you drive?
        </h1>
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
            <LocalizedClientLink
              href="/store"
              className="btn btn-primary"
              style={{ height: 64, padding: "0 32px", fontSize: 15 }}
            >
              {primaryCtaText}
              <Icon name="arrow-right" size={18} color="white" />
            </LocalizedClientLink>
          ) : (
            <button
              type="button"
              onClick={openSearch}
              className="btn btn-primary"
              style={{ height: 64, padding: "0 32px", fontSize: 15 }}
            >
              {primaryCtaText}
              <Icon name="arrow-right" size={18} color="white" />
            </button>
          )}
          <LocalizedClientLink
            href="/store"
            style={{
              fontSize: 14,
              color: "var(--ink)",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: 4,
              padding: "0 8px",
            }}
          >
            Or browse all wheels →
          </LocalizedClientLink>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={openSearch}
            style={{
              background: "white",
              border: "1px solid var(--hairline)",
              borderRadius: 4,
              height: 44,
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--graphite)",
              cursor: "pointer",
              fontFamily: "var(--mono)",
              letterSpacing: "0.06em",
            }}
          >
            <Icon name="garage" size={14} strokeWidth={1.6} />
            {garageCountLabel}
          </button>
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
          {TRUST_POINTS.map((t, i) => (
            <div
              key={i}
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
                    color: "var(--muted)",
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
