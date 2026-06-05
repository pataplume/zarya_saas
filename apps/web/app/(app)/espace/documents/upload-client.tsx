"use client";

// Run B1 — dépôt de documents côté client (espace client). Poste sur /api/documents/upload ;
// la route détecte le rôle client_contact et rattache au client (JWT). Copie orientée client
// (UX ZARYA §8 : pas de jargon). Drag-drop + sélection fichier.
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type FileState = { name: string; status: "pending" | "ok" | "doublon" | "error"; message?: string };

const MAX_TAILLE_OCTETS = 50 * 1024 * 1024;

export function UploadClient() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FileState[]>([]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setBusy(true);
      setResults(list.map((f) => ({ name: f.name, status: "pending" as const })));

      const finals: FileState[] = [];
      for (const file of list) {
        if (file.size > MAX_TAILLE_OCTETS) {
          finals.push({
            name: file.name,
            status: "error",
            message: "Fichier trop volumineux (max 50 Mo)",
          });
          continue;
        }
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
          const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
          if (!res.ok) {
            finals.push({
              name: file.name,
              status: "error",
              message: data.error ?? "Échec de l'envoi",
            });
          } else if (data.status === "doublon") {
            finals.push({ name: file.name, status: "doublon", message: "Déjà transmis" });
          } else {
            finals.push({ name: file.name, status: "ok" });
          }
        } catch {
          finals.push({ name: file.name, status: "error", message: "Erreur réseau" });
        }
      }
      setResults(finals);
      setBusy(false);
      router.refresh();
    },
    [router],
  );

  return (
    <div className="mt-6">
      {/* Un <label> ouvre nativement l'input au clic et au clavier (a11y) ; le drag-drop est porté
          par le label lui-même. */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
        className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white hover:border-blue-300"
        }`}
      >
        <p className="text-sm font-medium text-gray-700">
          {busy ? "Envoi en cours…" : "Déposez vos documents ici"}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          ou cliquez pour les sélectionner · PDF, images, Excel/Word · 50 Mo max
        </p>
        <input
          type="file"
          multiple
          className="sr-only"
          aria-label="Sélectionner des documents"
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {results.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {results.map((r) => (
            <li key={r.name} className="flex items-center gap-2">
              <span aria-hidden>
                {r.status === "ok"
                  ? "✅"
                  : r.status === "doublon"
                    ? "↩️"
                    : r.status === "pending"
                      ? "⏳"
                      : "❌"}
              </span>
              <span className="truncate text-gray-700">{r.name}</span>
              {r.message && <span className="text-xs text-gray-400">— {r.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
