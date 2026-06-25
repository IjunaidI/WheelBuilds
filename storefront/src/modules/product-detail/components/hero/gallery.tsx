"use client"

import Image from "next/image"
import Wheel from "@modules/common/components/wheel"
import Label from "@modules/common/components/label"
import { Finish } from "@modules/common/components/wheel"
import { FINISH_LABELS } from "../../data/types"

type GalleryProps = {
  finishes: Finish[]
  activeFinish: Finish
  onFinishChange: (f: Finish) => void
  /** Cover image URL (vendor CDN). Falls back to the Wheel render when null. */
  thumbnail?: string | null
}

/**
 * Big wheel render + finish-switcher thumbs. When real photography lands,
 * swap the Wheel components for `next/image` and add multi-angle thumbs.
 */
const Gallery = ({ finishes, activeFinish, onFinishChange, thumbnail }: GalleryProps) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Main canvas — wheel sits in a soft square with the glow behind */}
      <div
        className="relative aspect-square rounded-[var(--radius)] flex items-center justify-center overflow-hidden border border-[var(--hairline)]"
        style={{ background: "var(--soft)" }}
      >
        <div
          className="wheel-glow"
          style={{ position: "absolute", inset: 40, zIndex: 0 }}
        />
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={FINISH_LABELS[activeFinish]}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-8 z-10"
            priority
          />
        ) : (
          <Wheel
            size={460}
            finish={activeFinish}
            style={{ position: "relative", zIndex: 1 }}
          />
        )}
        <div
          className="absolute bottom-4 right-4"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--ink-soft)",
            letterSpacing: "0.08em",
          }}
        >
          {FINISH_LABELS[activeFinish].toUpperCase()}
        </div>
      </div>

      {/* Finish-switcher thumb row */}
      <div>
        <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
          Finish · {finishes.length} available
        </Label>
        <div className="flex gap-2">
          {finishes.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFinishChange(f)}
              aria-label={`Show ${FINISH_LABELS[f]} finish`}
              aria-pressed={f === activeFinish}
              className={`w-24 h-24 shrink-0 rounded-[var(--radius)] border-2 flex items-center justify-center transition-colors ${
                f === activeFinish
                  ? "border-[var(--orange)]"
                  : "border-[var(--hairline)] hover:border-[var(--ink-soft)]"
              }`}
              style={{ background: "var(--soft)" }}
            >
              <Wheel size={80} finish={f} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Gallery
