import { VendorAdapter } from './types'
import { WheelProsWheelAdapter } from './wheelpros-wheels'
import { WheelProsTireAdapter } from './wheelpros-tires'

export function resolveAdapter(vendorCode: string, deps?: any): VendorAdapter {
  switch (vendorCode) {
    case 'wheelpros-wheels':
      return new WheelProsWheelAdapter(deps)
    case 'wheelpros-tires':
      return new WheelProsTireAdapter(deps)
    default:
      throw new Error(`Unknown vendor adapter: ${vendorCode}`)
  }
}
