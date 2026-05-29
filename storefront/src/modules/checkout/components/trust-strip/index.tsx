import Icon from "@modules/common/components/icon"

const POINTS: { i: "shipping" | "shield" | "return"; h: string; s: string }[] = [
  {
    i: "shipping",
    h: "Free 2–3 day shipping",
    s: "From our Long Beach warehouse",
  },
  {
    i: "shield",
    h: "Fitment guaranteed",
    s: "Or full refund + return shipping covered",
  },
  {
    i: "return",
    h: "30-day returns",
    s: "Unmounted wheels, no restocking fee",
  },
]

const TrustStrip = () => (
  <div
    className="rounded-lg bg-white px-4 py-4 flex flex-col gap-3"
    style={{ border: "1px solid var(--hairline)" }}
  >
    {POINTS.map((b) => (
      <div key={b.h} className="flex gap-3 items-start">
        <Icon name={b.i} size={18} strokeWidth={1.5} />
        <div>
          <div className="text-[13px] font-semibold text-[var(--ink)]">
            {b.h}
          </div>
          <div className="text-[11px] text-[var(--graphite)] mt-px">
            {b.s}
          </div>
        </div>
      </div>
    ))}
  </div>
)

export default TrustStrip
