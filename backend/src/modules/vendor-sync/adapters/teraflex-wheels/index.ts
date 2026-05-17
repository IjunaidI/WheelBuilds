import * as fs from 'fs'
import * as path from 'path'
import {
  VendorAdapter,
  VendorFeedDescriptor,
  ParsedRow,
  NormalizedRecord,
} from '../types'
import { parseWheelCsv } from './parse'
import { normalizeWheelRow } from './normalize'
import { uploadFeedToMinio } from '../../utils/archive'

const VENDOR_CODE = 'teraflex-wheels'

/**
 * Default CSV path: the wheelInvPriceData.csv at the repository root.
 * Can be overridden via deps.csvPath for testing.
 */
const DEFAULT_CSV_PATH = path.resolve(__dirname, '../../../../../../wheelInvPriceData.csv')

export class TeraflexWheelAdapter implements VendorAdapter {
  readonly vendorCode = VENDOR_CODE
  private csvPath: string

  constructor(deps?: { csvPath?: string }) {
    this.csvPath = deps?.csvPath || DEFAULT_CSV_PATH
  }

  async fetch(): Promise<VendorFeedDescriptor> {
    const stat = fs.statSync(this.csvPath)
    const filename = path.basename(this.csvPath)

    const archiveKey = await uploadFeedToMinio(this.csvPath, VENDOR_CODE, filename)

    return {
      vendorCode: VENDOR_CODE,
      archiveKey,
      sourceFilename: filename,
      byteLength: stat.size,
      fetchedAt: new Date(),
    }
  }

  async *parse(descriptor: VendorFeedDescriptor): AsyncIterable<ParsedRow> {
    // Use the original file path (archiveKey is the local path in this stub)
    const filePath = descriptor.archiveKey
    yield* parseWheelCsv(filePath)
  }

  normalize(row: ParsedRow): NormalizedRecord {
    return normalizeWheelRow(row)
  }

  async submitPurchaseOrder(_input: unknown): Promise<never> {
    throw new Error('submitPurchaseOrder is not yet implemented for teraflex-wheels')
  }
}
