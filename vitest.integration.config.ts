import { defineConfig } from "vitest/config";

// Integration: requires the local nodes (npm run nodes:up). Network: localhost only.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.int.test.ts", "apps/*/test/**/*.int.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
