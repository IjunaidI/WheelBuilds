import Client from "ssh2-sftp-client"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"
import { pickNewestFeed } from "./pick-newest"
import { isNewFeed } from "./is-new-feed"
import { SftpConfig, RemoteFile, LastSeen, ResolvedFeed } from "./types"

/**
 * List the remote dir, pick the newest matching file, short-circuit if it
 * matches the last run, otherwise download it to a temp path named after the
 * remote file (so descriptor.sourceFilename carries the real name for delta).
 */
export async function downloadNewestViaSftp(
  cfg: SftpConfig,
  lastSeen: LastSeen | null
): Promise<ResolvedFeed> {
  const client = new Client()
  try {
    await client.connect({
      host: cfg.host,
      port: cfg.port ?? 22,
      username: cfg.username,
      password: cfg.password,
      privateKey: cfg.privateKey,
    })

    const entries = await client.list(cfg.remoteDir)
    const files: RemoteFile[] = entries
      .filter((e: any) => e.type === "-")
      .map((e: any) => ({ name: e.name, modifyTime: e.modifyTime, size: e.size }))

    const pattern = new RegExp(cfg.filePattern || ".*\\.csv$")
    const newest = pickNewestFeed(files, pattern)
    if (!newest) return { kind: "empty" }

    if (!isNewFeed(newest, lastSeen)) {
      return { kind: "unchanged", sourceName: newest.name, modifyTime: newest.modifyTime }
    }

    const dir = path.join(os.tmpdir(), "vendor-sync")
    fs.mkdirSync(dir, { recursive: true })
    const localPath = path.join(dir, path.basename(newest.name))
    await client.fastGet(path.posix.join(cfg.remoteDir, newest.name), localPath)

    return { kind: "file", csvPath: localPath, sourceName: newest.name, modifyTime: newest.modifyTime }
  } finally {
    await client.end().catch(() => {})
  }
}
