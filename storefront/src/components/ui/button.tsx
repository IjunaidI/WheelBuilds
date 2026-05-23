import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // WB primary CTA — orange fill, white text. Replaces the legacy .btn-primary class.
        default:
          "bg-primary text-primary-foreground hover:bg-[#E55A00]",
        // WB outline — ink border on transparent background. Replaces .btn-outline.
        outline:
          "border border-[var(--ink)] bg-transparent text-foreground hover:bg-[var(--soft)]",
        // Soft secondary button — used for trailing actions inside surfaces.
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // Ghost — no chrome until hover. Use for icon-only actions in a row of controls.
        ghost: "hover:bg-[var(--soft)] text-foreground",
        // Inline text link styled as a button.
        link: "text-foreground underline underline-offset-4 hover:text-primary",
        // Destructive (cart remove, account delete).
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        // The big CTA size used in the hero (64px height).
        lg: "h-16 px-8 text-[15px]",
        // Square icon button.
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
