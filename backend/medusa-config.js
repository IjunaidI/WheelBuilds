import { loadEnv, Modules, defineConfig } from '@medusajs/utils';
import {
  ADMIN_CORS,
  AUTH_CORS,
  BACKEND_URL,
  COOKIE_SECRET,
  DATABASE_URL,
  JWT_SECRET,
  REDIS_URL,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SHOULD_DISABLE_ADMIN,
  STORE_CORS,
  STRIPE_API_KEY,
  STRIPE_WEBHOOK_SECRET,
  WORKER_MODE,
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MEILISEARCH_HOST,
  MEILISEARCH_ADMIN_KEY,
  VENDOR_WHEELPROS_WHEELS_ENABLED,
  VENDOR_WHEELPROS_TIRES_ENABLED,
  VENDOR_WHEELPROS_WHEEL_FEED_PATH,
  VENDOR_WHEELPROS_TIRE_FEED_PATH,
  VENDOR_WHEELPROS_WHEEL_SFTP_HOST,
  VENDOR_WHEELPROS_WHEEL_SFTP_PORT,
  VENDOR_WHEELPROS_WHEEL_SFTP_USER,
  VENDOR_WHEELPROS_WHEEL_SFTP_PASSWORD,
  VENDOR_WHEELPROS_WHEEL_SFTP_PRIVATE_KEY,
  VENDOR_WHEELPROS_WHEEL_SFTP_DIR,
  VENDOR_WHEELPROS_WHEEL_SFTP_PATTERN,
  VENDOR_WHEELPROS_TIRE_SFTP_HOST,
  VENDOR_WHEELPROS_TIRE_SFTP_PORT,
  VENDOR_WHEELPROS_TIRE_SFTP_USER,
  VENDOR_WHEELPROS_TIRE_SFTP_PASSWORD,
  VENDOR_WHEELPROS_TIRE_SFTP_PRIVATE_KEY,
  VENDOR_WHEELPROS_TIRE_SFTP_DIR,
  VENDOR_WHEELPROS_TIRE_SFTP_PATTERN,
  VENDOR_SYNC_FEED_ARCHIVE_BUCKET,
  VENDOR_SYNC_DISCONTINUE_THRESHOLD,
  VENDOR_SYNC_APPLY_CONCURRENCY,
  VENDOR_SYNC_APPLY_MAX_ATTEMPTS,
  VENDOR_SYNC_DRY_RUN,
  VENDOR_ALLOW_SAMPLE_FEED,
  WHEEL_SIZE_API_KEY,
  WHEEL_SIZE_BASE_URL,
  WHEEL_SIZE_REGION,
  WHEEL_SIZE_TTL_DAYS,
  WHEEL_SIZE_TIMEOUT_MS,
  WHEEL_SIZE_WARM_BATCH,
} from 'lib/constants';
import { buildSearchDocument } from 'modules/vendor-sync/search/build-search-document';
import { resolveDevMaxRows } from 'lib/dev-max-rows';
import { buildModuleStatusReport, formatModuleStatusReport } from 'lib/module-status';

loadEnv(process.env.NODE_ENV, process.cwd());

const buildSftp = (host, port, user, pass, key, dir, pattern) =>
  host ? {
    host,
    port: port ? parseInt(port, 10) : 22,
    username: user,
    password: pass || undefined,
    privateKey: key || undefined,
    remoteDir: dir,
    filePattern: pattern || '.*\\.csv$',
  } : undefined

const wheelSftp = buildSftp(
  VENDOR_WHEELPROS_WHEEL_SFTP_HOST, VENDOR_WHEELPROS_WHEEL_SFTP_PORT, VENDOR_WHEELPROS_WHEEL_SFTP_USER,
  VENDOR_WHEELPROS_WHEEL_SFTP_PASSWORD, VENDOR_WHEELPROS_WHEEL_SFTP_PRIVATE_KEY,
  VENDOR_WHEELPROS_WHEEL_SFTP_DIR, VENDOR_WHEELPROS_WHEEL_SFTP_PATTERN)
const tireSftp = buildSftp(
  VENDOR_WHEELPROS_TIRE_SFTP_HOST, VENDOR_WHEELPROS_TIRE_SFTP_PORT, VENDOR_WHEELPROS_TIRE_SFTP_USER,
  VENDOR_WHEELPROS_TIRE_SFTP_PASSWORD, VENDOR_WHEELPROS_TIRE_SFTP_PRIVATE_KEY,
  VENDOR_WHEELPROS_TIRE_SFTP_DIR, VENDOR_WHEELPROS_TIRE_SFTP_PATTERN)

