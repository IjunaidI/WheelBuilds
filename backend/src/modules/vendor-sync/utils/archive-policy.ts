/**
 * WB-017: durable archiving is EXPLICIT opt-in. Never write vendor cost CSVs
 * to the default public MinIO media bucket by accident — only upload when the
 * operator has turned it on AND object storage is configured.
 */
export function shouldUploadArchive(durableArchiveEnabled: boolean, minioConfigured: boolean): boolean {
  return durableArchiveEnabled && minioConfigured
}
