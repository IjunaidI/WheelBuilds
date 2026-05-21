/**
 * Standalone mock script that parses a vendor CSV through the adapter
 * pipeline (parse + normalize + hash) without needing a database.
 * Prints a summary of what would be staged.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/vendor-sync-mock.ts <csv-path> <wheel|tire>
 *
 * Or via npx with swc:
 *   npx tsx src/scripts/vendor-sync-mock.ts ../wheelInvPriceData.csv wheel
 */
import path from 'path'
import { parseWheelCsv } from '../modules/vendor-sync/adapters/wheelpros-wheels/parse'
import { normalizeWheelRow } from '../modules/vendor-sync/adapters/wheelpros-wheels/normalize'
import { parseTireCsv } from '../modules/vendor-sync/adapters/wheelpros-tires/parse'
import { normalizeTireRow } from '../modules/vendor-sync/adapters/wheelpros-tires/normalize'
import { computeContentHash } from '../modules/vendor-sync/utils/hash'
import type { NormalizedRecord } from '../modules/vendor-sync/adapters/types'

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log('Usage: npx tsx src/scripts/vendor-sync-mock.ts <csv-path> <wheel|tire>')
    process.exit(1)
  }

  const csvPath = path.resolve(args[0])
  const productType = args[1] as 'wheel' | 'tire'

  console.log(`\nParsing ${productType} CSV: ${csvPath}`)
  console.log('='.repeat(60))

  const parse = (p: string) => productType === 'wheel' ? parseWheelCsv(p) : parseTireCsv(p)
  const normalize = productType === 'wheel' ? normalizeWheelRow : normalizeTireRow

  let totalRows = 0
  let skippedNoImage = 0
  let staged = 0
  let parseErrors = 0
  const brands = new Set<string>()
  const warehouses = new Set<string>()
  const invOrderTypes: Record<string, number> = {}
  const sampleRows: NormalizedRecord[] = []

  for await (const row of parse(csvPath)) {
    totalRows++
    try {
      const normalized = normalize(row)

      // Track InvOrderType distribution
      invOrderTypes[normalized.invOrderType] = (invOrderTypes[normalized.invOrderType] || 0) + 1

      // Image filter
      if (!normalized.imageUrl) {
        skippedNoImage++
        continue
      }

      staged++
      brands.add(normalized.brand)
      const hash = computeContentHash(normalized)

      for (const wh of Object.keys(normalized.stockByWarehouse)) {
        warehouses.add(wh)
      }

      // Keep first 3 as samples
      if (sampleRows.length < 3) {
        sampleRows.push(normalized)
      }
    } catch (err: any) {
      parseErrors++
      if (parseErrors <= 5) {
        console.error(`  Parse error row ${totalRows} (${row.partNumber}): ${err.message}`)
      }
    }
  }

  console.log(`\nSummary`)
  console.log('-'.repeat(40))
  console.log(`Total rows parsed:    ${totalRows}`)
  console.log(`Parse errors:         ${parseErrors}`)
  console.log(`Skipped (no image):   ${skippedNoImage}`)
  console.log(`Staged (would sync):  ${staged}`)
  console.log(`Brands:               ${[...brands].join(', ')}`)
  console.log(`Warehouse codes:      ${[...warehouses].sort().join(', ')}`)
  console.log(`InvOrderType dist:    ${JSON.stringify(invOrderTypes)}`)

  if (sampleRows.length > 0) {
    console.log(`\nSample staged records:`)
    for (const rec of sampleRows) {
      const hash = computeContentHash(rec)
      console.log(`  ${rec.partNumber} | ${rec.title.substring(0, 50)} | $${rec.msrpUsd} | hash: ${hash.substring(0, 12)}...`)
      if (rec.productType === 'wheel') {
        console.log(`    ${rec.diameterIn}x${rec.widthIn} ${rec.boltCount}x${rec.boltCircleIn.toFixed(2)}" offset=${rec.offsetMm}mm | ${rec.finish || 'no finish'}`)
      } else {
        console.log(`    tire: ${rec.tireWidthMm || '?'}/${rec.aspectRatio || '?'}${rec.constructionType || '?'}${rec.rimDiameterIn || '?'} | ${rec.speedRating || '?'} speed`)
      }
    }
  }

  if (parseErrors > 5) {
    console.log(`\n  ... and ${parseErrors - 5} more parse errors (suppressed)`)
  }

  console.log('')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
