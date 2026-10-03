import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };
export type IconComponent = (props: IconProps) => React.ReactNode;

function Icon({
  size = 18,
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props['aria-label'] ? undefined : true}
      {...props}
    >
      {children}
    </svg>
  );
}

export const Sparkles: IconComponent = (props) => (
  <Icon {...props}><path d="m12 3 1.1 3.2L16 7.4l-2.9 1.1L12 12l-1.1-3.5L8 7.4l2.9-1.2L12 3Z"/><path d="m18.2 13 .7 2 2.1.8-2.1.8-.7 2.1-.8-2.1-2-.8 2-.8.8-2Z"/><path d="m5 13 .8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z"/></Icon>
);
export const LayoutDashboard: IconComponent = (props) => (
  <Icon {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></Icon>
);
export const BriefcaseBusiness: IconComponent = (props) => (
  <Icon {...props}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></Icon>
);
export const MessageCircleMore: IconComponent = (props) => (
  <Icon {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></Icon>
);
export const Bot: IconComponent = (props) => (
  <Icon {...props}><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6M3 12h2M19 12h2"/></Icon>
);
export const Workflow: IconComponent = (props) => (
  <Icon {...props}><rect x="3" y="3" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><rect x="15" y="3" width="6" height="5" rx="1"/><path d="M9 5.5h6M6 8v5a3 3 0 0 0 3 3h6"/></Icon>
);
export const Building2: IconComponent = (props) => (
  <Icon {...props}><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M16 9h3a1 1 0 0 1 1 1v11M8 7h4M8 11h4M8 15h4M8 19h4M3 21h18"/></Icon>
);
export const CalendarDays: IconComponent = (props) => (
  <Icon {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></Icon>
);
export const CircleDollarSign: IconComponent = (props) => (
  <Icon {...props}><circle cx="12" cy="12" r="9"/><path d="M16 8.5c-.8-.9-2.1-1.5-4-1.5-2.2 0-4 1.1-4 3s1.8 2.6 4 3 4 1 4 3-1.8 3-4 3c-1.9 0-3.3-.6-4.2-1.7M12 5v14"/></Icon>
);
export const BarChart3: IconComponent = (props) => (
  <Icon {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></Icon>
);
export const Users: IconComponent = (props) => (
  <Icon {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Icon>
);
export const ShieldCheck: IconComponent = (props) => (
  <Icon {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></Icon>
);
export const CreditCard: IconComponent = (props) => (
  <Icon {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></Icon>
);
export const Code2: IconComponent = (props) => (
  <Icon {...props}><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></Icon>
);
export const Store: IconComponent = (props) => (
  <Icon {...props}><path d="m3 9 2-5h14l2 5M5 13v8h14v-8"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-6h6v6"/></Icon>
);
export const KeyRound: IconComponent = (props) => (
  <Icon {...props}><circle cx="8" cy="15" r="5"/><path d="m12 11 8-8M17 6l2 2M15 8l2 2"/></Icon>
);
export const Gauge: IconComponent = (props) => (
  <Icon {...props}><path d="M4.9 19a9 9 0 1 1 14.2 0M12 13l4-4"/><path d="M8 19h8"/></Icon>
);
export const ChevronRight: IconComponent = (props) => (
  <Icon {...props}><path d="m9 18 6-6-6-6"/></Icon>
);
export const Menu: IconComponent = (props) => (
  <Icon {...props}><path d="M4 7h16M4 12h16M4 17h16"/></Icon>
);
export const PanelLeftOpen: IconComponent = (props) => (
  <Icon {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M14 9l3 3-3 3"/></Icon>
);
export const PanelLeftClose: IconComponent = (props) => (
  <Icon {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M17 9l-3 3 3 3"/></Icon>
);
export const Search: IconComponent = (props) => (
  <Icon {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>
);
export const Command: IconComponent = (props) => (
  <Icon {...props}><path d="M9 6V4a2 2 0 1 0-2 2h2v12H7a2 2 0 1 0 2 2v-2h6v2a2 2 0 1 0 2-2h-2V6h2a2 2 0 1 0-2-2v2H9Z"/></Icon>
);
export const X: IconComponent = (props) => (
  <Icon {...props}><path d="M6 6l12 12M18 6 6 18"/></Icon>
);
export const Boxes: IconComponent = (props) => (
  <Icon {...props}><path d="m12 2 4 2-4 2-4-2 4-2ZM4 7l4 2-4 2-4-2 4-2ZM20 7l4 2-4 2-4-2 4-2ZM12 12l4 2-4 2-4-2 4-2ZM4 12v5l4 2v-5M20 12v5l-4 2v-5M12 17v5"/></Icon>
);
export const LockKeyhole: IconComponent = (props) => (
  <Icon {...props}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></Icon>
);
export const ArrowRight: IconComponent = (props) => (
  <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>
);
export const LoaderCircle: IconComponent = (props) => (
  <Icon {...props}><path d="M21 12a9 9 0 1 1-3.2-6.9"/></Icon>
);
export const AlertTriangle: IconComponent = (props) => (
  <Icon {...props}><path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></Icon>
);
export const RefreshCw: IconComponent = (props) => (
  <Icon {...props}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.4 9A7 7 0 0 0 6.2 6.2L4 8M5.6 15A7 7 0 0 0 17.8 17.8L20 16"/></Icon>
);
export const ArrowLeft: IconComponent = (props) => (
  <Icon {...props}><path d="M19 12H5M11 18l-6-6 6-6"/></Icon>
);
export const SearchX: IconComponent = (props) => (
  <Icon {...props}><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8.5 8.5l4 4M12.5 8.5l-4 4"/></Icon>
);
export const ArrowUpRight: IconComponent = (props) => (
  <Icon {...props}><path d="M7 17 17 7M7 7h10v10"/></Icon>
);
export const Check: IconComponent = (props) => (
  <Icon {...props}><path d="m5 12 4 4L19 6"/></Icon>
);

export const Bell: IconComponent = (props) => (
  <Icon {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></Icon>
);
export const LifeBuoy: IconComponent = (props) => (
  <Icon {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m5.6 5.6 4.3 4.3M14.1 14.1l4.3 4.3M18.4 5.6l-4.3 4.3M9.9 14.1l-4.3 4.3"/></Icon>
);
export const Database: IconComponent = (props) => (
  <Icon {...props}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></Icon>
);
