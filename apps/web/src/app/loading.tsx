export default function Loading() {
  return (
    <div className="route-state" aria-label="Loading workspace" aria-busy="true">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-4 h-9 w-64 max-w-[70vw]" />
          <div className="skeleton mt-3 h-4 w-96 max-w-[86vw]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton mt-4 h-7 w-16" />
              <div className="skeleton mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-6">
            <div className="skeleton h-4 w-36" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-11 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-6">
            <div className="skeleton h-4 w-28" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton h-8 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
