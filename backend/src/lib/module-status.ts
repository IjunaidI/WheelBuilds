/**
 * Startup report of which OPTIONAL modules are enabled/disabled and the env var(s) that
 * control each (WB-010). Mirrors the exact conditions in medusa-config.js. The report
 * carries ONLY booleans and env-var NAMES — never a secret value (WB-049).
 */
export interface ModuleStatusRow {
  name: string
  enabled: boolean
  controlledBy: string
}

export function buildModuleStatusReport(env: NodeJS.ProcessEnv): ModuleStatusRow[] {
  const has = (k: string) => typeof env[k] === 'string' && env[k]!.trim() !== ''
  const isTrue = (k: string) => env[k] === 'true'
  return [
    {
      name: 'File: MinIO (else local disk)',
      enabled: has('MINIO_ENDPOINT') && has('MINIO_ACCESS_KEY') && has('MINIO_SECRET_KEY'),
      controlledBy: 'MINIO_ENDPOINT,MINIO_ACCESS_KEY,MINIO_SECRET_KEY',
    },
    {
      name: 'Redis event-bus + workflow',
      enabled: has('REDIS_URL'),
      controlledBy: 'REDIS_URL',
    },
    {
      name: 'Notification: SendGrid',
      enabled: has('SENDGRID_API_KEY') && (has('SENDGRID_FROM_EMAIL') || has('SENDGRID_FROM')),
      controlledBy: 'SENDGRID_API_KEY,SENDGRID_FROM_EMAIL',
    },
    {
      name: 'Notification: Resend',
      enabled: has('RESEND_API_KEY') && (has('RESEND_FROM_EMAIL') || has('RESEND_FROM')),
      controlledBy: 'RESEND_API_KEY,RESEND_FROM_EMAIL',
    },
    {
      name: 'Payment: Stripe',
      enabled: has('STRIPE_API_KEY') && has('STRIPE_WEBHOOK_SECRET'),
      controlledBy: 'STRIPE_API_KEY,STRIPE_WEBHOOK_SECRET',
    },
    {
      name: 'Vendor-sync',
      enabled: isTrue('VENDOR_WHEELPROS_WHEELS_ENABLED') || isTrue('VENDOR_WHEELPROS_TIRES_ENABLED'),
      controlledBy: 'VENDOR_WHEELPROS_WHEELS_ENABLED,VENDOR_WHEELPROS_TIRES_ENABLED',
    },
    {
      name: 'wheel-size fitment',
      enabled: has('WHEEL_SIZE_API_KEY'),
      controlledBy: 'WHEEL_SIZE_API_KEY',
    },
    {
      name: 'Meilisearch',
      enabled: has('MEILISEARCH_HOST') && has('MEILISEARCH_ADMIN_KEY'),
      controlledBy: 'MEILISEARCH_HOST,MEILISEARCH_ADMIN_KEY',
    },
  ]
}

export function formatModuleStatusReport(rows: ModuleStatusRow[]): string {
  const width = Math.max(...rows.map((r) => r.name.length))
  const lines = rows.map((r) => {
    const status = r.enabled ? 'ENABLED ' : 'DISABLED'
    return `  ${r.name.padEnd(width)}  ${status}  (${r.controlledBy})`
  })
  return ['[modules] optional module status:', ...lines].join('\n')
}
