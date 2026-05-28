"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

type FileState = {
  name: string;
  status: "pending" | "ok" | "doublon" | "error";
  message?: string;
};

const MAX_TAILLE_OCTETS = 50 * 1024 * 1024;

export function DocumentsUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
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
          const data = (await res.json().catch(() => ({}))) as {
            status?: string;
            error?: string;
          };
          if (!res.ok) {
            finals.push({
              name: file.name,
              status: "error",
              message: data.error ?? "Échec de l'envoi",
            });
          } else if (data.status === "doublon") {
            finals.push({ name: file.name, status: "doublon", message: "Déjà présent" });
          } else {
            finals.push({ name: file.name, status: "ok" });
          }
        } catch {
          finals.push({ name: file.name, status: "error", message: "Erreur réseau" });
        }
        setResults([
          ...finals,
          ...list.slice(finals.length).map((f) => ({ name: f.name, status: "pending" as const })),
        ]);
      }

      setResults(finals);
      setBusy(false);
      router.refresh();
    },
    [router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles],
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        disabled={busy}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
        } ${busy ? "cursor-wait opacity-70" : "cursor-pointer"}`}
      >
        <svg
          className="h-8 w-8 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <span className="text-sm font-medium text-slate-700">
          {busy ? "Envoi en cours…" : "Glissez vos documents ici ou cliquez pour parcourir"}
        </span>
        <span className="text-xs text-slate-400">
          PDF, images, Word, Excel — 50 Mo max par fichier
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,.csv,.xls,.xlsx,.doc,.docx"
        onChange={(e) => {
          if (e.target.files?.length) uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {results.length > 0 && (
        <ul className="mt-3 space-y-1">
          {results.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-sm"
            >
              <span className="truncate text-slate-600" title={r.name}>
                {r.name}
              </span>
              <span
                className={`shrink-0 text-xs font-medium ${
                  r.status === "ok"
                    ? "text-emerald-600"
                    : r.status === "doublon"
                      ? "text-slate-500"
                      : r.status === "error"
                        ? "text-rose-600"
                        : "text-slate-400"
                }`}
              >
                {r.status === "ok"
                  ? "Reçu"
                  : r.status === "doublon"
                    ? (r.message ?? "Doublon")
                    : r.status === "error"
                      ? (r.message ?? "Erreur")
                      : "…"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
