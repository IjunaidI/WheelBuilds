import { buildModuleStatusReport, formatModuleStatusReport } from '../module-status'

describe('buildModuleStatusReport', () => {
  it('marks every optional module disabled for an empty env', () => {
    const rows = buildModuleStatusReport({})
    expect(rows.length).toBe(8)
    expect(rows.every((r) => r.enabled === false)).toBe(true)
  })

  it('enables modules when their controlling vars are present', () => {
    const env = {
      MINIO_ENDPOINT: 'x', MINIO_ACCESS_KEY: 'x', MINIO_SECRET_KEY: 'secret',
      REDIS_URL: 'redis://x',
      SENDGRID_API_KEY: 'x', SENDGRID_FROM_EMAIL: 'a@b.c',
      RESEND_API_KEY: 'x', RESEND_FROM_EMAIL: 'a@b.c',
      STRIPE_API_KEY: 'x', STRIPE_WEBHOOK_SECRET: 'x',
      VENDOR_WHEELPROS_WHEELS_ENABLED: 'true',
      WHEEL_SIZE_API_KEY: 'x',
      MEILISEARCH_HOST: 'x', MEILISEARCH_ADMIN_KEY: 'x',
    } as NodeJS.ProcessEnv
    const rows = buildModuleStatusReport(env)
    expect(rows.every((r) => r.enabled === true)).toBe(true)
  })

  it('vendor-sync enables on the tires flag alone', () => {
    const rows = buildModuleStatusReport({ VENDOR_WHEELPROS_TIRES_ENABLED: 'true' } as NodeJS.ProcessEnv)
    const vendor = rows.find((r) => r.name.startsWith('Vendor-sync'))!
    expect(vendor.enabled).toBe(true)
  })

  it('format output never leaks a secret value', () => {
    const env = { MINIO_ENDPOINT: 'x', MINIO_ACCESS_KEY: 'x', MINIO_SECRET_KEY: 'TOPSECRET' } as NodeJS.ProcessEnv
    const out = formatModuleStatusReport(buildModuleStatusReport(env))
    expect(out).not.toContain('TOPSECRET')
    expect(out).toContain('MINIO_ENDPOINT')
  })
})
