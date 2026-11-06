import { defineConfig } from "vitest/config";

// Integração: exige os nós locais (npm run nodes:up). Rede: somente localhost.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.int.test.ts", "apps/*/test/**/*.int.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
