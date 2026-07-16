/**
 * WB-096 X11: one guarded helper around Plausible's custom-event API
 * (`window.plausible(event, { props })`), so the guard isn't duplicated at
 * every call site.
 *
 * `Analytics` (`modules/common/components/analytics`) only mounts the
 * Plausible `<script>` when `NEXT_PUBLIC_ANALYTICS_DOMAIN` is set. When it
 * isn't, the script never loads and `window.plausible` is simply
 * `undefined` -- the optional chain below IS the "analytics off" no-op path.
 * No env var or config check needed here.
 *
 * Also guarded for SSR: call sites may be reached during a server render
 * pass (or in a test running under Node) before any client `window` exists.
 */
export type AnalyticsEventProps = Record<string, string | number | boolean>

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: AnalyticsEventProps }
    ) => void
  }
}

export function track(event: string, props?: AnalyticsEventProps): void {
  if (typeof window === "undefined") return
  window.plausible?.(event, props ? { props } : undefined)
}
