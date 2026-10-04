"use client";

export default function LoginError({
  error,
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex h-full w-full min-h-[50vh] items-center justify-center p-6" role="alert">
      <section className="flex flex-col items-start max-w-md border-[0.5px] border-error bg-surface-container p-6 error-shadow">
        <div className="flex flex-col gap-4">
          <p className="font-mono text-[10px] text-error uppercase tracking-widest">Auth Gateway Failure</p>
          <h1 className="text-xl font-bold font-headline-md text-on-background uppercase">Could not load login</h1>
          <p className="font-mono text-sm text-on-surface-variant">{error.message}</p>
          <button
            className="bg-error text-white px-4 py-2 mt-4 font-mono text-xs uppercase hover:bg-red-700 transition-colors"
            type="button"
            onClick={reset}
          >
            Retry Connection
          </button>
        </div>
      </section>
    </div>
  );
}
