import { defineConfig } from "vitest/config"
import path from "path"
export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "src/lib"),
      "@modules": path.resolve(__dirname, "src/modules"),
      "@": path.resolve(__dirname, "src"),
      // Vitest has no "react-server" export condition (that's how Next.js
      // picks server-only's no-op `empty.js` when bundling server
      // components), so importing a server module directly under vitest
      // hits the real index.js and throws. Alias to the package's own
      // no-op build so pure-function exports of server modules (e.g.
      // tire-discovery's get-tire-products.ts) can be unit-tested without
      // weakening the real server-only guard in the Next.js build.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
})
