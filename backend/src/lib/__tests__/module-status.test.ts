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

  // WB-075 DOC4: has() must mirror medusa-config.js's plain `if (X)` truthiness for every
  // shape of env value, not just "set vs unset". A prior fix regressed the empty-string case.
  it('reports whitespace-only env vars as enabled (mirrors medusa-config raw truthiness)', () => {
    const env = {
      MINIO_ENDPOINT: '   ', MINIO_ACCESS_KEY: '\t', MINIO_SECRET_KEY: '\n',
      WHEEL_SIZE_API_KEY: '  ',
      MEILISEARCH_HOST: '\t', MEILISEARCH_ADMIN_KEY: '\n',
    } as NodeJS.ProcessEnv
    const rows = buildModuleStatusReport(env)
    // Whitespace-only strings are truthy in JS, matching e.g. medusa-config.js:117
    // `(MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY ? ... )`, :220 `(WHEEL_SIZE_API_KEY ? ...)`,
    // and :236 `(MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY ? ...)`.
    expect(rows.find((r) => r.name === 'File: MinIO (else local disk)')?.enabled).toBe(true)
    expect(rows.find((r) => r.name === 'wheel-size fitment')?.enabled).toBe(true)
    expect(rows.find((r) => r.name === 'Meilisearch')?.enabled).toBe(true)
  })

  it('reports empty-string env vars as disabled (mirrors medusa-config raw falsiness)', () => {
    const env = {
      MINIO_ENDPOINT: '', MINIO_ACCESS_KEY: '', MINIO_SECRET_KEY: '',
      WHEEL_SIZE_API_KEY: '',
      MEILISEARCH_HOST: '', MEILISEARCH_ADMIN_KEY: '',
    } as NodeJS.ProcessEnv
    const rows = buildModuleStatusReport(env)
    // An empty string is falsy in JS, so medusa-config.js's plain `if (X)` / `X && ...` checks
    // do NOT register these modules — the report must not claim ENABLED here.
    expect(rows.find((r) => r.name === 'File: MinIO (else local disk)')?.enabled).toBe(false)
    expect(rows.find((r) => r.name === 'wheel-size fitment')?.enabled).toBe(false)
    expect(rows.find((r) => r.name === 'Meilisearch')?.enabled).toBe(false)
  })

  it('format output never leaks a secret value', () => {
    const env = { MINIO_ENDPOINT: 'x', MINIO_ACCESS_KEY: 'x', MINIO_SECRET_KEY: 'TOPSECRET' } as NodeJS.ProcessEnv
    const out = formatModuleStatusReport(buildModuleStatusReport(env))
    expect(out).not.toContain('TOPSECRET')
    expect(out).toContain('MINIO_ENDPOINT')
  })
})
