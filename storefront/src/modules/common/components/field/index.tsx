import Label from "@modules/common/components/label"
import { cn } from "@/lib/utils"

type FieldProps = {
  /** Field label rendered above the control. Pass a node for full control or a string to auto-wrap in `<Label tone="muted">`. */
  label: React.ReactNode
  /** Optional `htmlFor` linking the label to its control's id. Recommended whenever the child is a single input. */
  htmlFor?: string
  /** Optional helper text rendered under the control in muted ink. */
  helperText?: React.ReactNode
  /** Optional error text rendered under the control in destructive red. Takes precedence over `helperText`. */
  error?: React.ReactNode
  /** Visually hide the label. Still accessible to screen readers. */
  labelHidden?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Form-field wrapper: label-above-control with optional helper/error text.
 * Pairs with `<Input>` and `<Select>` from the same module.
 *
 *   <Field label="Year">
 *     <Select value={year} onChange={...}>
 *       <option value="">Select year</option>
 *       ...
 *     </Select>
 *   </Field>
 *
 *   <Field label="Email" helperText="No spam, unsub anytime.">
 *     <Input type="email" placeholder="you@domain.com" />
 *   </Field>
 */
const Field = ({
  label,
  htmlFor,
  helperText,
  error,
  labelHidden,
  className,
  children,
}: FieldProps) => {
  const renderedLabel =
    typeof label === "string" ? (
      <Label
        tone="muted"
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          display: "block",
        }}
      >
        {label}
      </Label>
    ) : (
      label
    )

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {labelHidden ? (
        <label htmlFor={htmlFor} className="sr-only">
          {renderedLabel}
        </label>
      ) : htmlFor ? (
        <label htmlFor={htmlFor}>{renderedLabel}</label>
      ) : (
        renderedLabel
      )}
      {children}
      {(error || helperText) && (
        <div
          className="text-[11px] mt-0.5"
          style={{ color: error ? "hsl(var(--destructive))" : "var(--ink-soft)" }}
        >
          {error ?? helperText}
        </div>
      )}
    </div>
  )
}

export default Field
