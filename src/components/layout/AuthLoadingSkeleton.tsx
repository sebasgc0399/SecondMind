export default function AuthLoadingSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 md:flex">
        <div className="mb-6 h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 md:hidden"
          style={{ paddingTop: 'var(--sai-top)' }}
        >
          <div className="h-11 w-11 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </header>

        <main
          className="flex-1 overflow-auto p-4 md:p-6"
          style={{ paddingBottom: 'calc(80px + var(--sai-bottom))' }}
        >
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 flex border-t border-border bg-background md:hidden"
          style={{ paddingBottom: 'var(--sai-bottom)', height: 'calc(64px + var(--sai-bottom))' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
