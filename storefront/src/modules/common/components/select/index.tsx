import * as React from "react"
import { cn } from "@/lib/utils"

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

/**
 * WB-styled native `<select>`. Native is used deliberately so mobile gets the
 * platform-native picker (much better UX than a custom dropdown for long lists
 * like YMM years and makes). Hairline border, custom chevron on the right,
 * matches `<TextInput>` chrome.
 *
 * Pair with `<Field>` for the standard label-above-select pattern:
 *   <Field label="Year">
 *     <Select value={year} onChange={(e) => setYear(e.target.value)}>
 *       <option value="">Select year</option>
 *       {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
 *     </Select>
 *   </Field>
 *
 * The chevron is drawn via background-image (inline SVG data URL) so no
 * extra DOM is needed. Color matches `--ink-soft`.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full h-11 bg-white border border-[var(--hairline)] rounded-[var(--radius)] pl-3.5 pr-9 text-[14px] text-[var(--ink)] cursor-pointer transition-colors",
        "appearance-none bg-no-repeat",
        "focus:outline-none focus:border-[var(--ink)] focus:ring-0",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238A8A8E' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundPosition: "right 12px center",
      }}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = "Select"

export default Select
