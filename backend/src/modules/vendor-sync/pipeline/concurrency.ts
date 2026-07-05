/**
 * Run `fn` over `items` with at most `limit` in flight. Results are
 * index-aligned; an item skipped because `shouldStop()` returned true is
 * left `undefined`. Callers must catch errors inside `fn` — an uncaught
 * throw rejects the returned promise.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean | Promise<boolean>
): Promise<Array<R | undefined>> {
  const n = items.length
  const results: Array<R | undefined> = new Array(n)
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, n || 1))
  let next = 0

  async function worker(): Promise<void> {
    while (true) {
      if (shouldStop && (await shouldStop())) return
      const i = next++
      if (i >= n) return
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
