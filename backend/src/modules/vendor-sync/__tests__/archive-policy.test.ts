import { shouldUploadArchive } from "../utils/archive-policy"

describe("shouldUploadArchive", () => {
  it("uploads only when durable archiving is enabled AND MinIO is configured", () => {
    expect(shouldUploadArchive(true, true)).toBe(true)
    expect(shouldUploadArchive(true, false)).toBe(false)
    expect(shouldUploadArchive(false, true)).toBe(false)
    expect(shouldUploadArchive(false, false)).toBe(false)
  })
})
