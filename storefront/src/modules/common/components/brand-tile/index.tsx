import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Label from "@modules/common/components/label"

type BrandTileProps = {
  name: string
  href: string
  /** Product count shown under the name. Omitted = no count line. */
  count?: number
}

/**
 * A brand entry in the TRUSTED BRANDS grid. Reuses the `.brand-chip` design
 * class. href is country-scoped by LocalizedClientLink (pass WITHOUT countryCode).
 */
const BrandTile = ({ name, href, count }: BrandTileProps) => (
  <LocalizedClientLink
    href={href}
    className="brand-chip"
    style={{ textDecoration: "none" }}
  >
    <span
      style={{
        fontFamily: "var(--display)",
        fontWeight: 900,
        fontSize: 22,
        color: "var(--ink)",
        letterSpacing: "0.04em",
      }}
    >
      {name}
    </span>
    {typeof count === "number" && (
      <Label tone="muted" style={{ marginTop: 4, display: "block" }}>
        {count} {count === 1 ? "wheel" : "wheels"}
      </Label>
    )}
  </LocalizedClientLink>
)

export default BrandTile
