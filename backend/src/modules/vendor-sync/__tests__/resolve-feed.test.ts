import { resolveFeed, SampleFeedNotAllowedError } from "../feed-source/resolve-feed"

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

  it("throws when feedPath IS the bundled sample and sample not allowed", async () => {
    await expect(
      resolveFeed(
        { feedPath: "./wheelInvPriceData.csv" },
        null,
        { allowSample: false, vendorCode: VENDOR }
      )
    ).rejects.toBeInstanceOf(SampleFeedNotAllowedError)
  })

  it("detects a backslash-style sample path on a Linux host", async () => {
    await expect(
      resolveFeed(
        { feedPath: "feeds\\wheelInvPriceData.csv" },
        null,
        { allowSample: false, vendorCode: VENDOR }
      )
    ).rejects.toBeInstanceOf(SampleFeedNotAllowedError)
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
