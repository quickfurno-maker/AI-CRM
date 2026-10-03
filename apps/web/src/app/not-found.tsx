import Link from 'next/link';
import { ArrowLeft, SearchX } from '@/components/icons';

export default function NotFound() {
  return (
    <div className="route-state">
      <div className="route-state-card">
        <div className="route-state-icon">
          <SearchX size={21} />
        </div>
        <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">
          404 · Not found
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          This workspace destination does not exist.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
          It may have moved, been removed, or not be enabled for this organization.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950"
        >
          <ArrowLeft size={15} />
          Return to Command Center
        </Link>
      </div>
    </div>
  );
}
