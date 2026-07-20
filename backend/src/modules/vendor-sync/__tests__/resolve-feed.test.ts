import * as path from "path"
import * as os from "os"
import { resolveFeed, isSampleFeedPath, SampleFeedNotAllowedError } from "../feed-source/resolve-feed"

// The bundled sample CSVs' real absolute location, computed the exact same
// way the module under test computes it (feed-source/resolve-feed.ts is 5
// directories below the repo root; this test file, in __tests__/, sits at
// the same depth). Recomputing independently here (rather than importing an
// internal constant) keeps the test honest about what "the real bundled
// sample path" means on disk.
const BUNDLED_WHEEL_SAMPLE = path.resolve(__dirname, "../../../../../wheelInvPriceData.csv")
const BUNDLED_TIRE_SAMPLE = path.resolve(__dirname, "../../../../../tireInvPriceData.csv")

// Mock the SFTP I/O so importing resolveFeed pulls no ssh2 native binding.
jest.mock("../feed-source/sftp", () => ({
  downloadNewestViaSftp: jest.fn(async () => ({
    kind: "unchanged",
    sourceName: "remote.csv",
    modifyTime: 123,
  })),
}))

const VENDOR = "wheelpros-wheels"

describe("resolveFeed WB-041 fail-loud guard", () => {
  it("throws when no sftp/feedPath and sample not allowed", async () => {
    await expect(
      resolveFeed({}, null, { allowSample: false, vendorCode: VENDOR })
    ).rejects.toBeInstanceOf(SampleFeedNotAllowedError)
  })

  it("error names the opt-in env var", async () => {
    await expect(
      resolveFeed({}, null, { allowSample: false, vendorCode: VENDOR })
    ).rejects.toThrow(/VENDOR_ALLOW_SAMPLE_FEED=true/)
  })

  it("returns {kind:'default'} when no feed but sample allowed", async () => {
    const r = await resolveFeed({}, null, { allowSample: true, vendorCode: VENDOR })
    expect(r).toEqual({ kind: "default" })
  })

  it("returns {kind:'file'} for a real (non-sample) feedPath", async () => {
    const r = await resolveFeed(
      { feedPath: "/feeds/live.csv" },
      null,
      { allowSample: false, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "file", csvPath: "/feeds/live.csv", sourceName: "live.csv" })
  })

  // WB-115 premerge Change 3: isSampleFeedPath now compares the RESOLVED
  // ABSOLUTE path against the bundled sample's actual on-disk location,
  // rather than matching by basename. A relative path that merely *looks*
  // like the sample's name (e.g. "./wheelInvPriceData.csv" from an
  // arbitrary CWD) is not necessarily the bundled file at all -- only the
  // real resolved path is.
  it("throws when feedPath IS the bundled sample (its real resolved absolute path) and sample not allowed", async () => {
    await expect(
      resolveFeed(
        { feedPath: BUNDLED_WHEEL_SAMPLE },
        null,
        { allowSample: false, vendorCode: VENDOR }
      )
    ).rejects.toBeInstanceOf(SampleFeedNotAllowedError)
  })

  it("throws for the bundled tire sample too (its real resolved absolute path)", async () => {
    await expect(
      resolveFeed(
        { feedPath: BUNDLED_TIRE_SAMPLE },
        null,
        { allowSample: false, vendorCode: VENDOR }
      )
    ).rejects.toBeInstanceOf(SampleFeedNotAllowedError)
  })

  // This is the exact bug this change fixes: SFTP downloads the REAL live
  // feed to a local temp path named after the remote file (sftp.ts), and
  // WheelPros' genuine tire export happens to be named the same as the
  // bundled sample (tireInvPriceData.csv). A path that merely SHARES the
  // sample's basename -- but resolves somewhere else entirely -- must be
  // treated as a real, non-sample feed: it resolves to {kind:"file"}
  // without throwing, even though sampling is not allowed.
  it("does NOT classify a real feed that merely shares the bundled sample's filename (different directory) as the sample", async () => {
    const notTheSample = path.resolve(__dirname, "some-other-dir", "wheelInvPriceData.csv")
    const r = await resolveFeed(
      { feedPath: notTheSample },
      null,
      { allowSample: false, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "file", csvPath: notTheSample, sourceName: "wheelInvPriceData.csv" })
  })

  it("does NOT classify an SFTP-style tmpdir download sharing the sample's basename as the sample", async () => {
    // Mirrors exactly what sftp.ts's downloadNewestViaSftp produces:
    // path.join(os.tmpdir(), "vendor-sync", <basename of the remote file>).
    const tmpDownload = path.join(os.tmpdir(), "vendor-sync", "tireInvPriceData.csv")
    const r = await resolveFeed(
      { feedPath: tmpDownload },
      null,
      { allowSample: false, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "file", csvPath: tmpDownload })
  })

  it("allows the sample feedPath when sample is allowed", async () => {
    const r = await resolveFeed(
      { feedPath: "./tireInvPriceData.csv" },
      null,
      { allowSample: true, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "file", csvPath: "./tireInvPriceData.csv" })
  })

  it("delegates to sftp regardless of allowSample", async () => {
    const r = await resolveFeed(
      { sftp: { host: "h", username: "u", remoteDir: "/d", filePattern: ".*" } as any },
      null,
      { allowSample: false, vendorCode: VENDOR }
    )
    expect(r).toMatchObject({ kind: "unchanged" })
  })
})

describe("isSampleFeedPath (WB-115 premerge Change 3 — resolved-absolute-path comparison)", () => {
  it("true for the bundled wheel sample's real absolute path", () => {
    expect(isSampleFeedPath(BUNDLED_WHEEL_SAMPLE)).toBe(true)
  })

  it("true for the bundled tire sample's real absolute path", () => {
    expect(isSampleFeedPath(BUNDLED_TIRE_SAMPLE)).toBe(true)
  })

  it("false for a same-basename file living anywhere other than the bundled location -- this is the production bug this change fixes", () => {
    const sftpDownload = path.join(os.tmpdir(), "vendor-sync", "tireInvPriceData.csv")
    expect(isSampleFeedPath(sftpDownload)).toBe(false)
    expect(isSampleFeedPath(path.resolve(__dirname, "elsewhere", "wheelInvPriceData.csv"))).toBe(false)
  })

  it("false for an unrelated path", () => {
    expect(isSampleFeedPath("/feeds/live.csv")).toBe(false)
  })
})
