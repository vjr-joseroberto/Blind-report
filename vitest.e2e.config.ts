import { defineConfig } from "vitest/config";

// End to end, by script and without a browser: requires the local nodes (npm run test:e2e brings them up and down).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 400_000,
    fileParallelism: false,
  },
});
