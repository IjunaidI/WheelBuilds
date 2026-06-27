import { computeWheelGroupKey } from '../adapters/wheelpros-wheels/group-key'

describe('computeWheelGroupKey', () => {
  it('groups by brand + displayStyleNo (finish dropped)', () => {
    const key = computeWheelGroupKey({
      brand: 'Performance Replicas',
      displayStyleNo: '126',
      finish: 'GLOSS BLACK',
      partNumber: '126GB-211223',
    })
    expect(key).toBe('Performance Replicas|126')
  })

  it('places two SKUs that share brand+model+finish in the same group', () => {
    const a = computeWheelGroupKey({
      brand: 'Performance Replicas',
      displayStyleNo: '126',
      finish: 'GLOSS BLACK',
      partNumber: '126GB-211223',
    })
    const b = computeWheelGroupKey({
      brand: 'Performance Replicas',
      displayStyleNo: '126',
      finish: 'GLOSS BLACK',
      partNumber: '126GB-211235',
    })
    expect(a).toBe(b)
  })

  it('groups all finishes of a model under one key (finish dropped)', () => {
    const a = computeWheelGroupKey({
      brand: 'Performance Replicas',
      displayStyleNo: '126',
      finish: 'GLOSS BLACK',
      partNumber: '126GB-211223',
    })
    const b = computeWheelGroupKey({
      brand: 'Performance Replicas',
      displayStyleNo: '126',
      finish: 'BLACK BRONZE',
      partNumber: '126BB-211223',
    })
    expect(a).toBe(b)
    expect(a).toBe('Performance Replicas|126')
  })

  it('separates two SKUs that differ on brand even with same model code', () => {
    const a = computeWheelGroupKey({
      brand: 'Performance Replicas',
      displayStyleNo: '126',
      finish: 'GLOSS BLACK',
      partNumber: 'PR126GB',
    })
    const b = computeWheelGroupKey({
      brand: 'Other Brand',
      displayStyleNo: '126',
      finish: 'GLOSS BLACK',
      partNumber: 'OB126GB',
    })
    expect(a).not.toBe(b)
  })

  it('keeps SKUs in the same group when model present and finish is empty', () => {
    // Asanti 172 case: two sizes ship with the same brand+model and a
    // blank finish; they must still cluster into one product.
    const a = computeWheelGroupKey({
      brand: 'Asanti Forged',
      displayStyleNo: '172',
      finish: '',
      partNumber: 'ZLTCX1722011',
    })
    const b = computeWheelGroupKey({
      brand: 'Asanti Forged',
      displayStyleNo: '172',
      finish: null,
      partNumber: 'ZLTCX1722090',
    })
    expect(a).toBe(b)
    expect(a).toBe('Asanti Forged|172')
  })

  it('falls back to a per-SKU key when displayStyleNo is empty', () => {
    // No model anchor: two unrelated rows from the same brand must NOT
    // merge just because they share a brand or a finish.
    const a = computeWheelGroupKey({
      brand: 'DUB 1PC',
      displayStyleNo: null,
      finish: '',
      partNumber: 'Y305198543+2515',
    })
    const b = computeWheelGroupKey({
      brand: 'DUB 1PC',
      displayStyleNo: '',
      finish: '',
      partNumber: 'Y849220543+2060',
    })
    expect(a).toBe('sku:Y305198543+2515')
    expect(b).toBe('sku:Y849220543+2060')
    expect(a).not.toBe(b)
  })

  it('trims whitespace around inputs', () => {
    const key = computeWheelGroupKey({
      brand: '  Performance Replicas  ',
      displayStyleNo: ' 126 ',
      finish: ' GLOSS BLACK ',
      partNumber: '126GB-211223',
    })
    expect(key).toBe('Performance Replicas|126')
  })

  it('treats whitespace-only displayStyleNo as empty (falls back to per-SKU)', () => {
    const key = computeWheelGroupKey({
      brand: 'DUB 1PC',
      displayStyleNo: '   ',
      finish: 'CHR',
      partNumber: 'Y305198543+2515',
    })
    expect(key).toBe('sku:Y305198543+2515')
  })
})
