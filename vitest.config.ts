import { defineConfig } from "vitest/config";

// All tests are Node scripts (no browser). Integration, E2E and validation run through their own scripts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "tests/contract/**/*.test.ts"],
    exclude: ["**/*.int.test.ts", "**/*.e2e.test.ts", "validation/**", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      // admin.ts, sdk-backend.ts and compose.ts/main.ts (real wiring) are covered by the integration tests, not the unit tests.
      exclude: ["**/index.ts", "packages/ens-client/src/admin.ts", "packages/arkiv-store/src/sdk-backend.ts", "apps/relayer/src/compose.ts", "apps/relayer/src/main.ts", "apps/web-source/src/main.ts", "apps/web-source/src/dom.ts", "apps/web-newsroom/src/main.ts", "apps/web-newsroom/src/dom.ts"],
      thresholds: {
        "packages/core/src/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
        "packages/crypto/src/**": { lines: 90, functions: 90, branches: 85, statements: 90 },
        "packages/network-policy/src/**": { lines: 80, functions: 80, branches: 75, statements: 80 },
        "packages/ens-client/src/**": { lines: 80, functions: 80, branches: 75, statements: 80 },
        "packages/arkiv-store/src/**": { lines: 80, functions: 80, branches: 75, statements: 80 },
        "packages/worldid-gate/src/**": { lines: 85, functions: 85, branches: 80, statements: 85 },
        "packages/source-client/src/**": { lines: 85, functions: 85, branches: 75, statements: 85 },
        "packages/newsroom-client/src/**": { lines: 85, functions: 85, branches: 75, statements: 85 },
        "apps/web-newsroom/src/**": { lines: 85, functions: 85, branches: 75, statements: 85 },
        "apps/web-source/src/**": { lines: 85, functions: 85, branches: 75, statements: 85 },
        "apps/relayer/src/**": { lines: 85, functions: 85, branches: 75, statements: 85 },
      },
    },
  },
});
