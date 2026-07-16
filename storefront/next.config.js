const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      { // WheelPros vendor product imagery — vendor-sync writes these URLs as product thumbnails
        protocol: "https",
        hostname: "assets.wheelpros.com",
      },
      {
        protocol: "https",
        hostname: "images.wheelpros.com",
      },
      ...(process.env.NEXT_PUBLIC_BASE_URL
        ? [{ // Note: needed to serve images from /public folder
            protocol: process.env.NEXT_PUBLIC_BASE_URL.startsWith("https") ? "https" : "http",
            hostname: process.env.NEXT_PUBLIC_BASE_URL.replace(/^https?:\/\//, ""),
          }]
        : []),
      ...(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
        ? [{ // Note: only needed when using local-file for product media
            protocol: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.startsWith("https") ? "https" : "http",
            hostname: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.replace(/^https?:\/\//, ""),
          }]
        : []),
      ...(process.env.NEXT_PUBLIC_MINIO_ENDPOINT ? [{ // Note: needed when using MinIO bucket storage for media
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_MINIO_ENDPOINT,
      }] : []),
    ],
  },
  serverRuntimeConfig: {
    port: process.env.PORT || 3000
  },
  async redirects() {
    // Discovery moved to Meilisearch-backed /store; these routes are retired
    // (WB-085 X9) but old links/bookmarks/search-engine results still point
    // at them.
    return [
      { source: "/:cc/results/:query", destination: "/:cc/store?q=:query", permanent: true },
      { source: "/:cc/search", destination: "/:cc/store", permanent: true },
      // WB-086 D1: /categories/* retired — pre-Discovery listing pages fetched
      // 100 products, sorted/sliced in memory, but reported the real total
      // count (advertising ~144 pages, most empty). /store and /tires are the
      // real Meilisearch-backed replacements. Specific rules before the
      // catch-all — order is load-bearing. The catch-all's destination is a
      // constant (no `:rest` interpolated into it): a repeating param can't be
      // substituted into a non-repeating slot, which is exactly what shipped a
      // live 500 in WB-085 (26db55d).
      { source: "/:cc/categories/wheels", destination: "/:cc/store", permanent: true },
      { source: "/:cc/categories/tires", destination: "/:cc/tires", permanent: true },
      { source: "/:cc/categories/:rest*", destination: "/:cc/store", permanent: true },
    ]
  },
  webpack: (config, { dev, nextRuntime }) => {
    // Next 15.5.x dev mode pushes an `EvalSourceMapDevToolPlugin` into every
    // bundle, including the Edge runtime bundle that runs middleware. Edge
    // rejects eval() ("Code generation from strings disallowed"), so strip the
    // plugin from the Edge bundle. Setting `config.devtool` does nothing here —
    // Next already sets it to `false` and emits eval via the plugin.
    if (dev && nextRuntime === "edge" && Array.isArray(config.plugins)) {
      config.plugins = config.plugins.filter(
        (plugin) => plugin?.constructor?.name !== "EvalSourceMapDevToolPlugin"
      )
    }
    return config
  },
}

module.exports = nextConfig
