import Link from 'next/link';
import {
  Bot,
  LockKeyhole,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Workflow,
  type IconComponent,
} from '@/components/icons';
import type { ReactNode } from 'react';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label="Business OS capabilities">
        <div className="auth-story-inner">
          <Link href="/" className="auth-logo" aria-label="Business OS home">
            <span className="premium-brand-mark">
              <Sparkles size={18} />
            </span>
            <span>
              <span className="auth-logo-kicker">AI Business</span>
              <span className="auth-logo-name">Operating System</span>
            </span>
          </Link>

          <div className="auth-story-copy">
            <div className="auth-story-badge">
              <ShieldCheck size={14} />
              Secure multi-tenant workspace
            </div>
            <h2>
              Run customer operations,
              <span> intelligence and execution</span>
              from one workspace.
            </h2>
            <p>
              CRM, WhatsApp, governed AI and automation stay connected to the
              same source of truth, permissions and audit trail.
            </p>
          </div>

          <div className="auth-feature-grid">
            <AuthFeature
              icon={MessageCircleMore}
              label="Customer conversations"
              detail="WhatsApp, campaigns and handoff"
            />
            <AuthFeature
              icon={Bot}
              label="Governed AI"
              detail="Permissioned tools and tenant knowledge"
            />
            <AuthFeature
              icon={Workflow}
              label="Automation"
              detail="Durable workflows, approvals and trace"
            />
            <AuthFeature
              icon={LockKeyhole}
              label="Enterprise controls"
              detail="RBAC, scope, audit and isolation"
            />
          </div>

          <div className="auth-trust-line">
            <span className="auth-trust-dot" />
            Tenant isolation and policy enforcement are server-side.
          </div>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-form-heading">
            <div className="auth-form-eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
          <div className="auth-form-footer">{footer}</div>
        </div>
      </section>
    </main>
  );
}

function AuthFeature({
  icon: Icon,
  label,
  detail,
}: {
  icon: IconComponent;
  label: string;
  detail: string;
}) {
  return (
    <div className="auth-feature">
      <span className="auth-feature-icon">
        <Icon size={17} />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}
