import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Les packages workspace exposent directement leur source TS (exports "." → src/index.ts).
    // Le runner racine n'a pas de symlink node_modules/@zarya/*, on résout donc à la main.
    alias: {
      // Alias `@/` d'apps/web (tsconfig paths) — pour que les server actions importées par les
      // tests résolvent `@/lib/*`, `@/components/*` comme sous Next. Préfixe, donc trailing slash.
      "@/": fileURLToPath(new URL("./apps/web/", import.meta.url)),
      "@zarya/extraction": fileURLToPath(
        new URL("./packages/extraction/src/index.ts", import.meta.url),
      ),
      "@zarya/integrations": fileURLToPath(
        new URL("./packages/integrations/src/index.ts", import.meta.url),
      ),
      "@zarya/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      "@zarya/logger": fileURLToPath(new URL("./packages/logger/src/index.ts", import.meta.url)),
      "@zarya/calendar": fileURLToPath(
        new URL("./packages/calendar/src/index.ts", import.meta.url),
      ),
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
    // @napi-rs/canvas (binaire natif Skia, utilisé par la rasterisation OCR-a via unpdf) :
    // externalisé pour être chargé par le résolveur Node natif (vite-node ne sait pas parser le
    // binaire `.node`). Cf. rasterize-pdf.ts.
    server: {
      deps: {
        external: [/@napi-rs\/canvas/],
      },
    },
    // Tests d'intégration sur la base Supabase DISTANTE (latence réseau × N round-trips).
    // Les plus lourds — moteur d'échéances (genererEcheancesPourClient : 1 lecture de templates +
    // N inserts idempotents, Lot 2/6) et valider-lot — multiplient les allers-retours et peuvent
    // dépasser 30 s lors d'un pic de latence / charge de la base partagée (run CI nocturne observé
    // à 63 min vs 44 min → 4 timeouts sur le moteur, MÊME commit vert au run précédent). 60 s donne
    // une marge confortable (run lent ≈ 1,4× → ~42 s) ; un vrai test cassé échoue toujours sur son
    // assertion, pas sur le timeout. (Fix de fond à terme : batcher les inserts du moteur.)
    testTimeout: 60_000,
    hookTimeout: 60_000, // seed / cleanup
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
