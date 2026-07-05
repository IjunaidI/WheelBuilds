import { promises as fs } from "fs"
import path from "path"
import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

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

/**
 * Best-effort durable upload of a local archive file to object storage via the
 * File module. Returns the stored key, or null on any failure (archiving must
 * never block the pipeline). The caller decides IF to call this
 * (shouldUploadArchive); descriptor.archiveKey stays local for parsing.
 */
export async function uploadArchive(
  container: MedusaContainer,
  localPath: string,
  opts: { vendorCode: string; bucketPrefix: string }
): Promise<string | null> {
  try {
    const fileModule = container.resolve(Modules.FILE)
    const content = await fs.readFile(localPath)
    const base = localPath.split(/[\\/]/).pop() ?? "feed.csv"
    const [file] = await fileModule.createFiles([
      {
        filename: `${opts.bucketPrefix}/${opts.vendorCode}/${base}`,
        mimeType: "text/csv",
        content: content.toString("binary"),
      },
    ])
    return file?.url ?? file?.id ?? null
  } catch (err: any) {
    console.warn(`[vendor-sync] durable archive upload failed for ${opts.vendorCode}: ${err.message}`)
    return null
  }
}
