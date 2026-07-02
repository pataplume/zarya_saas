import Link from "next/link";

// Layout partagé des pages légales publiques (/cgu, /confidentialite).
// Pas d'auth requise — le middleware ne protège que /app.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-gray-900 hover:underline"
          >
            ← ZARYA
          </Link>
          <span className="text-xs text-gray-400">Copilote opérationnel pour fiduciaires</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <article className="text-sm leading-relaxed text-gray-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-900 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_a]:font-medium [&_a]:text-gray-900 [&_a]:underline">
          {children}
        </article>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-gray-400 sm:px-6">
          <span>© {new Date().getFullYear()} ZARYA — Condere</span>
          <nav className="flex gap-4">
            <Link href="/cgu" className="hover:text-gray-600 hover:underline">
              CGU
            </Link>
            <Link href="/confidentialite" className="hover:text-gray-600 hover:underline">
              Confidentialité
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
