import Link from "next/link";

// Layout partagé des pages légales publiques (/cgu, /confidentialite).
// Pas d'auth requise — le middleware ne protège que /app.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground hover:underline"
          >
            ← ZARYA
          </Link>
          <span className="text-xs text-muted-foreground">
            Copilote opérationnel pour fiduciaires
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <article className="text-sm leading-relaxed text-slate-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_a]:font-medium [&_a]:text-foreground [&_a]:underline">
          {children}
        </article>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} ZARYA — Condere</span>
          <nav className="flex gap-4">
            <Link href="/cgu" className="transition-colors hover:text-foreground hover:underline">
              CGU
            </Link>
            <Link
              href="/confidentialite"
              className="transition-colors hover:text-foreground hover:underline"
            >
              Confidentialité
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
