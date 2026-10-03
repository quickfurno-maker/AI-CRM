'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
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
  Database,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
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
  useCallback,
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

type SearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

type Notification = {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  actionHref?: string | null;
  status: 'UNREAD' | 'READ';
  createdAt: string;
};

type NotificationPayload = {
  unreadCount: number;
  notifications: Notification[];
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
      { label: 'Support', href: '/support', icon: LifeBuoy, description: 'Tenant-bound support and provider conversations' },
      { label: 'Governance', href: '/governance', icon: Database, description: 'Retention, audit evidence and data requests' },
      { label: 'Subscription', href: '/subscription', icon: CreditCard, description: 'Plan, add-ons, usage and SaaS billing' },
      { label: 'Developer', href: '/developer', icon: Code2, description: 'API keys, OAuth and webhooks', entitlement: 'core.api' },
      { label: 'Marketplace', href: '/marketplace', icon: Store, description: 'Extensions and capabilities' },
      { label: 'Enterprise', href: '/enterprise', icon: KeyRound, description: 'SSO, SCIM and enterprise policy', entitlement: 'enterprise.controls' },
      { label: 'Provider', href: '/provider', icon: Gauge, description: 'Provider operations and controls', adminOnly: true },
      { label: 'Provider Experience', href: '/provider/experience', icon: LifeBuoy, description: 'Support and governance review queues', adminOnly: true },
      { label: 'Commercial Ops', href: '/provider/commercial', icon: CircleDollarSign, description: 'Plans, meters, add-ons and coupons', adminOnly: true },
    ],
  },
];

const publicPrefixes = [
  '/login',
  '/register',
  '/sso',
  '/platform',
  '/pricing',
  '/security',
  '/offline',
];

