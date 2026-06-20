import * as path from "path"
import { FeedConfig, LastSeen, ResolvedFeed } from "./types"
import { downloadNewestViaSftp } from "./sftp"

/** Basenames of the bundled sample CSVs that ship at the repo root. */
export const SAMPLE_FEED_FILENAMES = new Set([
  "wheelInvPriceData.csv",
  "tireInvPriceData.csv",
])

/** True when a feed path points at one of the bundled sample CSVs (by basename).
 * Normalizes backslashes first so a Windows-style path is still detected on a Linux host. */
export function isSampleFeedPath(feedPath: string): boolean {
  return SAMPLE_FEED_FILENAMES.has(path.basename(feedPath.replace(/\\/g, "/")))
}

/** Thrown when vendor-sync would sync the bundled sample CSV without an explicit opt-in. */
export class SampleFeedNotAllowedError extends Error {
  constructor(vendorCode: string) {
    super(
      `[vendor-sync] No live feed configured for "${vendorCode}": set SFTP ` +
        `(VENDOR_WHEELPROS_*_SFTP_HOST + credentials) or a real VENDOR_WHEELPROS_*_FEED_PATH. ` +
        `To intentionally use the bundled SAMPLE CSV (dev/CI only), set VENDOR_ALLOW_SAMPLE_FEED=true.`
    )
    this.name = "SampleFeedNotAllowedError"
  }
}

export interface ResolveFeedOptions {
  /** Whether the bundled sample CSV may be used when no live feed is configured. */
  allowSample: boolean
  /** Vendor code, for actionable error messages. */
  vendorCode: string
}

/**
 * Resolve a vendor's feed config to a concrete CSV path (or a short-circuit).
 *   - sftp present     -> pull the newest remote file (with delta short-circuit)
 *   - feedPath present -> use that local file, UNLESS it is the bundled sample and !allowSample
 *   - neither          -> "default" (the adapter's bundled sample) ONLY when allowSample;
 *                         otherwise throw SampleFeedNotAllowedError (WB-041 fail-loud guard)
 */
export async function resolveFeed(
  cfg: FeedConfig,
  lastSeen: LastSeen | null,
  opts: ResolveFeedOptions
): Promise<ResolvedFeed> {
  if (cfg.sftp) return downloadNewestViaSftp(cfg.sftp, lastSeen)

  if (cfg.feedPath) {
    if (isSampleFeedPath(cfg.feedPath) && !opts.allowSample) {
      throw new SampleFeedNotAllowedError(opts.vendorCode)
    }
    return {
      kind: "file",
      csvPath: cfg.feedPath,
      sourceName: path.basename(cfg.feedPath),
      modifyTime: null,
    }
  }

  if (!opts.allowSample) {
    throw new SampleFeedNotAllowedError(opts.vendorCode)
  }
  return { kind: "default" }
}
