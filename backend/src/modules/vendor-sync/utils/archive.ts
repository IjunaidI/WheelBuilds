/**
 * Stub for MinIO archive upload. Real implementation in PR 8.
 * For now, returns the local file path as the archive key.
 */
export async function uploadFeedToMinio(
  _filePath: string,
  _vendorCode: string,
  _filename: string
): Promise<string> {
  // In the future this will upload to MinIO and return the object key.
  // For now, just return the local path.
  return _filePath
}
