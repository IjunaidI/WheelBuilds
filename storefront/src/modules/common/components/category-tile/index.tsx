import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel, { Finish } from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import Icon from "@modules/common/components/icon"

type CategoryTileProps = {
  label: string
  href: string
  /** Live product count for this style filter. Omitted = no count line. */
  count?: number
  finish?: Finish
}

/**
 * A style entry in the SHOP BY STYLE grid. Reuses the `.style-tile` design
 * class. href is country-scoped by LocalizedClientLink (pass WITHOUT countryCode).
 */
const CategoryTile = ({ label, href, count, finish = "black" }: CategoryTileProps) => (
  <LocalizedClientLink
    href={href}
    className="style-tile"
    style={{ textDecoration: "none", color: "inherit" }}
  >
    <div>
      <Display size={22} className="small:!text-[28px]">
        {label}
      </Display>
      {typeof count === "number" && (
        <Label tone="muted" style={{ marginTop: 8, display: "block" }}>
          {count} {count === 1 ? "wheel" : "wheels"}
        </Label>
      )}
      <span
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em]"
        style={{ marginTop: 32, display: "inline-flex", color: "var(--orange)" }}
      >
        Explore
        <Icon name="arrow-right" size={14} color="#FF6A00" strokeWidth={2} />
      </span>
    </div>
    <Wheel size={140} finish={finish} />
  </LocalizedClientLink>
)

export default CategoryTile
