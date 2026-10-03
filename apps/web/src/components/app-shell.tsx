'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Code2,
  Command,
  CreditCard,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Workflow,
  X,
  type IconComponent,
} from '@/components/icons';
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Entitlement = {
  key: string;
  enabled: boolean;
};

type SessionData = {
  organization: {
    isPlatformAdmin?: boolean;
    organization: {
      name: string;
      slug: string;
    };
  };
  capabilities: {
    entitlements: Entitlement[];
  };
};

type NavItem = {
  label: string;
  href: string;
  icon: IconComponent;
  description: string;
  entitlement?: string;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Command Center', href: '/dashboard', icon: LayoutDashboard, description: 'Overview and operating status' },
      { label: 'CRM', href: '/crm', icon: BriefcaseBusiness, description: 'Contacts, leads, deals and follow-up' },
      { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircleMore, description: 'Inbox, templates and campaigns' },
      { label: 'AI Agents', href: '/ai-agents', icon: Bot, description: 'Governed AI workers and policies' },
      { label: 'Automations', href: '/automations', icon: Workflow, description: 'Visual workflow control center' },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Real Estate', href: '/real-estate', icon: Building2, description: 'Property, buyer and booking workspace', entitlement: 'extension.realestate' },
      { label: 'Attendance', href: '/attendance', icon: CalendarDays, description: 'Employee operations and attendance', entitlement: 'extension.attendance' },
      { label: 'Business Billing', href: '/billing', icon: CircleDollarSign, description: 'Quotes, invoices and customer payments' },
      { label: 'Analytics', href: '/analytics', icon: BarChart3, description: 'Cross-module business intelligence' },
    ],
  },
  {
    label: 'People & Access',
    items: [
      { label: 'Staff & Seats', href: '/staff', icon: Users, description: 'Staff directory and product seats' },
      { label: 'Team & Roles', href: '/team', icon: ShieldCheck, description: 'Invitations, roles and resource scope' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Subscription', href: '/subscription', icon: CreditCard, description: 'Plan, add-ons, usage and SaaS billing' },
      { label: 'Developer', href: '/developer', icon: Code2, description: 'API keys, OAuth and webhooks', entitlement: 'core.api' },
      { label: 'Marketplace', href: '/marketplace', icon: Store, description: 'Extensions and capabilities' },
      { label: 'Enterprise', href: '/enterprise', icon: KeyRound, description: 'SSO, SCIM and enterprise policy', entitlement: 'enterprise.controls' },
      { label: 'Provider', href: '/provider', icon: Gauge, description: 'Provider operations and controls', adminOnly: true },
      { label: 'Commercial Ops', href: '/provider/commercial', icon: CircleDollarSign, description: 'Plans, meters, add-ons and coupons', adminOnly: true },
    ],
  },
];

const publicPrefixes = ['/login', '/register', '/sso', '/platform', '/pricing', '/security'];

