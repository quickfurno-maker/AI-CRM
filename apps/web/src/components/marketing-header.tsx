import Link from 'next/link';
import { Sparkles } from '@/components/icons';

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-container flex h-full items-center justify-between gap-5">
        <Link href="/" className="marketing-logo" aria-label="Business OS home">
          <span className="marketing-logo-mark">
            <Sparkles size={18} />
          </span>
          <span>
            <span className="marketing-logo-kicker">AI Business</span>
            <span className="marketing-logo-name">Operating System</span>
          </span>
        </Link>

        <nav className="marketing-nav hidden items-center gap-1 lg:flex" aria-label="Public navigation">
          <Link href="/platform">Platform</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/security">Security</Link>
          <Link href="/#ai">AI + WhatsApp</Link>
          <Link href="/#enterprise">Enterprise</Link>
        </nav>

        <div className="flex items-center gap-2">
          <details className="marketing-mobile-menu lg:hidden">
            <summary aria-label="Open website navigation">Menu</summary>
            <div className="marketing-mobile-menu-panel">
              <Link href="/platform">Platform</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/security">Security</Link>
              <Link href="/#ai">AI + WhatsApp</Link>
              <Link href="/#enterprise">Enterprise</Link>
            </div>
          </details>
          <Link href="/login" className="marketing-login">
            Sign in
          </Link>
          <Link href="/register" className="marketing-cta-small">
            Start workspace
          </Link>
        </div>
      </div>
    </header>
  );
}
