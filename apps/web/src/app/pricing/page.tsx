import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, CircleDollarSign, Users } from '@/components/icons';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { PublicPricing } from '@/components/public-pricing';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Business OS subscription plans, add-ons, seats and usage model.',
};

export default function PricingPage() {
  return (
    <main className="marketing-page">
      <MarketingHeader />
      <section className="marketing-subhero">
        <div className="marketing-container">
          <div className="marketing-eyebrow">Pricing</div>
          <h1 className="marketing-subhero-title">Pay for product access, not employee headcount.</h1>
          <p className="marketing-subhero-copy">
            Staff records, user accounts, product seats, AI usage and WhatsApp capabilities
            are separate commercial concepts—so pricing follows the value you actually use.
          </p>
        </div>
      </section>

      <section className="marketing-section pt-0">
        <div className="marketing-container">
          <PublicPricing compact />
        </div>
      </section>

      <section className="marketing-section marketing-section-dark">
        <div className="marketing-container">
          <div className="max-w-3xl">
            <div className="marketing-eyebrow">Commercial model</div>
            <h2 className="marketing-section-title mt-3">Simple where it should be. Precise where it matters.</h2>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            <ModelCard
              icon={Users}
              title="Staff is not a seat"
              copy="Create employee and attendance records without silently converting every person into a full CRM seat."
              items={['FULL, LIGHT, ATTENDANCE_ONLY and GUEST access classes', 'Role and scope are separate from billing', 'Explicit seat assignment and release']}
            />
            <ModelCard
              icon={CircleDollarSign}
              title="Base plan + add-ons"
              copy="Subscriptions can include full seats and capabilities, then expand through add-ons rather than forcing one oversized bundle."
              items={['Monthly and yearly billing cycles', 'Plan changes and scheduled downgrades', 'Coupons and trials']}
            />
            <ModelCard
              icon={Check}
              title="Usage-aware where needed"
              copy="AI, WhatsApp and automation can be metered independently with warnings, overage policy, throttling or hard limits."
              items={['Included usage allowance', 'Provider-configured unit pricing', 'Usage and cost transparency']}
            />
          </div>
        </div>
      </section>

      <section className="marketing-final">
        <div className="marketing-container text-center">
          <h2 className="marketing-final-title">Start with the workspace. Expand when the business needs it.</h2>
          <div className="mt-7 flex justify-center gap-3">
            <Link href="/register" className="marketing-primary-cta">Create workspace <ArrowRight size={15} /></Link>
            <Link href="/platform" className="marketing-secondary-cta">Explore platform</Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}

function ModelCard({
  icon: Icon,
  title,
  copy,
  items,
}: {
  icon: typeof Users;
  title: string;
  copy: string;
  items: string[];
}) {
  return (
    <article className="marketing-module-card">
      <span className="marketing-module-icon"><Icon size={19} /></span>
      <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-xs leading-6 text-zinc-600">{copy}</p>
      <div className="mt-5 grid gap-2">
        {items.map((item) => (
          <div key={item} className="flex gap-2 text-xs leading-5 text-zinc-400">
            <Check size={13} className="mt-0.5 flex-none text-emerald-300" />
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}
