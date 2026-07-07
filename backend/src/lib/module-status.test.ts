import { buildModuleStatusReport } from './module-status';

describe('module-status', () => {
  describe('buildModuleStatusReport', () => {
    it('reports unset env var as disabled', () => {
      const env = {};
      const report = buildModuleStatusReport(env);
      const fileRow = report.find((r) => r.name === 'File: MinIO (else local disk)');
      expect(fileRow?.enabled).toBe(false);
    });

    it('reports set env vars as enabled', () => {
      const env = {
        MINIO_ENDPOINT: 'http://localhost:9000',
        MINIO_ACCESS_KEY: 'minioadmin',
        MINIO_SECRET_KEY: 'minioadmin',
      };
      const report = buildModuleStatusReport(env);
      const fileRow = report.find((r) => r.name === 'File: MinIO (else local disk)');
      expect(fileRow?.enabled).toBe(true);
    });

    it('reports whitespace-only env vars as enabled (mirrors medusa-config raw truthiness)', () => {
      const env = {
        MINIO_ENDPOINT: '   ',
        MINIO_ACCESS_KEY: '\t',
        MINIO_SECRET_KEY: '\n',
      };
      const report = buildModuleStatusReport(env);
      const fileRow = report.find((r) => r.name === 'File: MinIO (else local disk)');
      // Whitespace-only strings are truthy in JavaScript, so they should report as enabled,
      // matching medusa-config.js line 117: (MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY)
      expect(fileRow?.enabled).toBe(true);
    });

    it('reports Redis as disabled when REDIS_URL is unset', () => {
      const env = {};
      const report = buildModuleStatusReport(env);
      const redisRow = report.find((r) => r.name === 'Redis event-bus + workflow');
      expect(redisRow?.enabled).toBe(false);
    });

    it('reports Redis as enabled when REDIS_URL is set', () => {
      const env = { REDIS_URL: 'redis://localhost:6379' };
      const report = buildModuleStatusReport(env);
      const redisRow = report.find((r) => r.name === 'Redis event-bus + workflow');
      expect(redisRow?.enabled).toBe(true);
    });

    it('reports Redis as enabled when REDIS_URL is whitespace-only', () => {
      const env = { REDIS_URL: '  ' };
      const report = buildModuleStatusReport(env);
      const redisRow = report.find((r) => r.name === 'Redis event-bus + workflow');
      // Whitespace-only strings are truthy, matching medusa-config.js line 137: (REDIS_URL ? [...] : [])
      expect(redisRow?.enabled).toBe(true);
    });

    it('reports wheel-size fitment as disabled when WHEEL_SIZE_API_KEY is unset', () => {
      const env = {};
      const report = buildModuleStatusReport(env);
      const wheelSizeRow = report.find((r) => r.name === 'wheel-size fitment');
      expect(wheelSizeRow?.enabled).toBe(false);
    });

    it('reports wheel-size fitment as enabled when WHEEL_SIZE_API_KEY is set', () => {
      const env = { WHEEL_SIZE_API_KEY: 'test-key' };
      const report = buildModuleStatusReport(env);
      const wheelSizeRow = report.find((r) => r.name === 'wheel-size fitment');
      expect(wheelSizeRow?.enabled).toBe(true);
    });

    it('reports wheel-size fitment as enabled when WHEEL_SIZE_API_KEY is whitespace-only', () => {
      const env = { WHEEL_SIZE_API_KEY: '   ' };
      const report = buildModuleStatusReport(env);
      const wheelSizeRow = report.find((r) => r.name === 'wheel-size fitment');
      // Whitespace-only strings are truthy, matching medusa-config.js line 220: (WHEEL_SIZE_API_KEY ? [...] : [])
      expect(wheelSizeRow?.enabled).toBe(true);
    });

    it('reports Meilisearch as disabled when both env vars are unset', () => {
      const env = {};
      const report = buildModuleStatusReport(env);
      const meilisearchRow = report.find((r) => r.name === 'Meilisearch');
      expect(meilisearchRow?.enabled).toBe(false);
    });

    it('reports Meilisearch as enabled when both env vars are set', () => {
      const env = {
        MEILISEARCH_HOST: 'http://localhost:7700',
        MEILISEARCH_ADMIN_KEY: 'masterkey',
      };
      const report = buildModuleStatusReport(env);
      const meilisearchRow = report.find((r) => r.name === 'Meilisearch');
      expect(meilisearchRow?.enabled).toBe(true);
    });

    it('reports Meilisearch as enabled when both env vars are whitespace-only', () => {
      const env = {
        MEILISEARCH_HOST: '\t',
        MEILISEARCH_ADMIN_KEY: '\n',
      };
      const report = buildModuleStatusReport(env);
      const meilisearchRow = report.find((r) => r.name === 'Meilisearch');
      // Whitespace-only strings are truthy, matching medusa-config.js line 236: (MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY ? [...] : [])
      expect(meilisearchRow?.enabled).toBe(true);
    });

    it('reports Stripe as disabled when either env var is unset', () => {
      const env = { STRIPE_API_KEY: 'sk_test_...' };
      const report = buildModuleStatusReport(env);
      const stripeRow = report.find((r) => r.name === 'Payment: Stripe');
      expect(stripeRow?.enabled).toBe(false);
    });

    it('reports Stripe as enabled when both env vars are set', () => {
      const env = {
        STRIPE_API_KEY: 'sk_test_...',
        STRIPE_WEBHOOK_SECRET: 'whsec_...',
      };
      const report = buildModuleStatusReport(env);
      const stripeRow = report.find((r) => r.name === 'Payment: Stripe');
      expect(stripeRow?.enabled).toBe(true);
    });

    it('reports Stripe as enabled when both env vars are whitespace-only', () => {
      const env = {
        STRIPE_API_KEY: '  ',
        STRIPE_WEBHOOK_SECRET: '\t',
      };
      const report = buildModuleStatusReport(env);
      const stripeRow = report.find((r) => r.name === 'Payment: Stripe');
      // Whitespace-only strings are truthy, matching medusa-config.js line 179: (STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET ? [...] : [])
      expect(stripeRow?.enabled).toBe(true);
    });
  });
});
