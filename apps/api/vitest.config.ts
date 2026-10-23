import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    root: ".",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // The tests share a single MySQL database, so they must not run in
    // parallel against it.
    fileParallelism: false,
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
