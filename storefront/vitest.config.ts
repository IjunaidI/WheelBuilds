import { defineConfig } from "vitest/config"
import path from "path"
export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "src/lib"),
      "@modules": path.resolve(__dirname, "src/modules"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
})
