import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="route-state bg-[#07080b] text-zinc-100">
      <div className="route-state-card">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">
          Offline
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Business OS cannot reach the network.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
          Authenticated business data is never cached for offline use.
          Reconnect to continue safely.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950"
        >
          Retry workspace
        </Link>
      </div>
    </main>
  );
}
