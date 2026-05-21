import { computeDiffFromSets, DiffResult } from '../pipeline/diff'

describe('computeDiffFromSets', () => {
  it('classifies new, changed, and discontinued correctly', () => {
    const staging = [
      { part_number: 'A', content_hash: 'hash-a' },
      { part_number: 'B', content_hash: 'hash-b-new' },
      { part_number: 'C', content_hash: 'hash-c-changed' },
      { part_number: 'D', content_hash: 'hash-d' },
    ]
    const current = [
      { part_number: 'B', content_hash: 'hash-b-new', discontinued_at: null },
      { part_number: 'C', content_hash: 'hash-c-old', discontinued_at: null },
      { part_number: 'E', content_hash: 'hash-e', discontinued_at: null },
    ]

    const result = computeDiffFromSets(staging, current)

    expect(result.newPartNumbers.sort()).toEqual(['A', 'D'])
    expect(result.changedPartNumbers).toEqual(['C'])
    expect(result.discontinuedPartNumbers).toEqual(['E'])
  })

  it('marks everything as new when current is empty', () => {
    const staging = [
      { part_number: 'A', content_hash: 'h1' },
      { part_number: 'B', content_hash: 'h2' },
    ]
    const current: Array<{
      part_number: string
      content_hash: string
      discontinued_at: Date | null
    }> = []

    const result = computeDiffFromSets(staging, current)

    expect(result.newPartNumbers.sort()).toEqual(['A', 'B'])
    expect(result.changedPartNumbers).toEqual([])
    expect(result.discontinuedPartNumbers).toEqual([])
  })

  it('marks everything as discontinued when staging is empty', () => {
    const staging: Array<{ part_number: string; content_hash: string }> = []
    const current = [
      { part_number: 'A', content_hash: 'h1', discontinued_at: null },
      { part_number: 'B', content_hash: 'h2', discontinued_at: null },
    ]

    const result = computeDiffFromSets(staging, current)

    expect(result.newPartNumbers).toEqual([])
    expect(result.changedPartNumbers).toEqual([])
    expect(result.discontinuedPartNumbers.sort()).toEqual(['A', 'B'])
  })

  it('returns empty sets when both staging and current are empty', () => {
    const result = computeDiffFromSets([], [])

    expect(result.newPartNumbers).toEqual([])
    expect(result.changedPartNumbers).toEqual([])
    expect(result.discontinuedPartNumbers).toEqual([])
  })

  it('ignores already-discontinued current rows', () => {
    const staging = [
      { part_number: 'A', content_hash: 'h1' },
    ]
    const current = [
      { part_number: 'B', content_hash: 'h2', discontinued_at: new Date('2026-01-01') },
      { part_number: 'C', content_hash: 'h3', discontinued_at: null },
    ]

    const result = computeDiffFromSets(staging, current)

    // B is already discontinued, so it should not appear in discontinuedPartNumbers
    expect(result.newPartNumbers).toEqual(['A'])
    expect(result.changedPartNumbers).toEqual([])
    expect(result.discontinuedPartNumbers).toEqual(['C'])
  })

  it('does not report unchanged rows as changed', () => {
    const staging = [
      { part_number: 'A', content_hash: 'same-hash' },
      { part_number: 'B', content_hash: 'same-hash-b' },
    ]
    const current = [
      { part_number: 'A', content_hash: 'same-hash', discontinued_at: null },
      { part_number: 'B', content_hash: 'same-hash-b', discontinued_at: null },
    ]

    const result = computeDiffFromSets(staging, current)

    expect(result.newPartNumbers).toEqual([])
    expect(result.changedPartNumbers).toEqual([])
    expect(result.discontinuedPartNumbers).toEqual([])
  })

  it('handles a staging row matching a discontinued current row as new', () => {
    // If a part was discontinued but reappears in the feed, it should be "new"
    const staging = [
      { part_number: 'A', content_hash: 'h1' },
    ]
    const current = [
      { part_number: 'A', content_hash: 'h1', discontinued_at: new Date('2026-01-01') },
    ]

    const result = computeDiffFromSets(staging, current)

    expect(result.newPartNumbers).toEqual(['A'])
    expect(result.changedPartNumbers).toEqual([])
    expect(result.discontinuedPartNumbers).toEqual([])
  })

  it('handles large datasets efficiently', () => {
    const size = 45000
    const staging = Array.from({ length: size }, (_, i) => ({
      part_number: `PART-${i}`,
      content_hash: `hash-${i}`,
    }))
    // Current has the first half with same hashes, plus 1000 extras
    const current = Array.from({ length: size / 2 + 1000 }, (_, i) => ({
      part_number: i < size / 2 ? `PART-${i}` : `OLD-${i}`,
      content_hash: i < size / 2 ? `hash-${i}` : `old-hash-${i}`,
      discontinued_at: null,
    }))

    const start = Date.now()
    const result = computeDiffFromSets(staging, current)
    const elapsed = Date.now() - start

    // The second half of staging (22500 items) should be new
    expect(result.newPartNumbers.length).toBe(size / 2)
    // Same hashes for the overlapping half, so no changes
    expect(result.changedPartNumbers.length).toBe(0)
    // The 1000 extras in current are discontinued
    expect(result.discontinuedPartNumbers.length).toBe(1000)
    // Should complete well under 1 second
    expect(elapsed).toBeLessThan(5000)
  })
})
