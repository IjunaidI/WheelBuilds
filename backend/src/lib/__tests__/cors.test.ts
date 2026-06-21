import { resolveCors } from '../cors'

describe('resolveCors', () => {
  const base = { isProduction: false, devDefault: 'http://localhost:8000', name: 'STORE_CORS' }

  it('returns the value verbatim when set', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCors('https://shop.example', base)).toBe('https://shop.example')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns the dev default + warns when unset in non-production', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCors(undefined, base)).toBe('http://localhost:8000')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('STORE_CORS')
    warn.mockRestore()
  })

  it('treats empty / whitespace as unset', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCors('   ', base)).toBe('http://localhost:8000')
    warn.mockRestore()
  })

  it('throws an actionable error when unset in production', () => {
    expect(() => resolveCors(undefined, { ...base, isProduction: true })).toThrow(/STORE_CORS/)
    expect(() => resolveCors(undefined, { ...base, isProduction: true })).toThrow(/production/)
  })
})
