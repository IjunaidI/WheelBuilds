import { resolveApplyContainer } from '../pipeline/resolve-apply-container'

// Sentinel objects standing in for real Medusa containers. We only assert
// identity (which one is returned), so plain tagged objects are enough — no
// mocking of the framework is needed or wanted here.
const globalContainer = { tag: 'global' } as any
const moduleContainer = { tag: 'module' } as any

describe('resolveApplyContainer', () => {
  it('prefers the caller-provided global container over the module fallback', () => {
    expect(resolveApplyContainer(globalContainer, moduleContainer)).toBe(
      globalContainer
    )
  })

  it('falls back to the module container when none is provided (undefined)', () => {
    expect(resolveApplyContainer(undefined, moduleContainer)).toBe(
      moduleContainer
    )
  })

  it('falls back to the module container when provided is null', () => {
    expect(resolveApplyContainer(null, moduleContainer)).toBe(moduleContainer)
  })
})
