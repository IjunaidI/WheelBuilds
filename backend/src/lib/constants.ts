import { loadEnv } from '@medusajs/framework/utils'

import { assertValue } from 'utils/assert-value'
import { resolveCors } from 'lib/cors'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

/**
 * Is development environment
 */
export const IS_DEV = process.env.NODE_ENV === 'development'

/**
 * Is production environment
 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * Public URL for the backend
 */
export const BACKEND_URL = process.env.BACKEND_PUBLIC_URL ?? process.env.RAILWAY_PUBLIC_DOMAIN_VALUE ?? 'http://localhost:9000'

/**
 * Database URL for Postgres instance used by the backend
 */
export const DATABASE_URL = assertValue(
  process.env.DATABASE_URL,
  'Environment variable for DATABASE_URL is not set',
)

/**
 * (optional) Redis URL for Redis instance used by the backend
 */
export const REDIS_URL = process.env.REDIS_URL;

/**
 * Admin CORS origins. Required in production; dev falls back to localhost (WB-039).
 */
export const ADMIN_CORS = resolveCors(process.env.ADMIN_CORS, {
  isProduction: IS_PRODUCTION,
  devDefault: 'http://localhost:7000,http://localhost:7001',
  name: 'ADMIN_CORS',
});

/**
 * Auth CORS origins. Required in production; dev falls back to localhost (WB-039).
 */
export const AUTH_CORS = resolveCors(process.env.AUTH_CORS, {
  isProduction: IS_PRODUCTION,
  devDefault: 'http://localhost:7000,http://localhost:7001',
  name: 'AUTH_CORS',
});

/**
 * Store/frontend CORS origins. Required in production; dev falls back to localhost (WB-039).
 */
export const STORE_CORS = resolveCors(process.env.STORE_CORS, {
  isProduction: IS_PRODUCTION,
  devDefault: 'http://localhost:8000',
  name: 'STORE_CORS',
});

/**
 * JWT Secret used for signing JWT tokens
 */
export const JWT_SECRET = assertValue(
  process.env.JWT_SECRET,
  'Environment variable for JWT_SECRET is not set',
)

/**
 * Cookie secret used for signing cookies
 */
export const COOKIE_SECRET = assertValue(
  process.env.COOKIE_SECRET,
  'Environment variable for COOKIE_SECRET is not set',
)

/**
 * (optional) Minio configuration for file storage
 */
export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
export const MINIO_BUCKET = process.env.MINIO_BUCKET; // Optional, if not set bucket will be called: medusa-media

/**
 * (optional) Resend API Key and from Email - do not set if using SendGrid
 */
export const RESEND_API_KEY = process.env.RESEND_API_KEY;
export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM;

/**
 * (optionl) SendGrid API Key and from Email - do not set if using Resend
 */
export const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
export const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM;

/**
 * (optional) Stripe API key and webhook secret
 */
export const STRIPE_API_KEY = process.env.STRIPE_API_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * (optional) Meilisearch configuration
 */
export const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST;
export const MEILISEARCH_ADMIN_KEY = process.env.MEILISEARCH_ADMIN_KEY;

/**
 * Worker mode
 */
export const WORKER_MODE =
  (process.env.MEDUSA_WORKER_MODE as 'worker' | 'server' | 'shared' | undefined) ?? 'shared'

/**
 * Disable Admin
 */
export const SHOULD_DISABLE_ADMIN = process.env.MEDUSA_DISABLE_ADMIN === 'true'

/**
 * (optional) Vendor Sync configuration
 */
export const VENDOR_SYNC_FEED_ARCHIVE_BUCKET = process.env.VENDOR_SYNC_FEED_ARCHIVE_BUCKET
export const VENDOR_SYNC_DISCONTINUE_THRESHOLD = process.env.VENDOR_SYNC_DISCONTINUE_THRESHOLD
export const VENDOR_SYNC_APPLY_CONCURRENCY = process.env.VENDOR_SYNC_APPLY_CONCURRENCY
export const VENDOR_SYNC_DRY_RUN = process.env.VENDOR_SYNC_DRY_RUN
export const VENDOR_ALLOW_SAMPLE_FEED = process.env.VENDOR_ALLOW_SAMPLE_FEED

export const VENDOR_WHEELPROS_WHEELS_ENABLED = process.env.VENDOR_WHEELPROS_WHEELS_ENABLED
export const VENDOR_WHEELPROS_WHEEL_FEED_PATH = process.env.VENDOR_WHEELPROS_WHEEL_FEED_PATH
export const VENDOR_WHEELPROS_TIRES_ENABLED = process.env.VENDOR_WHEELPROS_TIRES_ENABLED
export const VENDOR_WHEELPROS_TIRE_FEED_PATH = process.env.VENDOR_WHEELPROS_TIRE_FEED_PATH

export const VENDOR_WHEELPROS_WHEEL_SFTP_HOST = process.env.VENDOR_WHEELPROS_WHEEL_SFTP_HOST
export const VENDOR_WHEELPROS_WHEEL_SFTP_PORT = process.env.VENDOR_WHEELPROS_WHEEL_SFTP_PORT
export const VENDOR_WHEELPROS_WHEEL_SFTP_USER = process.env.VENDOR_WHEELPROS_WHEEL_SFTP_USER
export const VENDOR_WHEELPROS_WHEEL_SFTP_PASSWORD = process.env.VENDOR_WHEELPROS_WHEEL_SFTP_PASSWORD
export const VENDOR_WHEELPROS_WHEEL_SFTP_PRIVATE_KEY = process.env.VENDOR_WHEELPROS_WHEEL_SFTP_PRIVATE_KEY
export const VENDOR_WHEELPROS_WHEEL_SFTP_DIR = process.env.VENDOR_WHEELPROS_WHEEL_SFTP_DIR
export const VENDOR_WHEELPROS_WHEEL_SFTP_PATTERN = process.env.VENDOR_WHEELPROS_WHEEL_SFTP_PATTERN
export const VENDOR_WHEELPROS_TIRE_SFTP_HOST = process.env.VENDOR_WHEELPROS_TIRE_SFTP_HOST
export const VENDOR_WHEELPROS_TIRE_SFTP_PORT = process.env.VENDOR_WHEELPROS_TIRE_SFTP_PORT
export const VENDOR_WHEELPROS_TIRE_SFTP_USER = process.env.VENDOR_WHEELPROS_TIRE_SFTP_USER
export const VENDOR_WHEELPROS_TIRE_SFTP_PASSWORD = process.env.VENDOR_WHEELPROS_TIRE_SFTP_PASSWORD
export const VENDOR_WHEELPROS_TIRE_SFTP_PRIVATE_KEY = process.env.VENDOR_WHEELPROS_TIRE_SFTP_PRIVATE_KEY
export const VENDOR_WHEELPROS_TIRE_SFTP_DIR = process.env.VENDOR_WHEELPROS_TIRE_SFTP_DIR
export const VENDOR_WHEELPROS_TIRE_SFTP_PATTERN = process.env.VENDOR_WHEELPROS_TIRE_SFTP_PATTERN

/**
 * (optional) wheel-size.com API configuration
 */
export const WHEEL_SIZE_API_KEY = process.env.WHEEL_SIZE_API_KEY
export const WHEEL_SIZE_BASE_URL = process.env.WHEEL_SIZE_BASE_URL
export const WHEEL_SIZE_REGION = process.env.WHEEL_SIZE_REGION
