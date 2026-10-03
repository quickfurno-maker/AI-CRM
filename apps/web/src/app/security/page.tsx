import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Code2,
  KeyRound,
  ShieldCheck,
  Users,
} from '@/components/icons';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';

export const metadata: Metadata = {
  title: 'Security',
  description: 'Business OS tenant isolation, access control, AI governance and production security architecture.',
};

const controls = [
  { icon: ShieldCheck, title: 'Tenant isolation', copy: 'Browser-supplied tenant identifiers are never authoritative. Tenant identity comes from authenticated server context and tenant-owned queries.' },
  { icon: Users, title: 'RBAC + resource scope', copy: 'Human users, APIs, automations and AI are governed by permissions and OWN / TEAM / BRANCH / WORKSPACE / ORGANIZATION scope.' },
  { icon: Bot, title: 'Governed AI execution', copy: 'AI does not receive unrestricted database access. Models propose tool calls; platform code validates risk, permissions, policy and approvals before execution.' },
  { icon: KeyRound, title: 'Secrets & enterprise identity', copy: 'Production architecture uses managed secrets, encrypted data services, OIDC foundations and SCIM provisioning controls.' },
  { icon: Code2, title: 'Developer trust boundaries', copy: 'API keys are scoped, outbound webhooks are signed, OAuth clients are explicit and provider operations remain segregated.' },
];

export default function SecurityPage() {
  return (
    <main className="marketing-page">
      <MarketingHeader />
      <section className="marketing-subhero">
        <div className="marketing-container">
          <div className="marketing-eyebrow">Security</div>
          <h1 className="marketing-subhero-title">Governance is part of the runtime, not a policy document.</h1>
          <p className="marketing-subhero-copy">
            Business OS is designed so every sensitive path—human, API, automation or AI—
            passes through explicit tenant, permission, entitlement and audit boundaries.
          </p>
        </div>
      </section>

      <section className="marketing-section pt-0">
        <div className="marketing-container grid gap-4">
          {controls.map(({ icon: Icon, title, copy }) => (
            <article key={title} className="marketing-security-row">
              <span className="marketing-module-icon"><Icon size={20} /></span>
              <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-500">{copy}</p>
              </div>
              <span className="marketing-security-status">Built in</span>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-section marketing-section-dark">
        <div className="marketing-container">
          <div className="marketing-enterprise">
            <div className="marketing-eyebrow">Production architecture</div>
            <h2 className="marketing-section-title mt-3">Designed for controlled deployment and recovery.</h2>
            <p className="marketing-section-copy">
              The production baseline includes Cloudflare, AWS ECS/Fargate, multi-AZ data
              services, encrypted secrets/storage, immutable images, migration-first releases,
              alerting, rollback controls and restore-proof requirements.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {['Cloudflare + TLS', 'ECS/Fargate', 'PostgreSQL', 'Redis', 'KMS', 'Secrets Manager', 'SQS/DLQ', 'CloudWatch'].map((item) => (
                <span key={item} className="marketing-enterprise-chip">{item}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-final">
        <div className="marketing-container text-center">
          <h2 className="marketing-final-title">Operate with speed without giving up control.</h2>
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
