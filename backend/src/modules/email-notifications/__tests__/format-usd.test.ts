import { formatUsd } from '../templates/format-usd'

describe('formatUsd (WB-094 A7)', () => {
  it('formats a MAJOR-units amount with thousands separator + 2 decimals (no /100)', () => {
    expect(formatUsd(1479.96)).toBe('$1,479.96')
  })

  it('formats zero', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('formats a whole-dollar amount with trailing .00', () => {
    expect(formatUsd(45)).toBe('$45.00')
  })
})
