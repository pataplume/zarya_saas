export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 h-7 w-56 animate-pulse rounded bg-gray-200" />
      <ul className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-20 animate-pulse rounded border border-gray-200 bg-gray-50" />
        ))}
      </ul>
    </main>
  );
}
