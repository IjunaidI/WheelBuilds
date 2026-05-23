import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import SectionHeader from "@modules/common/components/section-header"
import { ProductDetail } from "../../data/types"

type SpecsProps = {
  product: ProductDetail
}

/**
 * Spec grid. Two-row 4-up table of engineering numbers + optional spotlight
 * paragraph on the right.
 */
const Specs = ({ product }: SpecsProps) => {
  const rows: { label: string; value: string }[] = [
    { label: "Construction", value: product.specs.construction },
    { label: "Per-wheel weight", value: `${product.specs.weightLb} lb` },
    { label: "Load rating", value: `${product.specs.loadRatingLb.toLocaleString()} lb` },
    { label: "Center bore", value: `${product.specs.centerBoreMm} mm` },
    ...(product.specs.hubBoreMm
      ? [{ label: "Hub bore", value: `${product.specs.hubBoreMm} mm` }]
      : []),
    { label: "Country of origin", value: product.specs.countryOfOrigin },
    { label: "Warranty", value: product.specs.warranty },
    { label: "Finish options", value: `${product.specs.finishOptions}` },
  ]

  return (
    <section className="border-t border-[var(--hairline)]" style={{ padding: "80px 0" }}>
      <SectionHeader
        eyebrow="ENGINEERING"
        title="Built to spec, tested in pairs."
        description={product.spotlight}
        marginBottom={32}
      />
      <div
        className="grid border-y border-[var(--hairline)]"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
      >
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="border-r border-[var(--hairline)] last:border-r-0"
            style={{
              padding: "24px 28px",
              // Add a bottom border to the first row to separate from the second
              borderBottom:
                i < rows.length - 4 ? "1px solid var(--hairline)" : "none",
            }}
          >
            <Label tone="muted" style={{ fontSize: 10, display: "block" }}>
              {row.label}
            </Label>
            <Display size={22} as="div" style={{ marginTop: 6 }}>
              {row.value}
            </Display>
          </div>
        ))}
      </div>
    </section>
  )
}

export default Specs