function routeMatches(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicRoute =
    pathname === '/' || publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  const [session, setSession] = useState<SessionData>();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = globalThis.localStorage?.getItem('business-os-sidebar');
    const timer = globalThis.setTimeout(() => {
      if (saved === 'collapsed') setCollapsed(true);
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (publicRoute) return;
    let cancelled = false;
    fetch('/api/session', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace('/login');
          return undefined;
        }
        if (!response.ok) return undefined;
        return (await response.json()) as SessionData;
      })
      .then((data) => {
        if (!cancelled && data) setSession(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [publicRoute, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setMobileOpen(false);
      }
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const timer = globalThis.setTimeout(() => searchRef.current?.focus(), 50);
    return () => globalThis.clearTimeout(timer);
  }, [paletteOpen]);

  const enabled = useMemo(
    () => new Set(session?.capabilities.entitlements.filter((item) => item.enabled).map((item) => item.key) ?? []),
    [session],
  );

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (item.adminOnly && session?.organization.isPlatformAdmin !== true) return false;
            if (item.entitlement && (!session || !enabled.has(item.entitlement))) return false;
            return true;
          }),
        }))
        .filter((group) => group.items.length > 0),
    [enabled, session],
  );

  const allItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  );
  const current = allItems
    .filter((item) => routeMatches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const parentGroup = visibleGroups.find((group) =>
    group.items.some((item) => item.href === current?.href),
  );

  const paletteItems = allItems.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      item.label.toLowerCase().includes(needle) ||
      item.description.toLowerCase().includes(needle)
    );
  });

  function toggleCollapsed() {
    setCollapsed((currentState) => {
      const next = !currentState;
      globalThis.localStorage?.setItem(
        'business-os-sidebar',
        next ? 'collapsed' : 'expanded',
      );
      return next;
    });
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  if (publicRoute) return children;

  return (
    <div className="premium-shell">
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>

      <aside
        className={
          'premium-sidebar ' +
          (collapsed ? 'premium-sidebar--collapsed' : '')
        }
        aria-label="Primary navigation"
      >
        <div className="premium-brand">
          <div className="premium-brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <div className="premium-brand-kicker">Business OS</div>
              <div className="premium-brand-name">
                {session?.organization.organization.name ?? 'Workspace'}
              </div>
            </div>
          ) : null}
        </div>

        <div className="premium-sidebar-scroll">
          {visibleGroups.map((group) => (
            <div key={group.label} className="premium-nav-group">
              {!collapsed ? (
                <div className="premium-nav-label">{group.label}</div>
              ) : null}
              <nav className="premium-nav-list" aria-label={group.label}>
                {group.items.map((item) => {
                  const active = routeMatches(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={
                        'premium-nav-item ' +
                        (active ? 'premium-nav-item--active' : '')
                      }
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={18} />
                      {!collapsed ? (
                        <span className="premium-nav-copy">
                          <span>{item.label}</span>
                          {active ? <ChevronRight size={14} /> : null}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="premium-sidebar-footer">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="premium-icon-button premium-sidebar-toggle"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-zinc-300">
                {session?.organization.organization.slug ?? 'secure tenant'}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-600">
                Tenant isolated
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <div className={collapsed ? 'premium-frame premium-frame--collapsed' : 'premium-frame'}>
        <header className="premium-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="premium-icon-button lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div className="min-w-0">
              <div className="premium-breadcrumb">
                <span>Business OS</span>
                {parentGroup ? (
                  <>
                    <ChevronRight size={12} />
                    <span>{parentGroup.label}</span>
                  </>
                ) : null}
              </div>
              <div className="truncate text-sm font-semibold text-zinc-100">
                {current?.label ?? 'Workspace'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="premium-command-trigger"
              aria-label="Open command palette"
            >
              <Search size={16} />
              <span className="hidden sm:inline">Search workspace</span>
              <kbd>⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={logout}
              className="premium-avatar-button"
              aria-label="Sign out"
              title="Sign out"
            >
              {(session?.organization.organization.name ?? 'B')
                .slice(0, 1)
                .toUpperCase()}
            </button>
          </div>
        </header>

        <div
          id="workspace-main"
          className="premium-content"
          tabIndex={-1}
          role="main"
        >
          {children}
        </div>
      </div>

      {mobileOpen ? (
        <div className="premium-mobile-layer" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            className="premium-mobile-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="premium-mobile-drawer">
            <div className="premium-mobile-header">
              <div className="flex items-center gap-3">
                <div className="premium-brand-mark">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="premium-brand-kicker">Business OS</div>
                  <div className="max-w-[220px] truncate text-sm font-semibold">
                    {session?.organization.organization.name ?? 'Workspace'}
                  </div>
                </div>
              </div>
              <button
                className="premium-icon-button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>
            <div className="premium-mobile-scroll">
              {visibleGroups.map((group) => (
                <div key={group.label} className="premium-nav-group">
                  <div className="premium-nav-label">{group.label}</div>
                  <nav className="premium-nav-list" aria-label={group.label}>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = routeMatches(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={
                            'premium-nav-item ' +
                            (active ? 'premium-nav-item--active' : '')
                          }
                        >
                          <Icon size={18} />
                          <span className="premium-nav-copy">
                            <span>{item.label}</span>
                            {active ? <ChevronRight size={14} /> : null}
                          </span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      {paletteOpen ? (
        <div
          className="premium-command-layer"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <button
            className="premium-command-backdrop"
            aria-label="Close command palette"
            onClick={() => setPaletteOpen(false)}
          />
          <div className="premium-command">
            <div className="premium-command-search">
              <Search size={18} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Go to CRM, WhatsApp, Analytics…"
                aria-label="Search workspace navigation"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="premium-command-results">
              {paletteItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setPaletteOpen(false);
                      setQuery('');
                      router.push(item.href);
                    }}
                    className="premium-command-result"
                  >
                    <span className="premium-command-icon">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium text-zinc-100">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">
                        {item.description}
                      </span>
                    </span>
                    <Command size={14} className="text-zinc-700" />
                  </button>
                );
              })}
              {!paletteItems.length ? (
                <div className="px-5 py-10 text-center">
                  <Boxes size={26} className="mx-auto text-zinc-700" />
                  <div className="mt-3 text-sm font-medium text-zinc-300">
                    No destination found
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Try a module name such as CRM, billing, AI or analytics.
                  </div>
                </div>
              ) : null}
            </div>
            <div className="premium-command-footer">
              <span><kbd>⌘K</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