// Vendor-sync feed-truncation cap (WB-027). Explicit opt-in: active ONLY when
// VENDOR_SYNC_DEV_MAX_ROWS is set to a positive integer — no NODE_ENV coupling, so a
// NODE_ENV=staging box never silently truncates the feed. Local dev opts in via
// .env.template (VENDOR_SYNC_DEV_MAX_ROWS=1000) to keep first-import fast.
const devMaxRows = resolveDevMaxRows(process.env.VENDOR_SYNC_DEV_MAX_ROWS)

const medusaConfig = {
  projectConfig: {
    databaseUrl: DATABASE_URL,
    databaseLogging: false,
    redisUrl: REDIS_URL,
    workerMode: WORKER_MODE,
    http: {
      adminCors: ADMIN_CORS,
      authCors: AUTH_CORS,
      storeCors: STORE_CORS,
      jwtSecret: JWT_SECRET,
      cookieSecret: COOKIE_SECRET
    },
    build: {
      rollupOptions: {
        external: ["@medusajs/dashboard", "@medusajs/admin-shared"]
      }
    }
  },
  admin: {
    backendUrl: BACKEND_URL,
    disable: SHOULD_DISABLE_ADMIN,
  },
  modules: [
    {
      key: Modules.FILE,
      resolve: '@medusajs/file',
      options: {
        providers: [
          ...(MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY ? [{
            resolve: './src/modules/minio-file',
            id: 'minio',
            options: {
              endPoint: MINIO_ENDPOINT,
              accessKey: MINIO_ACCESS_KEY,
              secretKey: MINIO_SECRET_KEY,
              bucket: MINIO_BUCKET // Optional, default: medusa-media
            }
          }] : [{
            resolve: '@medusajs/file-local',
            id: 'local',
            options: {
              upload_dir: 'static',
              backend_url: `${BACKEND_URL}/static`
            }
          }])
        ]
      }
    },
    ...(REDIS_URL ? [{
      key: Modules.EVENT_BUS,
      resolve: '@medusajs/event-bus-redis',
      options: {
        redisUrl: REDIS_URL
      }
    },
    {
      key: Modules.WORKFLOW_ENGINE,
      resolve: '@medusajs/workflow-engine-redis',
      options: {
        redis: {
          url: REDIS_URL,
        }
      }
    }] : []),
    ...(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL || RESEND_API_KEY && RESEND_FROM_EMAIL ? [{
      key: Modules.NOTIFICATION,
      resolve: '@medusajs/notification',
      options: {
        providers: [
          ...(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL ? [{
            resolve: '@medusajs/notification-sendgrid',
            id: 'sendgrid',
            options: {
              channels: ['email'],
              api_key: SENDGRID_API_KEY,
              from: SENDGRID_FROM_EMAIL,
            }
          }] : []),
          ...(RESEND_API_KEY && RESEND_FROM_EMAIL ? [{
            resolve: './src/modules/email-notifications',
            id: 'resend',
            options: {
              channels: ['email'],
              api_key: RESEND_API_KEY,
              from: RESEND_FROM_EMAIL,
            },
          }] : []),
        ]
      }
    }] : []),
    ...(STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET ? [{
      key: Modules.PAYMENT,
      resolve: '@medusajs/payment',
      options: {
        providers: [
          {
            resolve: '@medusajs/payment-stripe',
            id: 'stripe',
            options: {
              apiKey: STRIPE_API_KEY,
              webhookSecret: STRIPE_WEBHOOK_SECRET,
            },
          },
        ],
      },
    }] : []),
    ...((VENDOR_WHEELPROS_WHEELS_ENABLED === 'true' || VENDOR_WHEELPROS_TIRES_ENABLED === 'true') ? [{
      resolve: './src/modules/vendor-sync',
      options: {
        discontinueThreshold: parseFloat(VENDOR_SYNC_DISCONTINUE_THRESHOLD ?? '0.05'),
        applyConcurrency: parseInt(VENDOR_SYNC_APPLY_CONCURRENCY ?? '8', 10),
        applyMaxAttempts: parseInt(VENDOR_SYNC_APPLY_MAX_ATTEMPTS ?? '3', 10),
        archiveBucket: VENDOR_SYNC_FEED_ARCHIVE_BUCKET ?? 'vendor-feeds',
        dryRun: VENDOR_SYNC_DRY_RUN === 'true',
        allowSampleFeed: VENDOR_ALLOW_SAMPLE_FEED === 'true',
        devMaxRows,
        vendors: {
          'wheelpros-wheels': {
            enabled: VENDOR_WHEELPROS_WHEELS_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_WHEEL_FEED_PATH,
            sftp: wheelSftp,
          },
          'wheelpros-tires': {
            enabled: VENDOR_WHEELPROS_TIRES_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_TIRE_FEED_PATH,
            sftp: tireSftp,
          },
        },
      },
    }] : []),
    ...(WHEEL_SIZE_API_KEY ? [{
      resolve: './src/modules/wheel-size',
      options: {
        apiKey: WHEEL_SIZE_API_KEY,
        baseUrl: WHEEL_SIZE_BASE_URL ?? 'https://api.wheel-size.com/v2',
        defaultRegion: WHEEL_SIZE_REGION ?? 'usdm',
        dailyCeiling: 5000,
        ttlDays: WHEEL_SIZE_TTL_DAYS ? Number(WHEEL_SIZE_TTL_DAYS) : 90,
        requestTimeoutMs: WHEEL_SIZE_TIMEOUT_MS ? Number(WHEEL_SIZE_TIMEOUT_MS) : 5000,
        warmBatchSize: WHEEL_SIZE_WARM_BATCH ? Number(WHEEL_SIZE_WARM_BATCH) : 200,
      },
    }] : []),
    { resolve: './src/modules/customer-vehicle' },
  ],
  plugins: [
  ...(MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY ? [{
      resolve: '@rokmohar/medusa-plugin-meilisearch',
      options: {
        config: {
          host: MEILISEARCH_HOST,
          apiKey: MEILISEARCH_ADMIN_KEY
        },
        settings: {
          products: {
            type: 'products',
            enabled: true,
            // Widened so the transformer receives variants + metadata + prices.
            fields: [
              'id', 'title', 'description', 'handle', 'thumbnail', 'created_at',
              'metadata',
              'variants.sku', 'variants.metadata',
              'variants.prices.amount', 'variants.prices.currency_code',
            ],
            indexSettings: {
              searchableAttributes: ['title', 'brand', 'skus'],
              displayedAttributes: [
                'id', 'handle', 'title', 'description', 'thumbnail', 'brand',
                'finish', 'skus',
                'diameters', 'widths', 'offsets', 'bolt_patterns',
                'bolt_patterns_canonical', 'center_bores',
                'price_min', 'price_max', 'created_at', 'product_type',
              ],
              filterableAttributes: [
                'brand', 'finish', 'diameters', 'widths', 'bolt_patterns',
                'bolt_patterns_canonical', 'offsets', 'center_bores',
                'price_min', 'price_max', 'product_type',
              ],
              sortableAttributes: ['price_min', 'created_at', 'title'],
            },
            primaryKey: 'id',
            // The plugin falls back to its DEFAULT transformer when ours returns a
            // falsy value (`transformer?.(doc) ?? defaultTransformer(doc)`), so we
            // must never return null. buildSearchDocument returns null for
            // non-wheels; map that to a minimal doc carrying product_type so the
            // storefront's `product_type = "wheel"` filter excludes it (tires are
            // a later spec).
            transformer: (product) =>
              buildSearchDocument(product) ?? {
                id: product.id,
                product_type: product?.metadata?.product_type || 'non-wheel',
              },
          }
        }
      }
    }] : [])
  ]
};

// NOTE: do NOT log the resolved config — it embeds plaintext secrets (DATABASE_URL,
// JWT/COOKIE secrets, Stripe + SFTP + Meilisearch keys) that Railway captures into deploy
// logs. The upstream boilerplate's `console.log(JSON.stringify(medusaConfig, …))` was a
// credential-disclosure bug; intentionally removed (WB-049).

// WB-010: log which optional modules are enabled/disabled (names + booleans ONLY — never
// values, per WB-049) so a silently-missing module is diagnosable from deploy logs.
console.log(formatModuleStatusReport(buildModuleStatusReport(process.env)));

export default defineConfig(medusaConfig);
