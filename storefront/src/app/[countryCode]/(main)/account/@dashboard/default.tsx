// WB-093 A5: defensive counterpart to `@login/default.tsx`. `@login` has no
// nested routes today, so this specific fallback isn't reachable yet -- but
// Next.js's own guidance is that every parallel-route slot should carry a
// `default.tsx`; otherwise adding so much as one new nested route under
// `@login` in the future would silently 404 every `@dashboard` path Next
// can't match against it. Re-exporting the dashboard's root page (the
// account Overview) is the right fallback: it's the one thing that's always
// safe to show for "some /account/* URL the @dashboard tree doesn't have a
// more specific match for."
export { default } from "./page"
