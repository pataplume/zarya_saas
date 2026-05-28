export default function Loading() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="mt-8 h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
