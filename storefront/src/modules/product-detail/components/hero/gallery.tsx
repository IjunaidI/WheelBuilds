"use client"

import Image from "next/image"
import Wheel from "@modules/common/components/wheel"
import Label from "@modules/common/components/label"
import { FinishOption } from "../../data/types"

type GalleryProps = {
  finishes: FinishOption[]
  activeFinishRaw: string
  onFinishChange: (raw: string) => void
}

const Gallery = ({ finishes, activeFinishRaw, onFinishChange }: GalleryProps) => {
  const active = finishes.find((f) => f.raw === activeFinishRaw) ?? finishes[0]
  const showSelector = finishes.length > 1

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative aspect-square rounded-[var(--radius)] flex items-center justify-center overflow-hidden border border-[var(--hairline)]"
        style={{ background: "var(--soft)" }}
      >
        <div className="wheel-glow" style={{ position: "absolute", inset: 40, zIndex: 0 }} />
        {active?.imageUrl ? (
          <Image
            src={active.imageUrl}
            alt={active.raw}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-8 z-10"
            priority
          />
        ) : (
          <Wheel size={460} finish={active?.normalized ?? "black"} style={{ position: "relative", zIndex: 1 }} />
        )}
        {active && (
          <div
            className="absolute bottom-4 right-4"
            style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-soft)", letterSpacing: "0.08em" }}
          >
            {active.raw.toUpperCase()}
          </div>
        )}
      </div>

      {showSelector && (
        <div>
          <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
            Finish · {finishes.length} available
          </Label>
          <div className="flex gap-2 flex-wrap">
            {finishes.map((f) => (
              <button
                key={f.raw}
                type="button"
                onClick={() => onFinishChange(f.raw)}
                aria-label={`Show ${f.raw} finish`}
                aria-pressed={f.raw === activeFinishRaw}
                title={f.raw}
                className={`w-24 h-24 shrink-0 rounded-[var(--radius)] border-2 flex items-center justify-center overflow-hidden transition-colors ${
                  f.raw === activeFinishRaw
                    ? "border-[var(--orange)]"
                    : "border-[var(--hairline)] hover:border-[var(--ink-soft)]"
                }`}
                style={{ background: "var(--soft)" }}
              >
                {f.imageUrl ? (
                  <Image src={f.imageUrl} alt={f.raw} width={88} height={88} className="object-contain p-1" />
                ) : (
                  <Wheel size={80} finish={f.normalized} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Gallery
