import * as path from "path"
import { FeedConfig, LastSeen, ResolvedFeed } from "./types"
import { downloadNewestViaSftp } from "./sftp"

/** Basenames of the bundled sample CSVs that ship at the repo root. Retained
 * for the filenames themselves (used to build the absolute paths below);
 * basename alone is no longer sufficient to CLASSIFY a path as the sample --
 * see isSampleFeedPath. */
export const SAMPLE_FEED_FILENAMES = new Set([
  "wheelInvPriceData.csv",
  "tireInvPriceData.csv",
])

/**
 * Absolute filesystem paths of the bundled sample CSVs, computed the same
 * way each adapter computes its own `DEFAULT_CSV_PATH` (see
 * adapters/wheelpros-wheels/index.ts and adapters/wheelpros-tires/index.ts):
 * the files ship at the monorepo root, one level above `backend/`. This
 * file lives at `backend/src/modules/vendor-sync/feed-source/`, five
 * directories below the repo root.
 */
const BUNDLED_SAMPLE_PATHS = new Set(
  Array.from(SAMPLE_FEED_FILENAMES, (filename) =>
    path.resolve(__dirname, "../../../../../", filename)
  )
)

/**
 * True only when `feedPath`, once resolved to an absolute filesystem path,
 * IS one of the bundled sample CSVs shipped at the repo root -- NOT merely a
 * file that happens to share the sample's basename.
 *
 * This used to be a basename-only check, which broke in production: an SFTP
 * pull downloads the REAL live feed to a local temp path named after the
 * remote file (see sftp.ts's `downloadNewestViaSftp`), and WheelPros' real
 * tire feed happens to be named `tireInvPriceData.csv` too -- identical
 * basename to the bundled sample. That made a genuine 1,120,128-byte live
 * SFTP pull get classified as "the bundled sample," logging a misleading
 * "USING BUNDLED SAMPLE FEED ... this is NOT live inventory" warning that
 * trained operators to ignore the one log line that means "you are about to
 * apply fake inventory." Resolving to an absolute path and comparing against
 * the bundled files' actual on-disk location fixes this: an SFTP download
 * always lands under `os.tmpdir()`, never at the repo root, so it can never
 * collide with the real bundled sample regardless of filename.
 */
export function isSampleFeedPath(feedPath: string): boolean {
  return BUNDLED_SAMPLE_PATHS.has(path.resolve(feedPath))
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
