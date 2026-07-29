/**
 * The number of selectable values in a filter section, shown on its accordion
 * trigger (WB-120 Q-10 / Q-11).
 *
 * Radix unmounts collapsed accordion content, so a closed section renders as a
 * bare heading with nothing under it. An external QA pass read exactly that as
 * a bug — "'Bolt pattern' filter header renders with no options" — for four
 * sections across the two rails whose data was complete all along (46 bolt
 * patterns, 500 tyre sizes, 16 speed ratings, 80 load indexes were all in the
 * page payload).
 *
 * Opening those sections by default fixes the two most important ones, but
 * this is the fix that generalises: with a value count on the trigger, a
 * collapsed section can never again be mistaken for an empty one — including
 * the sections we deliberately leave closed to keep the rail short.
 *
 * Renders nothing at zero, because "0" next to a heading is a claim about the
 * catalog, and an empty facet is more likely a failed query than a true zero.
 */
const FacetCount = ({ count }: { count: number }) => {
  if (!count) return null
  return (
    <span
      aria-hidden="true"
      className="ml-2 font-[var(--mono)] text-[11px] font-normal text-[var(--ink-soft)]"
    >
      {count}
    </span>
  )
}

export default FacetCount
