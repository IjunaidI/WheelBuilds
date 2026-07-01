"use client"

import { ProgressProvider } from "@bprogress/next/app"
import "@bprogress/core/css" // base .bprogress/.bar rules — the bar is class-styled, not JS-injected; without this it renders invisibly

/**
 * App-wide navigation progress bar (thin surgical-orange line at the top of the
 * viewport). Wraps the whole app so every route transition — <Link> clicks AND
 * programmatic navigations — shows an immediate indicator.
 *
 * `shallowRouting` makes it fire on same-route search-param changes too
 * (e.g. /store → /store?fit=…&fitd=…), which is where the worst dead-zones were:
 * Next keeps the old page on screen with no feedback while the server re-renders.
 *
 * Programmatic navigations only start the bar when they go through bprogress's
 * own `useRouter` (from "@bprogress/next/app"), so the fit buttons, the Discovery
 * query hook, and FitmentSync import their router from there. <Link> clicks are
 * intercepted automatically by this provider.
 */
export default function ProgressBar({ children }: { children: React.ReactNode }) {
  return (
    <ProgressProvider
      height="3px"
      color="#FF6A00"
      options={{ showSpinner: false }}
      shallowRouting
    >
      {children}
    </ProgressProvider>
  )
}
