export default function Loading() {
  return (
    <div className="flex h-full w-full min-h-screen items-center justify-center bg-surface">
      <div className="w-full max-w-md space-y-4 animate-pulse">
        <div className="h-10 w-48 bg-surface-container-high rounded mx-auto" />
        <div className="bg-surface-panel border-[0.5px] border-outline-variant p-8 space-y-4">
          <div className="h-4 w-24 bg-surface-container-high rounded" />
          <div className="h-10 w-full bg-surface-container-high rounded" />
          <div className="h-4 w-24 bg-surface-container-high rounded" />
          <div className="h-10 w-full bg-surface-container-high rounded" />
          <div className="h-10 w-full bg-surface-container-high rounded" />
        </div>
      </div>
    </div>
  );
}
