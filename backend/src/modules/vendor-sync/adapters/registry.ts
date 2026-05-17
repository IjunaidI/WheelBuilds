import { VendorAdapter } from './types'
import { TeraflexWheelAdapter } from './teraflex-wheels'
import { TeraflexTireAdapter } from './teraflex-tires'

export function resolveAdapter(vendorCode: string, deps?: any): VendorAdapter {
  switch (vendorCode) {
    case 'teraflex-wheels':
      return new TeraflexWheelAdapter(deps)
    case 'teraflex-tires':
      return new TeraflexTireAdapter(deps)
    default:
      throw new Error(`Unknown vendor adapter: ${vendorCode}`)
  }
}
