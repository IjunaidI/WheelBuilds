import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import SectionHeader from "@modules/common/components/section-header"
import { TireProductDetail } from "../../data/types"
import { buildTireSpecRows } from "../../data/tire/tire-spec-rows"

type TireSpecsProps = {
  product: TireProductDetail
}

/**
 * Model-level tire spec grid. Mirrors the wheel <Specs> grid shell
 * (components/specs/index.tsx) using the tire spec-row builder. There is no
 * `spotlight` field on TireProductDetail, so the description slot is
 * omitted. Returns null when there are no rows to show (same honesty rule as
 * the wheel spec builder — no fabricated placeholder rows).
 */
const TireSpecs = ({ product }: TireSpecsProps) => {
  const rows = buildTireSpecRows(product.specs)

  if (rows.length === 0) return null

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader eyebrow="SPECIFICATIONS" title="Tire specifications" marginBottom={32} />
      {/* spec-grid handles the responsive column count + cell borders. */}
      <div className="spec-grid border-y border-[var(--hairline)]">
        {rows.map((row) => (
          <div key={row.label} className="spec-cell px-5 py-5 small:px-7 small:py-6">
            <Label tone="muted" style={{ fontSize: 10, display: "block" }}>
              {row.label}
            </Label>
            <Display
              size={20}
              as="div"
              className="small:!text-[22px]"
              style={{ marginTop: 6 }}
            >
              {row.value}
            </Display>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TireSpecs
