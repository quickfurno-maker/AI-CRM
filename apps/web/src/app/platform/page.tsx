import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Code2,
  MessageCircleMore,
  ShieldCheck,
  Users,
  Workflow,
} from '@/components/icons';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';

export const metadata: Metadata = {
  title: 'Platform',
  description: 'Explore the CRM, WhatsApp, AI, automation, analytics and operational platform behind Business OS.',
};

const sections = [
  { id: 'crm', icon: BriefcaseBusiness, title: 'CRM & revenue operations', copy: 'Contacts, companies, leads, deals, pipelines, tasks, appointments, activity history, scoring, custom fields, segments and import/export.', points: ['Scoped ownership and team access', 'Deterministic lead scoring', 'Pipeline and task execution', 'Bulk data operations'] },
  { id: 'whatsapp', icon: MessageCircleMore, title: 'WhatsApp business platform', copy: 'Shared inbox, Meta onboarding architecture, templates, campaigns, consent, quiet hours and AI/human handling modes.', points: ['Unified customer context', 'Template and campaign workflows', 'Human takeover', 'Policy-aware outbound actions'] },
  { id: 'ai', icon: Bot, title: 'Governed AI agents', copy: 'OpenAI-backed agents operate through the AI Gateway with tenant knowledge, approved tools, risk controls and traceability.', points: ['RAG with tenant boundaries', 'L0–L3 risk model', 'Tool permissions and approvals', 'Usage and cost telemetry'] },
  { id: 'automation', icon: Workflow, title: 'Durable automation', copy: 'Build event-driven workflows with conditions, waits, approvals, AI steps, retries, simulation, run history and replay.', points: ['Typed flow graph', 'Durable waits and resume', 'Approval checkpoints', 'Run-level observability'] },
  { id: 'analytics', icon: BarChart3, title: 'Cross-domain analytics', copy: 'One reporting layer across finance, CRM, WhatsApp, AI, attendance and vertical extensions.', points: ['Canonical business metrics', 'Sales performance', 'Receivables aging', 'AI-accessible governed analytics'] },
  { id: 'operations', icon: CalendarDays, title: 'People & attendance', copy: 'Employee records, departments, shifts, attendance, leave, corrections and manager reporting—without turning every staff record into a paid CRM seat.', points: ['Staff ≠ paid seat', 'Department and manager hierarchy', 'Attendance and leave', 'Explicit access assignment'] },
  { id: 'real-estate', icon: Building2, title: 'Real Estate extension', copy: 'Projects, units, requirements, matching, site visits, offers, bookings, commissions and governed AI tools.', points: ['Buyer requirement intelligence', 'Property recommendations', 'Site visit workflows', 'Approval-gated bookings'] },
  { id: 'billing', icon: CircleDollarSign, title: 'Billing & SaaS commercial operations', copy: 'Customer business billing stays separate from your SaaS subscription engine.', points: ['Quotes, invoices and receipts', 'Plans and add-ons', 'Usage metering', 'Dunning and subscription portal'] },
  { id: 'developer', icon: Code2, title: 'Developer & enterprise platform', copy: 'API keys, OAuth client credentials, signed webhooks, marketplace foundations, SSO and SCIM.', points: ['Scoped API access', 'Signed outbound webhooks', 'OIDC SSO foundation', 'SCIM provisioning'] },
];

export default function PlatformPage() {
  return (
    <main className="marketing-page">
      <MarketingHeader />
      <section className="marketing-subhero">
        <div className="marketing-container">
          <div className="marketing-eyebrow">Platform</div>
          <h1 className="marketing-subhero-title">A complete operating layer for modern businesses.</h1>
          <p className="marketing-subhero-copy">
            The platform is modular at the surface and unified underneath: one tenant model,
            one permission system, one entitlement layer, one audit trail and one governed AI runtime.
          </p>
        </div>
      </section>

      <section className="marketing-section pt-0">
        <div className="marketing-container grid gap-4">
          {sections.map(({ id, icon: Icon, title, copy, points }, index) => (
            <article id={id} key={id} className="marketing-feature-row">
              <div className="marketing-feature-number">{String(index + 1).padStart(2, '0')}</div>
              <div>
                <span className="marketing-module-icon"><Icon size={20} /></span>
                <h2 className="mt-5 text-xl font-semibold tracking-tight text-white">{title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-500">{copy}</p>
              </div>
              <div className="grid gap-2">
                {points.map((point) => (
                  <div key={point} className="flex items-center gap-2 text-xs text-zinc-400">
                    <ShieldCheck size={14} className="text-emerald-300" />
                    {point}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-final">
        <div className="marketing-container text-center">
          <h2 className="marketing-final-title">The whole business, one governed workspace.</h2>
          <div className="mt-7 flex justify-center gap-3">
            <Link href="/register" className="marketing-primary-cta">Start workspace <ArrowRight size={15} /></Link>
            <Link href="/pricing" className="marketing-secondary-cta">View pricing</Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
