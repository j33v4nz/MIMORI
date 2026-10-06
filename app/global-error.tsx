"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-on-background font-mono">
        <main className="flex h-full w-full min-h-screen items-center justify-center p-6">
          <section className="flex flex-col items-start max-w-md border-[0.5px] border-error bg-surface-container p-6 error-shadow">
            <div className="flex flex-col gap-4">
              <p className="font-mono text-[10px] text-error uppercase tracking-widest">Fatal System Error</p>
              <h1 className="text-xl font-bold font-headline-md text-on-background uppercase">Layout failure</h1>
              <p className="font-mono text-sm text-on-surface-variant">{error.message}</p>
              <button
                className="bg-error text-white px-4 py-2 mt-4 font-mono text-xs uppercase hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                type="button"
                onClick={reset}
              >
                Reload Application
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
