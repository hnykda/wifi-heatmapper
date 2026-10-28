import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/..." imports as tsconfig.json, so tests can load app modules
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Server-only modules (import "server-only") are what the tests load;
      // outside Next.js the marker package would throw, so use its no-op.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    // Unit tests only; Playwright owns e2e/*.spec.ts
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
