import { cn } from "@/lib/utils"

/**
 * Minimal shimmer placeholder. Pair with custom skeleton compositions in
 * `modules/<feature>/components/.../skeleton.tsx` for page-level fallbacks.
 *
 *   <Skeleton className="h-9 w-32 rounded-md" />
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius)] bg-[var(--hairline)]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
