import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

/**
 * Render a react-email template element to a static HTML string for
 * assertions in jest.
 *
 * `@react-email/tailwind` resolves its Tailwind setup via a suspended-promise
 * cache keyed by config (`useSuspendedPromise` in
 * `@react-email/tailwind/dist/index.cjs`): the FIRST synchronous render call
 * throws the pending promise (there's no Suspense boundary here to catch it,
 * so `renderToStaticMarkup` surfaces it as a hard error), then the cache
 * holds the resolved result for any later call with the same config. So we
 * render once to seed the cache (swallowing that expected throw), yield a
 * tick for the promise to settle, then render again for the real markup.
 * `@react-email/render`'s `render()` does the equivalent dance internally;
 * it isn't reachable here as a direct dependency (pnpm — see task report).
 */
export async function renderTemplate(element: ReactElement): Promise<string> {
  try {
    return renderToStaticMarkup(element)
  } catch {
    // Expected on the first call — see doc comment above.
  }
  await new Promise((resolve) => setImmediate(resolve))
  return renderToStaticMarkup(element)
}
