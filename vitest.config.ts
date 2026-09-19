import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "bench/test/**/*.test.ts",
      "evals/test/**/*.test.ts",
    ],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
