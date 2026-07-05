import { promises as fs } from "fs"
import path from "path"
import { Client as MinioClient } from "minio"

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
 * Build a MinIO client from env, mirroring minio-file/service.ts's endpoint
 * parsing. Returns null if any of the three creds is missing.
 */
function buildMinioClient(): MinioClient | null {
  const rawEndpoint = process.env.MINIO_ENDPOINT
  const accessKey = process.env.MINIO_ACCESS_KEY
  const secretKey = process.env.MINIO_SECRET_KEY
  if (!rawEndpoint || !accessKey || !secretKey) return null

  let endPoint = rawEndpoint
  let useSSL = true
  let port = 443
  if (endPoint.startsWith("https://")) { endPoint = endPoint.replace("https://", ""); useSSL = true; port = 443 }
  else if (endPoint.startsWith("http://")) { endPoint = endPoint.replace("http://", ""); useSSL = false; port = 80 }
  endPoint = endPoint.replace(/\/$/, "")
  const portMatch = endPoint.match(/:(\d+)$/)
  if (portMatch) { port = parseInt(portMatch[1], 10); endPoint = endPoint.replace(/:(\d+)$/, "") }

  return new MinioClient({ endPoint, port, useSSL, accessKey, secretKey })
}

/**
 * WB-017: durable feed-archive upload to a DEDICATED PRIVATE bucket via the
 * direct MinIO client — deliberately NOT the shared File module (whose only
 * provider forces public-read). We never set a public bucket policy or a
 * public-read object ACL, so vendor cost CSVs stay private (retrieve via a
 * presigned URL or the MinIO console). Best-effort: returns the stored object
 * key, or null on any failure/misconfig; NEVER throws, never blocks the sync.
 * `fPutObject` streams the file straight from disk — no base64/binary
 * re-encoding, so the CSV bytes round-trip exactly.
 */
export async function uploadArchive(
  localPath: string,
  opts: { vendorCode: string; bucket: string }
): Promise<string | null> {
  try {
    const client = buildMinioClient()
    if (!client) return null
    const bucket = opts.bucket

    const exists = await client.bucketExists(bucket).catch(() => false)
    if (!exists) {
      await client.makeBucket(bucket) // NO setBucketPolicy → the bucket stays PRIVATE
    }
    const base = path.basename(localPath)
    // Prefix an epoch so a fallback-to-source archiveKey (no timestamp) can't overwrite.
    const objectName = `${opts.vendorCode}/${Date.now()}-${base}`
    await client.fPutObject(bucket, objectName, localPath, { "Content-Type": "text/csv" })
    return `${bucket}/${objectName}`
  } catch (err: any) {
    console.warn(`[vendor-sync] durable archive upload failed for ${opts.vendorCode}: ${err.message}. Continuing without durable archive.`)
    return null
  }
}