function routeMatches(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicRoute =
    pathname === '/' ||
    publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  const [session, setSession] = useState<SessionData>();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [notificationState, setNotificationState] =
    useState<NotificationPayload>({
      unreadCount: 0,
      notifications: [],
    });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = globalThis.localStorage?.getItem(
      'business-os-sidebar',
    );
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

  const loadNotifications = useCallback(async () => {
    if (publicRoute) return;
    const response = await fetch('/api/platform/notifications?limit=30', {
      cache: 'no-store',
    });
    if (!response.ok) return;
    setNotificationState(
      (await response.json()) as NotificationPayload,
    );
  }, [publicRoute]);

  useEffect(() => {
    if (!session) return;
    void loadNotifications();
  }, [loadNotifications, session]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setNotificationsOpen(false);
        setPaletteOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setNotificationsOpen(false);
        setMobileOpen(false);
      }
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () =>
      globalThis.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const timer = globalThis.setTimeout(
      () => searchRef.current?.focus(),
      50,
    );
    return () => globalThis.clearTimeout(timer);
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen || query.trim().length < 2) {
      setRemoteResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      setSearching(true);
      fetch(
        '/api/platform/search?q=' +
          encodeURIComponent(query.trim()) +
          '&limit=12',
        {
          cache: 'no-store',
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) return { results: [] as SearchResult[] };
          return (await response.json()) as {
            results: SearchResult[];
          };
        })
        .then((data) => setRemoteResults(data.results))
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 220);
    return () => {
      controller.abort();
      globalThis.clearTimeout(timer);
    };
  }, [paletteOpen, query]);

  const enabled = useMemo(
    () =>
      new Set(
        session?.capabilities.entitlements
          .filter((item) => item.enabled)
          .map((item) => item.key) ?? [],
      ),
    [session],
  );

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (
              item.adminOnly &&
              session?.organization.isPlatformAdmin !== true
            )
              return false;
            if (
              item.entitlement &&
              (!session || !enabled.has(item.entitlement))
            )
              return false;
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

  async function markNotification(
    notification: Notification,
  ) {
    if (notification.status === 'UNREAD') {
      await fetch(
        '/api/platform/notifications/' +
          notification.id +
          '/read',
        { method: 'POST' },
      );
      await loadNotifications();
    }
    if (notification.actionHref) {
      setNotificationsOpen(false);
      router.push(notification.actionHref);
    }
  }

  async function markAllRead() {
    await fetch('/api/platform/notifications/read-all', {
      method: 'POST',
    });
    await loadNotifications();
  }

  function openDestination(href: string) {
    setPaletteOpen(false);
    setQuery('');
    setRemoteResults([]);
    router.push(href);
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
                {session?.organization.organization.name ??
                  'Workspace'}
              </div>
            </div>
          ) : null}
        </div>

        <div className="premium-sidebar-scroll">
          {visibleGroups.map((group) => (
            <div key={group.label} className="premium-nav-group">
              {!collapsed ? (
                <div className="premium-nav-label">
                  {group.label}
                </div>
              ) : null}
              <nav
                className="premium-nav-list"
                aria-label={group.label}
              >
                {group.items.map((item) => {
                  const active = routeMatches(
                    pathname,
                    item.href,
                  );
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={
                        'premium-nav-item ' +
                        (active
                          ? 'premium-nav-item--active'
                          : '')
                      }
                      aria-current={active ? 'page' : undefined}
                      title={
                        collapsed ? item.label : undefined
                      }
                    >
                      <Icon size={18} />
                      {!collapsed ? (
                        <span className="premium-nav-copy">
                          <span>{item.label}</span>
                          {active ? (
                            <ChevronRight size={14} />
                          ) : null}
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
            aria-label={
              collapsed
                ? 'Expand navigation'
                : 'Collapse navigation'
            }
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
                {session?.organization.organization.slug ??
                  'secure tenant'}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-600">
                Tenant isolated
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <div
        className={
          collapsed
            ? 'premium-frame premium-frame--collapsed'
            : 'premium-frame'
        }
      >
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

          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen(false);
                setPaletteOpen(true);
              }}
              className="premium-command-trigger"
              aria-label="Search records and workspace"
            >
              <Search size={16} />
              <span className="hidden sm:inline">
                Search workspace
              </span>
              <kbd>⌘K</kbd>
            </button>

            <button
              type="button"
              onClick={() => {
                setPaletteOpen(false);
                setNotificationsOpen((currentState) => {
                  if (!currentState) void loadNotifications();
                  return !currentState;
                });
              }}
              className="premium-icon-button relative"
              aria-label={
                notificationState.unreadCount
                  ? notificationState.unreadCount +
                    ' unread notifications'
                  : 'Notifications'
              }
              aria-expanded={notificationsOpen}
            >
              <Bell size={17} />
              {notificationState.unreadCount ? (
                <span className="premium-notification-badge">
                  {Math.min(
                    notificationState.unreadCount,
                    99,
                  )}
                </span>
              ) : null}
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

            {notificationsOpen ? (
              <div
                className="premium-notification-panel"
                role="dialog"
                aria-label="Notifications"
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-200">
                      Notifications
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      {notificationState.unreadCount} unread
                    </div>
                  </div>
                  {notificationState.unreadCount ? (
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="text-[10px] font-medium text-violet-300"
                    >
                      Mark all read
                    </button>
                  ) : null}
                </div>
                <div className="max-h-[420px] overflow-y-auto p-2">
                  {notificationState.notifications.length ? (
                    notificationState.notifications.map(
                      (notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() =>
                            void markNotification(notification)
                          }
                          className={
                            'block w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.035] ' +
                            (notification.status === 'UNREAD'
                              ? 'bg-violet-400/[0.04]'
                              : '')
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-xs font-semibold text-zinc-300">
                              {notification.title}
                            </span>
                            {notification.status ===
                            'UNREAD' ? (
                              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-violet-300" />
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-600">
                            {notification.body}
                          </p>
                          <div className="mt-2 text-[9px] uppercase tracking-[0.12em] text-zinc-700">
                            {notification.category} ·{' '}
                            {new Date(
                              notification.createdAt,
                            ).toLocaleString()}
                          </div>
                        </button>
                      ),
                    )
                  ) : (
                    <div className="px-4 py-10 text-center text-xs text-zinc-600">
                      No operational notifications.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
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
        <div
          className="premium-mobile-layer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
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
                  <div className="premium-brand-kicker">
                    Business OS
                  </div>
                  <div className="max-w-[220px] truncate text-sm font-semibold">
                    {session?.organization.organization.name ??
                      'Workspace'}
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
                <div
                  key={group.label}
                  className="premium-nav-group"
                >
                  <div className="premium-nav-label">
                    {group.label}
                  </div>
                  <nav
                    className="premium-nav-list"
                    aria-label={group.label}
                  >
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = routeMatches(
                        pathname,
                        item.href,
                      );
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() =>
                            setMobileOpen(false)
                          }
                          className={
                            'premium-nav-item ' +
                            (active
                              ? 'premium-nav-item--active'
                              : '')
                          }
                        >
                          <Icon size={18} />
                          <span className="premium-nav-copy">
                            <span>{item.label}</span>
                            {active ? (
                              <ChevronRight size={14} />
                            ) : null}
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
          aria-label="Command palette and global search"
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
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search CRM records or navigate…"
                aria-label="Search CRM records and workspace navigation"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="premium-command-results">
              {paletteItems.length ? (
                <>
                  <div className="premium-command-section-label">
                    Navigation
                  </div>
                  {paletteItems.slice(0, query ? 6 : 20).map(
                    (item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() =>
                            openDestination(item.href)
                          }
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
                          <Command
                            size={14}
                            className="text-zinc-700"
                          />
                        </button>
                      );
                    },
                  )}
                </>
              ) : null}

              {query.trim().length >= 2 ? (
                <>
                  <div className="premium-command-section-label mt-2">
                    Records
                  </div>
                  {searching ? (
                    <div className="px-4 py-5 text-xs text-zinc-600">
                      Searching tenant records…
                    </div>
                  ) : remoteResults.length ? (
                    remoteResults.map((result) => (
                      <button
                        key={
                          result.type + ':' + result.id
                        }
                        type="button"
                        onClick={() =>
                          openDestination(result.href)
                        }
                        className="premium-command-result"
                      >
                        <span className="premium-command-icon">
                          <BriefcaseBusiness size={18} />
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block text-sm font-medium text-zinc-100">
                            {result.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">
                            {result.type}
                            {result.subtitle
                              ? ' · ' + result.subtitle
                              : ''}
                          </span>
                        </span>
                        <ChevronRight
                          size={14}
                          className="text-zinc-700"
                        />
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-5 text-xs text-zinc-600">
                      No accessible CRM records match this search.
                    </div>
                  )}
                </>
              ) : null}

              {!paletteItems.length &&
              query.trim().length < 2 ? (
                <div className="px-5 py-10 text-center">
                  <Boxes
                    size={26}
                    className="mx-auto text-zinc-700"
                  />
                  <div className="mt-3 text-sm font-medium text-zinc-300">
                    No destination found
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Type at least two characters to search
                    tenant CRM records.
                  </div>
                </div>
              ) : null}
            </div>
            <div className="premium-command-footer">
              <span>
                <kbd>⌘K</kbd> open
              </span>
              <span>
                <kbd>esc</kbd> close
              </span>
              <span>Search respects your CRM scope.</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
