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
      "@zarya/integrations": fileURLToPath(
        new URL("./packages/integrations/src/index.ts", import.meta.url),
      ),
      "@zarya/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      // Sous-chemin admin (helper createTestUser) : à déclarer AVANT "@zarya/auth"
      // car Vite matche les alias string par préfixe. admin.ts ne tire pas next/headers.
      "@zarya/auth/admin": fileURLToPath(new URL("./packages/auth/src/admin.ts", import.meta.url)),
      // @zarya/auth/index tire next/headers (incompatible env node). On l'aliase quand
      // même pour que `vi.mock("@zarya/auth")` cible le même id que l'import des server
      // actions ; le mock remplace le module, donc index.ts n'est jamais évalué.
      "@zarya/auth": fileURLToPath(new URL("./packages/auth/src/index.ts", import.meta.url)),
      // next/cache (revalidatePath) exige un scope de requête, absent sous Vitest.
      // On l'aliase vers un stub no-op pour que l'import des server actions résolve
      // le même id quel que soit le contexte pnpm (cf. même logique que @zarya/auth).
      "next/cache": fileURLToPath(
        new URL("./tests/integration/helpers/next-cache-stub.ts", import.meta.url),
      ),
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
