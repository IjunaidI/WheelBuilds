import * as React from "react"
import { cn } from "@/lib/utils"

type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Height preset. `default` is 44px (matches `.field`); `lg` is 56px (newsletter / hero). */
  inputSize?: "default" | "lg"
}

/**
 * WB-styled text input. Hairline border, ink-on-focus, 44px or 56px tall.
 * Distinct from the legacy `<Input>` in `modules/common/components/input/`
 * which is a Medusa-checkout compound with a floating label.
 *
 * Pair with `<Field>` for label + helper text:
 *   <Field label="Email">
 *     <TextInput type="email" placeholder="you@domain.com" />
 *   </Field>
 *
 * Use standalone for inline cases (search box, inline filters).
 */
const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ className, inputSize = "default", type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full bg-white border border-[var(--hairline)] rounded-[var(--radius)] px-3.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-soft)] transition-colors",
        "focus:outline-none focus:border-[var(--ink)] focus:ring-0",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        inputSize === "default" ? "h-11" : "h-14 text-[15px]",
        className
      )}
      {...props}
    />
  )
)
TextInput.displayName = "TextInput"

export default TextInput
