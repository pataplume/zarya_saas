import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Les packages workspace exposent directement leur source TS (exports "." → src/index.ts).
    // Le runner racine n'a pas de symlink node_modules/@zarya/*, on résout donc à la main.
    alias: {
      "@zarya/extraction": fileURLToPath(
        new URL("./packages/extraction/src/index.ts", import.meta.url),
      ),
      "@zarya/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
    },
  },
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
