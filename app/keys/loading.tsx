export default function Loading() {
  return (
    <div className="flex h-full w-full min-h-[50vh] items-center justify-center bg-transparent" role="status" aria-busy="true">
      <div className="w-full space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-28 bg-surface-container-high rounded" />
          <div className="h-10 w-56 bg-surface-container-high rounded" />
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-surface-panel border-[0.5px] border-outline-variant p-4 flex items-center gap-4">
              <div className="h-4 w-24 bg-surface-container-high rounded" />
              <div className="h-4 flex-1 bg-surface-container-high rounded" />
              <div className="h-8 w-20 bg-surface-container-high rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
