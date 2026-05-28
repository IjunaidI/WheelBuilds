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
  VENDOR_SYNC_FEED_ARCHIVE_BUCKET,
  VENDOR_SYNC_DISCONTINUE_THRESHOLD,
  VENDOR_SYNC_APPLY_CONCURRENCY,
  VENDOR_SYNC_DRY_RUN,
} from 'lib/constants';
import { buildSearchDocument } from 'modules/vendor-sync/search/build-search-document';

loadEnv(process.env.NODE_ENV, process.cwd());

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
        archiveBucket: VENDOR_SYNC_FEED_ARCHIVE_BUCKET ?? 'vendor-feeds',
        dryRun: VENDOR_SYNC_DRY_RUN === 'true',
        vendors: {
          'wheelpros-wheels': {
            enabled: VENDOR_WHEELPROS_WHEELS_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_WHEEL_FEED_PATH,
          },
          'wheelpros-tires': {
            enabled: VENDOR_WHEELPROS_TIRES_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_TIRE_FEED_PATH,
          },
        },
      },
    }] : []),
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
                'id', 'handle', 'title', 'thumbnail', 'brand', 'finish', 'skus',
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
                product_type:
                  (product.metadata && product.metadata.product_type) || 'non-wheel',
              },
          }
        }
      }
    }] : [])
  ]
};

console.log(JSON.stringify(medusaConfig, null, 2));
export default defineConfig(medusaConfig);
