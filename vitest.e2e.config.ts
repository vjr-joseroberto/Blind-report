import { defineConfig } from "vitest/config";

// Ponta a ponta, por script e sem navegador: exige os nós locais (npm run test:e2e os sobe e derruba).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 400_000,
    fileParallelism: false,
  },
});
