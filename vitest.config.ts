import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/..." imports as tsconfig.json, so tests can load app modules
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Unit tests only; Playwright owns e2e/*.spec.ts
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
