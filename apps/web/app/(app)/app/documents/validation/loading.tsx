export default function Loading() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-slate-100" />
      </div>
      <ul className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="h-9 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
            <div className="mt-4 h-8 w-24 animate-pulse rounded-lg bg-slate-100" />
          </li>
        ))}
      </ul>
    </div>
  );
}
