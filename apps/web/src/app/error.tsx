'use client';

import { AlertTriangle, RefreshCw } from '@/components/icons';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="route-state">
      <div className="route-state-card" role="alert">
        <div className="route-state-icon">
          <AlertTriangle size={21} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          This workspace view hit a problem.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
          Your data has not been changed by this screen failure. Retry the view;
          if the problem continues, the error can be traced from the server logs.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950"
        >
          <RefreshCw size={15} />
          Retry view
        </button>
      </div>
    </div>
  );
}
