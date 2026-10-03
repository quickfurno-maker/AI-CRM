import Link from 'next/link';
import { Sparkles } from '@/components/icons';

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-container">
        <div className="grid gap-10 border-b border-white/[0.07] pb-12 lg:grid-cols-[1.2fr_.8fr_.8fr_.8fr]">
          <div>
            <Link href="/" className="marketing-logo">
              <span className="marketing-logo-mark">
                <Sparkles size={18} />
              </span>
              <span>
                <span className="marketing-logo-kicker">AI Business</span>
                <span className="marketing-logo-name">Operating System</span>
              </span>
            </Link>
            <p className="mt-5 max-w-md text-sm leading-6 text-zinc-500">
              CRM, WhatsApp, governed AI, automation, analytics and operations in one
              secure multi-tenant platform.
            </p>
          </div>
          <FooterColumn
            title="Product"
            links={[
              ['Platform', '/platform'],
              ['Pricing', '/pricing'],
              ['Security', '/security'],
              ['Sign in', '/login'],
            ]}
          />
          <FooterColumn
            title="Capabilities"
            links={[
              ['CRM', '/platform#crm'],
              ['WhatsApp', '/platform#whatsapp'],
              ['AI Agents', '/platform#ai'],
              ['Automation', '/platform#automation'],
            ]}
          />
          <FooterColumn
            title="Get started"
            links={[
              ['Create workspace', '/register'],
              ['Subscription plans', '/pricing'],
              ['Enterprise security', '/security'],
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-6 text-[11px] text-zinc-700">
          <span>© 2026 Business OS. All rights reserved.</span>
          <span>Tenant-isolated · Audit-ready · Governed AI</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<[string, string]>;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {title}
      </div>
      <div className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <Link key={href + label} href={href} className="text-sm text-zinc-500 transition hover:text-zinc-200">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
