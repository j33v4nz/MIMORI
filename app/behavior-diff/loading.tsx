export default function Loading() {
  return (
    <div className="flex h-full w-full min-h-[50vh] items-center justify-center bg-transparent" role="status" aria-busy="true">
      <div className="w-full space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-40 bg-surface-container-high rounded" />
          <div className="h-10 w-72 bg-surface-container-high rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface-panel border-[0.5px] border-outline-variant p-6 h-64" />
          <div className="bg-surface-panel border-[0.5px] border-outline-variant p-6 h-64" />
        </div>
      </div>
    </div>
  );
}
