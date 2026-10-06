export default function Loading() {
  return (
    <div className="flex h-full w-full min-h-[50vh] items-center justify-center bg-transparent" role="status" aria-busy="true">
      <div className="w-full max-w-2xl space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-surface-container-high rounded" />
          <div className="h-10 w-64 bg-surface-container-high rounded" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-panel border-[0.5px] border-outline-variant p-6 space-y-3">
              <div className="h-4 w-48 bg-surface-container-high rounded" />
              <div className="h-3 w-full bg-surface-container-high rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
