export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 h-7 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mb-4 h-9 w-full max-w-md animate-pulse rounded bg-slate-100" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-slate-50" />
        ))}
      </div>
    </main>
  );
}
