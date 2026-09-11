import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only; Playwright owns e2e/*.spec.ts
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
