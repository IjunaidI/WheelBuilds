import { resolveDevMaxRows } from '../dev-max-rows'

describe('resolveDevMaxRows', () => {
  it('returns undefined when unset (full feed)', () => {
    expect(resolveDevMaxRows(undefined)).toBeUndefined()
  })
  it('returns undefined for empty / whitespace', () => {
    expect(resolveDevMaxRows('')).toBeUndefined()
    expect(resolveDevMaxRows('   ')).toBeUndefined()
  })
  it('returns the positive integer when set', () => {
    expect(resolveDevMaxRows('500')).toBe(500)
    expect(resolveDevMaxRows(' 1000 ')).toBe(1000)
  })
  it('returns undefined for zero, negative, or non-numeric', () => {
    expect(resolveDevMaxRows('0')).toBeUndefined()
    expect(resolveDevMaxRows('-1')).toBeUndefined()
    expect(resolveDevMaxRows('abc')).toBeUndefined()
  })
})
