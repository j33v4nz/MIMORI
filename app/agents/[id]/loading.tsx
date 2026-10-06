export default function Loading() {
  return (
    <div className="flex h-full w-full min-h-[50vh] items-center justify-center bg-transparent" role="status" aria-busy="true">
      <div className="w-full space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-surface-container-high rounded" />
          <div className="h-10 w-64 bg-surface-container-high rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-surface-panel border-[0.5px] border-outline-variant p-4 h-24" />
          ))}
        </div>
        <div className="bg-surface-panel border-[0.5px] border-outline-variant p-6 h-48" />
      </div>
    </div>
  );
}
