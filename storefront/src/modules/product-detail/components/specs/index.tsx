import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import SectionHeader from "@modules/common/components/section-header"
import { ProductDetail } from "../../data/types"
import { buildSpecRows } from "./spec-rows"

type SpecsProps = {
  product: ProductDetail
}

/**
 * Spec grid. 4-up on small+, 2-up on mobile. Cells draw their own right +
 * bottom hairlines via a CSS class (`spec-cell`) defined in wheel-builds.css
 * — see the @media override there for the column-count switch.
 */
const Specs = ({ product }: SpecsProps) => {
  const rows = buildSpecRows(product.specs)

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        eyebrow="ENGINEERING"
        title="Built to spec, tested in pairs."
        description={product.spotlight}
        marginBottom={32}
      />
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

export default Specs
