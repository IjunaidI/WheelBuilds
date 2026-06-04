import * as path from "path"
import { FeedConfig, LastSeen, ResolvedFeed } from "./types"
import { downloadNewestViaSftp } from "./sftp"

/**
 * Resolve a vendor's feed config to a concrete CSV path (or a short-circuit).
 *   - sftp present     -> pull the newest remote file (with delta short-circuit)
 *   - feedPath present -> use that local file (delta handled by the RunDate short-circuit)
 *   - neither          -> "default": let the adapter use its built-in DEFAULT_CSV_PATH
 */
export async function resolveFeed(cfg: FeedConfig, lastSeen: LastSeen | null): Promise<ResolvedFeed> {
  if (cfg.sftp) return downloadNewestViaSftp(cfg.sftp, lastSeen)
  if (cfg.feedPath) {
    return { kind: "file", csvPath: cfg.feedPath, sourceName: path.basename(cfg.feedPath), modifyTime: null }
  }
  return { kind: "default" }
}
