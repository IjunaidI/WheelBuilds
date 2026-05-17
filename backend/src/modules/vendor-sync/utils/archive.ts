import { promises as fs } from "fs"
import path from "path"

/**
 * Archives a feed file to local storage under
 * static/vendor-feeds/{vendorCode}/{YYYY-MM-DDTHH-MM}.csv
 *
 * Returns the archive file path. If archiving fails (e.g. permissions),
 * logs a warning and returns the original file path -- archiving is
 * best-effort and must never block the sync pipeline.
 */
export async function archiveFeed(
  vendorCode: string,
  sourceFilePath: string,
  baseDir: string = path.resolve(process.cwd(), "static", "vendor-feeds")
): Promise<string> {
  try {
    const timestamp = new Date()
    const year = timestamp.getUTCFullYear()
    const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0")
    const day = String(timestamp.getUTCDate()).padStart(2, "0")
    const hours = String(timestamp.getUTCHours()).padStart(2, "0")
    const mins = String(timestamp.getUTCMinutes()).padStart(2, "0")
    const dateStr = `${year}-${month}-${day}-${hours}${mins}`

    const archiveDir = path.join(baseDir, vendorCode)
    const archivePath = path.join(archiveDir, `${dateStr}.csv`)

    await fs.mkdir(archiveDir, { recursive: true })
    await fs.copyFile(sourceFilePath, archivePath)

    return archivePath
  } catch (err: any) {
    console.warn(
      `[vendor-sync] Failed to archive feed for ${vendorCode}: ${err.message}. Continuing without archive.`
    )
    return sourceFilePath
  }
}
