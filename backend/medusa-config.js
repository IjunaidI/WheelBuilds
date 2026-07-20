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
  VENDOR_SYNC_IMAGE_CHECK_ENABLED,
  VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO,
  VENDOR_SYNC_IMAGE_TTL_DAYS,
  VENDOR_SYNC_IMAGE_CONCURRENCY,
  VENDOR_SYNC_IMAGE_TIMEOUT_MS,
  WHEEL_SIZE_API_KEY,
  WHEEL_SIZE_BASE_URL,
  WHEEL_SIZE_REGION,
  WHEEL_SIZE_TTL_DAYS,
  WHEEL_SIZE_TIMEOUT_MS,
  WHEEL_SIZE_WARM_BATCH,
} from 'lib/constants';
import { buildSearchDocument } from 'modules/vendor-sync/search/build-search-document';
import {
  MEILI_PRODUCT_FIELDS,
  MEILI_SEARCHABLE_ATTRIBUTES,
  MEILI_SYNONYMS,
} from 'modules/vendor-sync/search/meili-index-settings';
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
      // A15: Medusa 2.13.6 defaults jwtExpiresIn to "1d" when unset (verified
      // in the installed framework source). The storefront's _medusa_jwt
      // cookie is set for 7d, so without this the JWT itself expired a day
      // before the cookie did and sessions silently died on day 2.
      jwtExpiresIn: "7d",
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
              // WB-080 D2: capture at authorization. The provider defaults to
              // capture_method "manual", which leaves every order authorize-only;
              // an auth that nobody captures in admin expires after ~7 days and
              // the money is never taken.
              capture: true,
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
        durableArchive: process.env.VENDOR_SYNC_DURABLE_ARCHIVE === 'true',
        dryRun: VENDOR_SYNC_DRY_RUN === 'true',
        allowSampleFeed: VENDOR_ALLOW_SAMPLE_FEED === 'true',
        devMaxRows,
        // WB-115: image reachability gate at staging. `enabled` is a
        // production kill switch that defaults to TRUE (opposite of every
        // other boolean flag in this block) -- `!== 'false'` so it stays on
        // unless explicitly disabled, matching the brief's "default true".
        imageCheck: {
          enabled: VENDOR_SYNC_IMAGE_CHECK_ENABLED !== 'false',
          maxDeadRatio: parseFloat(VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO ?? '0.40'),
          // WB-115 premerge Change 4: these were typed and threaded into the
          // checker (pipeline/image-reachability.ts) from day one but never
          // actually wired to an env var here -- they were permanently stuck
          // at the checker's own defaults (7 days / 24 / 10000ms) with no
          // way to override in production. A malformed value (e.g. a typo'd
          // env var parsing to NaN) is guarded in service.ts's
          // buildImageCheck (Number.isFinite + fallback + warn), mirroring
          // maxDeadRatio's guard in pipeline/stage.ts.
          ttlDays: parseInt(VENDOR_SYNC_IMAGE_TTL_DAYS ?? '7', 10),
          concurrency: parseInt(VENDOR_SYNC_IMAGE_CONCURRENCY ?? '24', 10),
          timeoutMs: parseInt(VENDOR_SYNC_IMAGE_TIMEOUT_MS ?? '10000', 10),
        },
        vendors: {
          'wheelpros-wheels': {
            enabled: VENDOR_WHEELPROS_WHEELS_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_WHEEL_FEED_PATH,
            sftp: wheelSftp,
            // WB-115 premerge: two live dry-runs against the real production
            // feeds (2026-07-20) measured 313/3,914 unique image URLs dead
            // (8.0%). Keep the global default (0.40) -- 5x headroom above
            // the measured baseline.
            maxDeadRatio: 0.40,
          },
          'wheelpros-tires': {
            enabled: VENDOR_WHEELPROS_TIRES_ENABLED === 'true',
            feedPath: VENDOR_WHEELPROS_TIRE_FEED_PATH,
            sftp: tireSftp,
            // WB-115 premerge: the same dry-run measured 103/216 unique tire
            // image URLs dead (47.7%) -- WheelPros genuinely ships dead
            // placeholder URLs for about half their tire lines; this is a
            // TRUE baseline, not a checker malfunction. Business decision
            // (client, explicit): no products without images are allowed,
            // tires included, even though gating on this drops ~35% of the
            // tire catalog (397/1,131 products). 0.70 leaves headroom above
            // the measured 47.7% baseline while still tripping on a
            // catastrophic (~100%) CDN failure. Do NOT raise to 1.0 or
            // disable the breaker for tires.
            maxDeadRatio: 0.70,
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
    // GARAGE-DISABLED (WB-076, 2026-07-09): the account garage is retired —
    // the storefront keeps one active vehicle in the browser cache instead.
    // Module source/tests/migrations are intact and its DB tables were NOT
    // dropped; the store routes under src/api/store/customer/vehicles are 410
    // stubs. Uncomment to restore (and see the other GARAGE-DISABLED seams).
    // { resolve: './src/modules/customer-vehicle' },
    { resolve: './src/modules/newsletter' },
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
            // Widened so the transformer receives variants + metadata + prices;
            // 'status' lets the plugin evict drafted products (WB-089 L1).
            fields: MEILI_PRODUCT_FIELDS,
            indexSettings: {
              searchableAttributes: MEILI_SEARCHABLE_ATTRIBUTES,
              synonyms: MEILI_SYNONYMS,
              displayedAttributes: [
                'id', 'handle', 'title', 'description', 'thumbnail', 'brand',
                'finishes', 'skus',
                'diameters', 'widths', 'offsets', 'bolt_patterns',
                'bolt_patterns_canonical', 'center_bores',
                'tire_sizes', 'fit_specs', 'rim_diameters', 'section_widths',
                'aspect_ratios', 'load_indexes', 'speed_ratings', 'tire_type',
                'price_min', 'price_max', 'created_at', 'product_type',
                // WB-100: availability signal. Docs already carry this field
                // (Task 1's transformer widening); it must be BOTH displayed
                // (so a search hit actually returns `in_stock` for the
                // storefront badge) and filterable (so an "In stock only"
                // toggle can filter on it) — a field only in one array is
                // silently unusable for the other purpose.
                'in_stock',
              ],
              filterableAttributes: [
                'brand', 'finishes', 'diameters', 'widths', 'bolt_patterns',
                'bolt_patterns_canonical', 'offsets', 'center_bores',
                'tire_sizes', 'rim_diameters', 'section_widths',
                'aspect_ratios', 'load_indexes', 'speed_ratings', 'tire_type',
                'price_min', 'price_max', 'product_type',
                // WB-100: see the matching comment in displayedAttributes above.
                'in_stock',
              ],
              sortableAttributes: ['price_min', 'created_at', 'title'],
              pagination: { maxTotalHits: 10000 },
              // WB-088 D9: Meili's default maxValuesPerFacet is 100, so any
              // facet with more distinct values (brand, tire_sizes) silently
              // truncates its counts/options past the 100th. Raised to 500 —
              // an index-config change only (no content re-sync needed), it
              // takes effect on the next backend boot.
              faceting: { maxValuesPerFacet: 500 },
            },
            primaryKey: 'id',
            // The plugin falls back to its DEFAULT transformer when ours returns a
            // falsy value (`transformer?.(doc) ?? defaultTransformer(doc)`), so we
            // must never return null. buildSearchDocument now returns a wheel doc,
            // a tire doc, or null for anything that is neither; map that null case
            // to a minimal doc carrying product_type so downstream product_type
            // filters (storefront wheel discovery, tire discovery) still exclude it.
            // Anything buildSearchDocument skips (non-wheel/tire OR image-less —
            // WB-084) becomes a minimal stub whose product_type matches NO
            // discovery filter, so it is excluded from wheel + tire discovery.
            // Forced constant (not metadata.product_type) so an image-less WHEEL
            // can't slip back in as a product_type:"wheel" stub.
            // WB-100: in_stock:false so a displayed/filtered attribute never
            // references a missing field on this stub (it matches no
            // discovery filter anyway, but keep the doc shape total).
            transformer: (product) =>
              buildSearchDocument(product) ?? {
                id: product.id,
                product_type: 'non-wheel',
                in_stock: false,
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
