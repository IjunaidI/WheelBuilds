import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import MicroLink from "@modules/common/components/micro-link"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import TireProductCard from "@modules/tire-discovery/components/grid/tire-product-card"
import { getHomeTires } from "@modules/home/data/get-home-tires"
import { getHomeTireBrands } from "@modules/home/data/get-home-tire-brands"

/**
 * The home page's tire showcase — one bold dark band so tires get a strong,
 * unmissable moment while wheels stay the dominant theme elsewhere. Server
 * component; degrades to null when no tires are indexed (throw-safe data).
 * The white `.product-card` tiles pop against the dark `--ink` background.
 */
const TiresBand = async () => {
  const [tires, brands] = await Promise.all([getHomeTires(6), getHomeTireBrands(8)])
  if (tires.length === 0) return null

  return (
    <section
      className="px-5 py-16 xsmall:px-8 small:px-20 small:py-[120px]"
      style={{ background: "var(--ink)", color: "white" }}
    >
      <div className="flex flex-col gap-5 small:flex-row small:items-end small:justify-between mb-8 small:mb-12">
        <div>
          <Label tone="accent" bar className="mb-4">
            NOW STOCKING
          </Label>
          <Display size={40} as="h2" tone="inherit" className="small:!text-[64px]">
            Tires, built to match
          </Display>
          <p
            className="text-[15px] small:text-[17px] max-w-[520px] mt-4 leading-[1.5]"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Premium tires for every fitment — pick your vehicle and we filter to the
            sizes that actually fit.
          </p>
        </div>
        <MicroLink href="/tires">Shop all tires</MicroLink>
      </div>

      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
        {tires.map((t) => (
          <TireProductCard key={t.id} product={t} />
        ))}
      </div>

      {brands.length > 0 && (
        <div
          className="mt-10 small:mt-14 pt-8 border-t"
          style={{ borderColor: "rgba(255,255,255,0.14)" }}
        >
          <span
            className="block mb-4 font-[var(--mono)] uppercase text-[11px] tracking-[0.12em]"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Shop tires by brand
          </span>
          <div className="flex flex-wrap gap-2.5">
            {brands.map((b) => (
              <LocalizedClientLink
                key={b.name}
                href={`/tires?brands=${encodeURIComponent(b.name)}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full no-underline hover:border-[var(--orange)]"
                style={{ border: "1px solid rgba(255,255,255,0.22)", color: "white", transition: "border-color 0.15s" }}
              >
                <span className="font-[var(--display)] font-black text-[15px] tracking-[0.02em]">
                  {b.name}
                </span>
                <span
                  className="text-[11px] font-[var(--mono)]"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  {b.count}
                </span>
              </LocalizedClientLink>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default TiresBand
