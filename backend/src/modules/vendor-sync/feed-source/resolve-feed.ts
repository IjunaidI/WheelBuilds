import * as path from "path"
import * as fs from "fs"
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
 * Locate the directory that actually contains BOTH bundled sample CSVs by
 * walking up from `startDir` (this file's own on-disk location, `__dirname`
 * -- fixed at compile time, independent of `process.cwd()`) until a
 * directory contains both filenames, or the walk runs out of parents.
 *
 * WB-115 premerge review round 2 (Important 2): a fixed
 * `path.resolve(__dirname, "../../../../../")` (5 levels) only reaches the
 * repo root from the `src/` layout (`backend/src/modules/vendor-sync/
 * feed-source/`). Under `pnpm start`, which runs the BUILT tree
 * (`backend/.medusa/server/src/modules/vendor-sync/feed-source/` -- one
 * directory level deeper, via the extra `.medusa/server/` prefix), that same
 * 5-level walk lands inside `backend/.medusa/`, which never contains the
 * sample CSVs. `isSampleFeedPath` would then silently always return false in
 * that layout, and the `!opts.allowSample` guard below -- the safety check
 * that stops a production run from ingesting the bundled 11-row sample
 * against a catalog of thousands -- could never fire.
 *
 * Walking up dynamically (instead of hardcoding a depth) finds the real
 * directory in EITHER layout, regardless of cwd, with no per-layout branch
 * to keep in sync. Requiring BOTH sample filenames to be present together
 * (not just one) keeps this from false-matching an unrelated ancestor
 * directory that happens to contain a single same-named file.
 *
 * This does not reintroduce the basename-matching bug `isSampleFeedPath`
 * itself fixed: the returned directory only seeds the exact absolute paths
 * of the two bundled files, and classification below still compares a
 * feedPath's own FULL resolved path against that fixed set -- a same-named
 * file living anywhere else (os.tmpdir(), an SFTP download, an unrelated
 * directory) still does not match. See resolve-feed.test.ts for both layouts.
 */
export function findBundledSampleDir(startDir: string, maxLevels = 12): string | null {
  const filenames = Array.from(SAMPLE_FEED_FILENAMES)
  let dir = startDir
  for (let i = 0; i < maxLevels; i++) {
    if (filenames.every((name) => fs.existsSync(path.join(dir, name)))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null // reached the filesystem root
    dir = parent
  }
  return null
}

/**
 * Absolute filesystem paths of the bundled sample CSVs. `null` when neither
 * layout's walk finds them (e.g. a deploy artifact that strips the sample
 * CSVs entirely) -- `isSampleFeedPath` then simply never matches, which is
 * no worse than the pre-fix behavior in that scenario and cannot itself
 * misclassify a real feed.
 */
const BUNDLED_SAMPLE_DIR = findBundledSampleDir(__dirname)

const BUNDLED_SAMPLE_PATHS = new Set(
  BUNDLED_SAMPLE_DIR
    ? Array.from(SAMPLE_FEED_FILENAMES, (filename) =>
        path.resolve(BUNDLED_SAMPLE_DIR, filename)
      )
    : []
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
