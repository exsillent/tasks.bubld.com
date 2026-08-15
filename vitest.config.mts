import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.global-setup.mts"],
    // Sequential: all test files share one SQLite test.db, so running
    // them in parallel processes would race on the same tables.
    fileParallelism: false,
  },
});
