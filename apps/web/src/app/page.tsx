import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleDollarSign,
  Code2,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from '@/components/icons';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { PublicPricing } from '@/components/public-pricing';

const modules = [
  { icon: BriefcaseBusiness, title: 'CRM', copy: 'Contacts, leads, deals, tasks, appointments, scoring and activity in one operating workspace.' },
  { icon: MessageCircleMore, title: 'WhatsApp', copy: 'Shared inbox, templates, campaigns, consent, human takeover and governed AI handling.' },
  { icon: Bot, title: 'AI Agents', copy: 'Tenant knowledge, permissioned tools, risk levels, approvals, tracing and usage controls.' },
  { icon: Workflow, title: 'Automation', copy: 'Event triggers, branches, waits, approvals, retries, replay and durable workflow execution.' },
  { icon: BarChart3, title: 'Analytics', copy: 'Finance, CRM, communication, AI, attendance and vertical metrics from governed source data.' },
  { icon: Building2, title: 'Real Estate', copy: 'Properties, requirements, site visits, matching, offers, bookings and AI-assisted workflows.' },
];

export default function Home() {
  return (
    <main className="marketing-page">
      <MarketingHeader />

      <section className="marketing-hero">
        <div className="marketing-hero-glow" />
        <div className="marketing-container relative z-10">
          <div className="mx-auto max-w-5xl text-center">
            <div className="marketing-hero-badge">
              <Sparkles size={13} />
              AI-native business operating system
            </div>
            <h1 className="marketing-hero-title">
              One operating system for
              <span> customers, teams and AI.</span>
            </h1>
            <p className="marketing-hero-copy">
              Replace disconnected CRM, WhatsApp, automation and AI tools with one
              governed workspace built around your business, your customers and your
              operating rules.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="marketing-primary-cta">
                Start your workspace
                <ArrowRight size={15} />
              </Link>
              <Link href="/platform" className="marketing-secondary-cta">
                Explore the platform
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-zinc-600">
              <span className="flex items-center gap-1.5"><Check size={13} className="text-emerald-300" /> Multi-tenant by design</span>
              <span className="flex items-center gap-1.5"><Check size={13} className="text-emerald-300" /> Governed AI execution</span>
              <span className="flex items-center gap-1.5"><Check size={13} className="text-emerald-300" /> Monthly & yearly subscriptions</span>
            </div>
          </div>

          <div className="marketing-product-stage">
            <div className="marketing-stage-bar">
              <span className="marketing-stage-dot bg-red-400/60" />
              <span className="marketing-stage-dot bg-amber-300/60" />
              <span className="marketing-stage-dot bg-emerald-300/60" />
              <span className="ml-3 text-[10px] text-zinc-700">Business OS · Command Center</span>
            </div>
            <div className="marketing-stage-grid">
              <aside className="marketing-stage-sidebar">
                {['Command Center', 'CRM', 'WhatsApp', 'AI Agents', 'Automations', 'Analytics'].map((item, index) => (
                  <div key={item} className={index === 0 ? 'marketing-stage-nav-active' : 'marketing-stage-nav'}>
                    <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                    {item}
                  </div>
                ))}
              </aside>
              <div className="marketing-stage-main">
                <div className="marketing-stage-heading">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.18em] text-violet-300">Operating workspace</div>
                    <div className="mt-2 text-xl font-semibold text-white">Good morning. Here is the business pulse.</div>
                  </div>
                  <div className="marketing-stage-health">All systems governed</div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    ['Active pipeline', '₹48.2L'],
                    ['WhatsApp conversations', '1,284'],
                    ['AI success rate', '98.7%'],
                    ['Automation runs', '7,904'],
                  ].map(([label, value]) => (
                    <div key={label} className="marketing-stage-metric">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">{label}</div>
                      <div className="mt-2 text-lg font-semibold text-zinc-100">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
                  <div className="marketing-stage-panel">
                    <div className="text-xs font-medium text-zinc-300">Revenue & pipeline momentum</div>
                    <div className="mt-5 flex h-32 items-end gap-2">
                      {[35, 48, 42, 62, 55, 78, 70, 86, 72, 92, 82, 96].map((height, index) => (
                        <span key={index} className="flex-1 rounded-t-sm bg-gradient-to-t from-violet-500/20 to-violet-300/70" style={{ height: height + '%' }} />
                      ))}
                    </div>
                  </div>
                  <div className="marketing-stage-panel">
                    <div className="text-xs font-medium text-zinc-300">AI operations</div>
                    <div className="mt-4 grid gap-2">
                      {['Lead qualification', 'WhatsApp reply', 'Site visit follow-up', 'Manager summary'].map((item) => (
                        <div key={item} className="flex items-center justify-between rounded-xl border border-white/[0.05] px-3 py-2 text-[10px] text-zinc-500">
                          <span>{item}</span>
                          <span className="text-emerald-300">Ready</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-container">
          <div className="marketing-proof-grid">
            {[
              ['One source of truth', 'CRM, communication, billing, analytics and AI all operate on the same governed business context.'],
              ['AI with boundaries', 'Models propose. Your platform validates permissions, risk, policy and approvals before execution.'],
              ['Commercial from day one', 'Plans, add-ons, usage metering, invoices, dunning and customer subscription management are built in.'],
            ].map(([title, copy]) => (
              <div key={title} className="marketing-proof">
                <div className="text-sm font-semibold text-white">{title}</div>
                <p className="mt-2 text-xs leading-6 text-zinc-600">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="marketing-section marketing-section-dark">
        <div className="marketing-container">
          <div className="max-w-3xl">
            <div className="marketing-eyebrow">The platform</div>
            <h2 className="marketing-section-title mt-3">Built like an operating system, not a bundle of tools.</h2>
            <p className="marketing-section-copy">
              Every module shares tenant identity, roles, resource scope, entitlements,
              audit history and a canonical event model.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modules.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="marketing-module-card">
                <span className="marketing-module-icon"><Icon size={19} /></span>
                <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-zinc-600">{copy}</p>
                <Link href="/platform" className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-violet-300">
                  Explore capability <ArrowRight size={13} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="ai" className="marketing-section">
        <div className="marketing-container grid gap-10 xl:grid-cols-[.82fr_1.18fr] xl:items-center">
          <div>
            <div className="marketing-eyebrow">OpenAI + WhatsApp</div>
            <h2 className="marketing-section-title mt-3">AI that can work. Not AI that can bypass your business.</h2>
            <p className="marketing-section-copy">
              AI agents understand the customer, use tenant knowledge, propose actions
              and call approved tools. Sensitive actions remain policy-controlled and
              approval-gated.
            </p>
            <div className="mt-7 grid gap-3">
              {[
                'Qualify leads and update CRM context',
                'Answer from tenant knowledge and policies',
                'Handle WhatsApp with human takeover',
                'Schedule visits and approved follow-ups',
                'Trace tools, latency, usage and cost',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-zinc-400">
                  <span className="marketing-check"><Check size={13} /></span>{item}
                </div>
              ))}
            </div>
          </div>
          <div className="marketing-ai-stage">
            <div className="marketing-ai-top">
              <div>
                <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">Live governed agent</div>
                <div className="mt-1 text-sm font-semibold text-white">WhatsApp Client Handler</div>
              </div>
              <div className="marketing-live">AI · Governed</div>
            </div>
            <div className="mt-5 grid gap-3">
              <div className="marketing-chat-in">I need a 3BHK near Baner, budget around ₹1.5 crore.</div>
              <div className="marketing-agent-thinking">
                <Sparkles size={14} />
                AI reads CRM context + tenant property knowledge
              </div>
              <div className="marketing-tool-row">
                <span>search_properties()</span><span>L0 · allowed</span>
              </div>
              <div className="marketing-tool-row">
                <span>create_requirement()</span><span>L1 · allowed</span>
              </div>
              <div className="marketing-chat-out">
                I found matching options and saved your requirement. Would you like me to shortlist the top 3 or schedule a site visit?
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-section-dark">
        <div className="marketing-container">
          <PublicPricing />
          <div className="mt-6 text-center">
            <Link href="/pricing" className="text-xs font-medium text-violet-300">
              See subscription and commercial model details →
            </Link>
          </div>
        </div>
      </section>

      <section id="enterprise" className="marketing-section">
        <div className="marketing-container">
          <div className="marketing-enterprise">
            <div className="max-w-3xl">
              <div className="marketing-eyebrow">Security & enterprise</div>
              <h2 className="marketing-section-title mt-3">
                Strong controls underneath every polished screen.
              </h2>
              <p className="marketing-section-copy">
                Tenant isolation, scoped roles, auditable changes, encrypted secrets,
                SSO/SCIM foundations, controlled AI tools and production-grade deployment
                architecture are part of the platform—not afterthoughts.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [ShieldCheck, 'Tenant isolation'],
                [Users, 'Scoped access'],
                [Code2, 'Developer platform'],
                [CircleDollarSign, 'Commercial controls'],
              ].map(([Icon, label]) => {
                const C = Icon as typeof ShieldCheck;
                return (
                  <div key={String(label)} className="marketing-enterprise-chip">
                    <C size={16} />
                    <span>{String(label)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-8">
              <Link href="/security" className="marketing-secondary-cta">
                Explore security architecture
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-final">
        <div className="marketing-container text-center">
          <div className="marketing-eyebrow">Ready when you are</div>
          <h2 className="marketing-final-title">Give your business one intelligent operating layer.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-500">
            Create the workspace now. Production provider activation, live payment rails
            and final deployment can be connected when you are ready.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="marketing-primary-cta">
              Create workspace <ArrowRight size={15} />
            </Link>
            <Link href="/login" className="marketing-secondary-cta">Sign in</Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
