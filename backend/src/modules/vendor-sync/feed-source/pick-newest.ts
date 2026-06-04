import { RemoteFile } from "./types"

/** The newest (max modifyTime) file whose name matches `pattern`, or null. */
export function pickNewestFeed(files: RemoteFile[], pattern: RegExp): RemoteFile | null {
  const matches = files.filter((f) => pattern.test(f.name))
  if (!matches.length) return null
  return matches.reduce((a, b) => (b.modifyTime > a.modifyTime ? b : a))
}
