/** SFTP connection + selection config for one vendor feed. */
export interface SftpConfig {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
  remoteDir: string
  /** Regex SOURCE string (compiled at use). Defaults to '.*\\.csv$'. */
  filePattern: string
}

/** Where one vendor's feed comes from. SFTP wins over feedPath. */
export interface FeedConfig {
  feedPath?: string
  sftp?: SftpConfig
}

export interface RemoteFile {
  name: string
  /** Epoch milliseconds. */
  modifyTime: number
  size: number
}

export interface LastSeen {
  name: string
  modifyTime: number
}

export type ResolvedFeed =
  | { kind: "file"; csvPath: string; sourceName: string; modifyTime: number | null }
  | { kind: "unchanged"; sourceName: string; modifyTime: number }
  | { kind: "empty" }
  | { kind: "default" }
