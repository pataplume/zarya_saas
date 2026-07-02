export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 h-7 w-48 animate-pulse rounded bg-slate-200" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded border border-slate-100 bg-slate-50" />
        ))}
      </div>
    </main>
  );
}
