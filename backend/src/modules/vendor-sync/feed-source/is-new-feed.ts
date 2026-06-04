import { LastSeen } from "./types"

/** True if the remote file differs from what the last completed run ingested. */
export function isNewFeed(
  remote: { name: string; modifyTime: number },
  lastSeen: LastSeen | null
): boolean {
  if (!lastSeen) return true
  return remote.name !== lastSeen.name || remote.modifyTime !== lastSeen.modifyTime
}
