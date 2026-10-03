'use client';

import Link from 'next/link';
import { Check, Sparkles } from '@/components/icons';
import { useEffect, useMemo, useState } from 'react';

type Price = {
  id: string;
  billingCycle: 'MONTHLY' | 'YEARLY';
  currency: string;
  amount: string;
  trialDays?: number;
};

type Plan = {
  id: string;
  key: string;
  name: string;
  prices: Price[];
};

type Addon = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  prices: Price[];
};

type Catalog = {
  plans: Plan[];
  addons: Addon[];
};

const fallbackPlans = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'For teams moving customer operations into one governed workspace.',
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'For teams scaling CRM, WhatsApp, automation and AI-assisted execution.',
  },
  {
    key: 'business',
    name: 'Business',
    description: 'For multi-team operations that need deeper controls, analytics and extensions.',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'For organizations that need SSO, SCIM, advanced policy and deployment options.',
  },
];

const shared = [
  'CRM, pipeline and activity workspace',
  'Team roles, scope and audit controls',
  'Staff records separate from paid product seats',
  'Monthly or yearly subscription lifecycle',
  'Add-ons and usage-aware entitlements',
];

export function PublicPricing({ compact = false }: { compact?: boolean }) {
  const [catalog, setCatalog] = useState<Catalog>();
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/saas/catalog', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        return (await response.json()) as Catalog;
      })
      .then((data) => {
        if (!cancelled && data) setCatalog(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const plans = useMemo(
    () =>
      catalog?.plans?.length
        ? catalog.plans
        : fallbackPlans.map((plan) => ({ ...plan, id: plan.key, prices: [] as Price[] })),
    [catalog],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="marketing-eyebrow">Subscriptions</div>
          {!compact ? (
            <h2 className="marketing-section-title mt-3">A commercial model that scales with the business.</h2>
          ) : null}
        </div>
        <div className="marketing-cycle" role="group" aria-label="Billing cycle">
          {(['MONTHLY', 'YEARLY'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCycle(value)}
              className={cycle === value ? 'marketing-cycle-active' : ''}
            >
              {value === 'MONTHLY' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan, index) => {
          const price = plan.prices.find((item) => item.billingCycle === cycle);
          const fallback = fallbackPlans.find((item) => item.key === plan.key);
          const popular = index === 1;
          return (
            <article
              key={plan.id}
              className={'marketing-price-card ' + (popular ? 'marketing-price-card--popular' : '')}
            >
              {popular ? (
                <div className="marketing-popular">
                  <Sparkles size={12} />
                  Most popular
                </div>
              ) : null}
              <div className="text-lg font-semibold text-white">{plan.name}</div>
              <p className="mt-2 min-h-12 text-xs leading-5 text-zinc-500">
                {fallback?.description ?? 'A provider-configured Business OS subscription.'}
              </p>
              <div className="mt-6">
                {price ? (
                  <>
                    <div className="text-3xl font-semibold tracking-[-0.04em] text-white">
                      {money(price.amount, price.currency)}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-600">
                      per {cycle === 'MONTHLY' ? 'month' : 'year'}
                      {price.trialDays ? ' · ' + price.trialDays + '-day trial' : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xl font-semibold text-white">Launch pricing</div>
                    <div className="mt-1 text-[11px] text-zinc-600">
                      Publishes automatically from Provider Commercial Ops
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 grid gap-2.5">
                {shared.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-xs leading-5 text-zinc-400">
                    <Check size={14} className="mt-0.5 flex-none text-emerald-300" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/register"
                className={popular ? 'marketing-price-action marketing-price-action--primary' : 'marketing-price-action'}
              >
                Start workspace
              </Link>
            </article>
          );
        })}
      </div>

      {catalog?.addons?.length ? (
        <div className="mt-10 rounded-[22px] border border-white/[0.07] bg-white/[0.018] p-5 sm:p-6">
          <div className="text-sm font-semibold text-white">Available add-ons</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalog.addons.map((addon) => {
              const price = addon.prices.find((item) => item.billingCycle === cycle);
              return (
                <div key={addon.id} className="rounded-2xl border border-white/[0.06] bg-black/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{addon.name}</div>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                        {addon.description ?? 'Commercial capability add-on'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-violet-300">
                      {price ? money(price.amount, price.currency) : 'Configured'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function money(value: string, currency: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}
