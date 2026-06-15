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

const Hero = ({ brandCount }: { brandCount?: number }) => {
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

  const TRUST_POINTS = [
    { l: "Fitment guaranteed", s: "Or your money back" },
    { l: "Free returns", s: "30 days, unmounted" },
    { l: "Free ship $199+", s: "2–3 day delivery" },
    { l: "Authorized dealer", s: brandCount ? `${brandCount} brands` : "Premium brands" },
  ]

  return (
    <section className="relative overflow-hidden px-5 pt-12 pb-16 xsmall:px-8 small:px-20 small:pt-20 small:pb-24">
      {/* Watermark wheel — only on small+ (would crowd the mobile layout) */}
      <div
        aria-hidden
        className="hidden small:block pointer-events-none"
        style={{
          position: "absolute",
          right: -120,
          top: 60,
          opacity: 0.55,
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

      <div className="relative z-10 max-w-[1280px]">
        <Label bar className="mb-5 small:mb-7">
          FITMENT FIRST · STEP 01 OF 02
        </Label>
        <Display
          size={64}
          as="h1"
          className="small:!text-[132px]"
        >
          What do
          <br />
          you drive?
        </Display>
        <p className="text-[16px] small:text-[18px] text-[var(--graphite)] max-w-[580px] mt-5 mb-8 small:mt-7 small:mb-10 leading-[1.5]">
          Tell us once. We&apos;ll show you only the wheels confirmed to fit,
          ship them in 2–3 days, and back every fitment with our money-back
          guarantee.
        </p>

        {/* Mega vehicle selector — 2×2 on mobile, 4-in-a-row on small+ */}
        <div className="grid grid-cols-2 small:grid-cols-4 gap-2 mb-5">
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
        <div className="flex gap-3 small:gap-3.5 items-stretch small:items-center flex-wrap">
          {active ? (
            <Button asChild size="lg" className="w-full small:w-auto">
              <LocalizedClientLink href="/store">
                {primaryCtaText}
                <Icon name="arrow-right" size={18} color="white" />
              </LocalizedClientLink>
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={openSearch}
              className="w-full small:w-auto"
            >
              {primaryCtaText}
              <Icon name="arrow-right" size={18} color="white" />
            </Button>
          )}
          <Button asChild variant="link" size="sm">
            <LocalizedClientLink href="/store">
              Or browse all wheels →
            </LocalizedClientLink>
          </Button>
          <span className="hidden small:block flex-1" />
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
        <div className="grid grid-cols-2 small:flex small:flex-wrap gap-x-6 gap-y-4 small:gap-x-10 mt-10 pt-6 border-t border-[var(--hairline)] max-w-[880px]">
          {TRUST_POINTS.map((t) => (
            <div key={t.l} className="flex items-center gap-2.5">
              <Icon name="check" size={16} color="#FF6A00" strokeWidth={2.5} />
              <div>
                <div className="text-[13px] font-semibold text-[var(--ink)]">
                  {t.l}
                </div>
                <div className="text-[11px] text-[var(--ink-soft)] mt-px">
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
