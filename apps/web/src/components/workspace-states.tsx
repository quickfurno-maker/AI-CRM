import { Boxes, SearchX } from '@/components/icons';

export function WorkspaceLoading({
  label = 'workspace',
}: {
  label?: string;
}) {
  return (
    <div className="route-state" aria-busy="true" aria-label={'Loading ' + label}>
      <div className="w-full max-w-6xl">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-4 h-9 w-64 max-w-[70vw]" />
        <div className="skeleton mt-3 h-4 w-96 max-w-[86vw]" />
        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5"
            >
              <div className="skeleton h-3 w-24" />
              <div className="skeleton mt-4 h-7 w-16" />
              <div className="skeleton mt-3 h-3 w-28" />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-6">
            <div className="skeleton h-4 w-36" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-12 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-6">
            <div className="skeleton h-4 w-28" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton h-9 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  search = false,
}: {
  title: string;
  description: string;
  search?: boolean;
}) {
  const Icon = search ? SearchX : Boxes;
  return (
    <div className="premium-empty">
      <span className="premium-empty-icon">
        <Icon size={20} />
      </span>
      <div className="mt-3 text-sm font-semibold text-zinc-300">{title}</div>
      <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-600">
        {description}
      </p>
    </div>
  );
}
