/**
 * Stub de `next/cache` pour les tests d'intégration.
 *
 * `revalidatePath` / `revalidateTag` exigent un scope de requête Next, inexistant
 * sous Vitest (env node) → ils lèvent E263 hors d'une requête. On aliase donc
 * `next/cache` vers ce stub dans vitest.config.ts pour que l'import des server
 * actions résolve le même id no-op, quel que soit le contexte de résolution pnpm.
 */
export function revalidatePath(_path: string, _type?: "page" | "layout"): void {}
export function revalidateTag(_tag: string): void {}
