export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Wordmark — identique à la sidebar (carré bleu « Z » + ZARYA en tracking large) */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <span
              className="flex size-6 items-center justify-center rounded bg-blue-600 text-[11px] font-bold text-white"
              aria-hidden
            >
              Z
            </span>
            <h1 className="text-sm font-semibold tracking-[0.14em] text-foreground">ZARYA</h1>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Copilote opérationnel pour fiduciaires
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-border bg-card p-8 shadow-card">{children}</div>
      </div>
    </div>
  );
}
