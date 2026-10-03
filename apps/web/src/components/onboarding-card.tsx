'use client';

import Link from 'next/link';
import { Check } from '@/components/icons';
import { useEffect, useState } from 'react';

type Step = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  optional?: boolean;
};

type State = {
  dismissed: boolean;
  completed: boolean;
  progress: {
    complete: number;
    total: number;
    requiredComplete: number;
    requiredTotal: number;
  };
  steps: Step[];
};

export function OnboardingCard() {
  const [state, setState] = useState<State>();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/platform/onboarding', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        return (await response.json()) as State;
      })
      .then((data) => {
        if (!cancelled && data) setState(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || state.dismissed || state.completed) return null;

  async function dismiss() {
    await fetch('/api/platform/onboarding/dismiss', {
      method: 'POST',
    });
    setState((current) =>
      current ? { ...current, dismissed: true } : current,
    );
  }

  const percent = Math.round(
    (state.progress.requiredComplete /
      Math.max(state.progress.requiredTotal, 1)) *
      100,
  );

  return (
    <section className="mt-5 overflow-hidden rounded-[22px] border border-violet-400/[0.13] bg-violet-400/[0.035] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-300">
            Guided setup · {percent}%
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            Finish the core workspace setup.
          </h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Progress is based on real tenant state, not a checklist you can accidentally mark complete.
          </p>
        </div>
        <button onClick={() => void dismiss()} className="text-[10px] text-zinc-600 hover:text-zinc-300">
          Dismiss
        </button>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {state.steps.filter((step)=>!step.optional).map((step) => (
          <Link key={step.key} href={step.href} className="rounded-xl border border-white/[0.06] bg-black/10 p-3 transition hover:bg-white/[0.025]">
            <div className="flex items-center gap-2">
              <span className={'grid h-6 w-6 place-items-center rounded-lg border ' + (step.done ? 'border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300' : 'border-white/[0.07] text-zinc-700')}>
                {step.done ? <Check size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span className="text-xs font-medium text-zinc-300">{step.title}</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-zinc-600">{step.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
