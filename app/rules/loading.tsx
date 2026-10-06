export default function RulesLoading() {
  return (
    <div className="flex h-full w-full min-h-[50vh] items-center justify-center bg-transparent">
      <div className="w-full space-y-6 animate-pulse">
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <div className="h-4 w-20 bg-surface-container-high rounded" />
            <div className="h-10 w-56 bg-surface-container-high rounded" />
          </div>
          <div className="h-10 w-24 bg-surface-container-high rounded" />
        </div>
        <div className="bg-surface-panel border-[0.5px] border-outline-variant p-6 h-64" />
      </div>
    </div>
  );
}
