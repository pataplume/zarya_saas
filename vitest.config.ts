import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    globals: true,
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 15_000, // DB calls peuvent prendre plusieurs secondes
    hookTimeout: 30_000, // seed / cleanup
    reporters: ["verbose"],
    pool: "forks",
    poolOptions: {
      forks: {
        // Un seul fork pour éviter les conflits sur le seed/cleanup de la DB de test
        singleFork: true,
      },
    },
  },
});
