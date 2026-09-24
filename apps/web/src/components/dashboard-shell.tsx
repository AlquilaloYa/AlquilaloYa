"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AccessControl } from "@contract/domain/rbac";
import type { Permission } from "@contract/domain/rbac";
import { TopBar, type SearchResult } from "@/components/top-bar";
import { AppointmentReminders } from "@/components/appointment-reminders";
import {
  LayoutDashboard,
  Star,
  Banknote,
  Contact,
  Building2,
  FileText,
  FilePlus2,
  FileCheck,
  Activity,
  ShieldCheck,
  Settings,
  ChevronDown,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Workflow,
  ListChecks,
  Kanban,
  Briefcase,
  CalendarClock,
  Users,
  BookUser,
  Filter,
  MessageSquare,
  Zap,
  Megaphone,
  ScrollText,
  LayoutGrid,
  UserCog,
  HardDrive,
  ListTodo,
  Mail,
  Table,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
  phase?: string;
  permission?: Permission;
  external?: boolean;
  group?: "contratos" | "marketing" | "google";
}

const GOOGLE_CONSOLE = "https://console.cloud.google.com/apis/library/";

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Dashboard" },
  { href: "/disponibilidad", label: "Disponibilidad", icon: LayoutGrid, section: "Disponibilidad", permission: "department.read" },
  { href: "/pipeline", label: "Pipeline", icon: Filter, section: "Pipeline", permission: "client.read", group: "marketing" },
  { href: "/mensajes", label: "Mensajes", icon: MessageSquare, section: "Mensajes", permission: "client.read", group: "marketing" },
  { href: "/automatizaciones", label: "Automatizaciones", icon: Zap, section: "Automatizaciones", permission: "client.read", group: "marketing" },
  { href: "/directorio", label: "Directorio", icon: BookUser, section: "Directorio" },
  { href: "/contactos", label: "Contactos", icon: Contact, section: "Contactos", group: "contratos" },
  { href: "/departamentos", label: "Uni/Dep", icon: Building2, section: "Departamentos", permission: "department.read", group: "contratos" },
  { href: "/contratos", label: "Pre contrato", icon: FileText, section: "Contratos", permission: "contract.read", group: "contratos" },
  { href: "/contrato-final", label: "Contrato Final", icon: FileCheck, section: "Contrato Final", permission: "contract.read", group: "contratos" },
  { href: "/adendas", label: "Adendas", icon: ScrollText, section: "Adendas", permission: "contract.read", group: "contratos" },
  { href: "/plantillas", label: "Plantillas", icon: FilePlus2, section: "Plantillas", permission: "template.read", group: "contratos" },
  { href: "/clientes", label: "Clientes", icon: Star, section: "Clientes", permission: "client.read" },
  { href: "/pagos", label: "Cobranza", icon: Banknote, section: "Cobranza", permission: "contract.read" },
  { href: "/workflow", label: "Workflow", icon: Workflow, section: "Workflow", permission: "contract.read" },
  { href: "/checklist", label: "Checklist", icon: ListChecks, section: "Checklist" },
  { href: "/work-123", label: "Work 123", icon: Kanban, section: "Work 123", permission: "contract.read" },
  { href: "/agenda", label: "Agenda", icon: CalendarClock, section: "Agenda", permission: "contract.read" },
  { href: "/rrhh", label: "Recursos Humanos", icon: Users, section: "Recursos Humanos", permission: "contract.read" },
  { href: `${GOOGLE_CONSOLE}gmail.googleapis.com?project=alquilaloya-509617`, label: "Gmail", icon: Mail, section: "Google SyS", group: "google", external: true },
  { href: `${GOOGLE_CONSOLE}drive.googleapis.com?project=alquilaloya-509617`, label: "Google Drive", icon: HardDrive, section: "Google SyS", group: "google", external: true },
  { href: `${GOOGLE_CONSOLE}sheets.googleapis.com?project=alquilaloya-509617`, label: "Google Sheets", icon: Table, section: "Google SyS", group: "google", external: true },
  { href: `${GOOGLE_CONSOLE}docs.googleapis.com?project=alquilaloya-509617`, label: "Google Docs", icon: FileText, section: "Google SyS", group: "google", external: true },
  { href: `${GOOGLE_CONSOLE}tasks.googleapis.com?project=alquilaloya-509617`, label: "Google Tasks", icon: ListTodo, section: "Google SyS", group: "google", external: true },
];

const FOOTER_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: "Configuración", icon: Settings },
  { label: "Soporte", icon: HelpCircle },
];

const CONFIGURATION_ITEMS: NavItem[] = [
  { href: "/auditoria", label: "Auditoría", icon: ShieldCheck, section: "Auditoría", permission: "audit.read" },
  { href: "/actividad", label: "Actividad", icon: Activity, section: "Actividad", permission: "activity.read" },
  { href: "/integraciones", label: "Integraciones", icon: Plug, section: "Integraciones", permission: "integration.read" },
  { href: "/configuraciones/usuarios", label: "Usuarios", icon: UserCog, section: "Usuarios", permission: "user.read" },
];

function visibleNav(role: import("@contract/domain/rbac").UserRole): NavItem[] {
  if (!role) return [];
  const ac = AccessControl.forRole(role);
  return NAV_ITEMS.filter((n) => !n.permission || ac.can(n.permission));
}

const SEARCH_RESULTS: SearchResult[] = [...NAV_ITEMS, ...CONFIGURATION_ITEMS]
  .filter((n) => !n.external)
  .map((n) => ({
    href: n.href,
    label: n.label,
    section: n.section,
  }));

function GoogleLogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname();
  const active = pathname === item.href;
  const Icon = item.icon;
  const className = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-surface-container-low text-primary border-l-2 border-primary font-bold dark:bg-white/10 dark:text-white dark:border-white"
      : "text-on-surface-variant hover:bg-surface-container-high dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white border-l-2 border-transparent"
  } ${collapsed ? "justify-center px-0" : ""}`;
  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        className={className}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed ? (
          <>
            <span className="flex-1">{item.label}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </>
        ) : null}
      </a>
    );
  }
  return (
    <Link
      href={item.href}
      {...(onNavigate
        ? { onClick: () => onNavigate() }
        : {})}
      {...(collapsed
        ? { title: item.label, "aria-label": item.label }
        : {})}
      className={className}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed ? (
        <>
          <span className="flex-1">{item.label}</span>
          {item.phase ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-white/10 dark:text-white/70">
              {item.phase}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

function NavGroup({
  label,
  icon: Icon,
  items,
  collapsed,
  open,
  onToggle,
  onNavigate,
}: {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname();
  const childActive = items.some((item) => pathname === item.href);
  if (items.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? label : undefined}
        aria-label={label}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          childActive
            ? "text-primary dark:text-white"
            : "text-on-surface-variant hover:bg-surface-container-high dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white"
        } ${collapsed ? "justify-center px-0" : ""}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed ? <span className="flex-1 text-left">{label}</span> : null}
        {!collapsed ? (
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        ) : null}
      </button>
      {open ? (
        <div className={collapsed ? "mt-1" : "ml-5 mt-1 flex flex-col gap-1 border-l border-outline-variant/40 pl-2 dark:border-white/10"}>
          {items.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [contractsOpen, setContractsOpen] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface">
        <div className="flex items-center gap-3 font-body-md text-on-surface-variant">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
          Cargando sesión…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface">
        <div className="flex items-center gap-3 font-body-md text-on-surface-variant">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
          Redirigiendo al inicio de sesión…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/10 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 flex h-full flex-col border-r border-outline-variant py-6 transition-transform duration-200 dark:border-white/10 ${
          mobileOpen
            ? "z-40 bg-surface dark:bg-[#151a24]"
            : "z-20 dark:bg-[#151a24]"
        } ${
          collapsed ? "w-[68px]" : "w-64"
        } ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className={`mb-8 flex items-center ${collapsed ? "justify-center px-0" : "justify-between gap-2 px-5"}`}>
          {!collapsed ? (
            <>
              <h1 className="font-headline-md font-bold leading-tight text-primary dark:text-white">
                AlquilaYa ERP
              </h1>
              <button
                onClick={() => setCollapsed(true)}
                className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container-high dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
                aria-label="Cerrar barra lateral"
                title="Cerrar barra lateral"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container-high dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
              aria-label="Abrir barra lateral"
              title="Abrir barra lateral"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="scrollbar-invisible flex flex-1 flex-col gap-1 overflow-y-auto px-2">
          {(() => {
            const items = visibleNav(user.role);
            const gruposNav: Array<{
              key: NonNullable<NavItem["group"]>;
              label: string;
              icon: React.ElementType;
              open: boolean;
              onToggle: () => void;
            }> = [
              {
                key: "marketing",
                label: "Marketing",
                icon: Megaphone,
                open: marketingOpen,
                onToggle: () => setMarketingOpen((open) => !open),
              },
              {
                key: "contratos",
                label: "Sistema de Contratos",
                icon: Briefcase,
                open: contractsOpen,
                onToggle: () => setContractsOpen((open) => !open),
              },
              {
                key: "google",
                label: "Google SyS",
                icon: GoogleLogoIcon,
                open: googleOpen,
                onToggle: () => setGoogleOpen((open) => !open),
              },
            ];
            const renderedGroups = new Set<NonNullable<NavItem["group"]>>();
            return items.map((item) => {
              const groupKey = item.group;
              if (!groupKey) {
                return (
                  <NavLink
                    key={item.href}
                    item={item}
                    collapsed={collapsed}
                    onNavigate={() => setMobileOpen(false)}
                  />
                );
              }
              if (renderedGroups.has(groupKey)) return null;
              renderedGroups.add(groupKey);
              const grupo = gruposNav.find((g) => g.key === groupKey);
              if (!grupo) return null;
              const groupItems = items.filter((n) => n.group === groupKey);
              return (
                <NavGroup
                  key={grupo.key}
                  label={grupo.label}
                  icon={grupo.icon}
                  items={groupItems}
                  collapsed={collapsed}
                  open={grupo.open}
                  onToggle={grupo.onToggle}
                  onNavigate={() => setMobileOpen(false)}
                />
              );
            });
          })()}
        </nav>

        <div className="mt-auto border-t border-outline-variant/30 pt-4 px-2 dark:border-white/10">
          <ul className="flex flex-col gap-1">
            {FOOTER_ITEMS.map((item) => {
              const Icon = item.icon;
              const configurationAc = AccessControl.forRole(user.role);
              const configurationItems = CONFIGURATION_ITEMS.filter(
                (n) => !n.permission || configurationAc.can(n.permission)
              );
              const isConfiguration = item.label === "Configuración";
              return (
                <li key={item.label}>
                  <button
                    onClick={() => isConfiguration && setConfigurationOpen((open) => !open)}
                    title={collapsed ? item.label : undefined}
                    className={`flex w-full items-center gap-3 rounded-r-md px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white ${
                      collapsed ? "justify-center px-0" : ""
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed ? item.label : null}
                    {!collapsed && isConfiguration && configurationItems.length > 0 ? (
                      <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${configurationOpen ? "rotate-180" : ""}`} />
                    ) : null}
                  </button>
                  {isConfiguration && configurationOpen && configurationItems.length > 0 ? (
                    <div className={collapsed ? "mt-1" : "ml-5 mt-1 border-l border-outline-variant/40 pl-2 dark:border-white/10"}>
                      {configurationItems.map((configurationItem) => (
                        <NavLink
                          key={configurationItem.href}
                          item={configurationItem}
                          collapsed={collapsed}
                          onNavigate={() => setMobileOpen(false)}
                        />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className={`flex min-w-0 flex-1 flex-col ${collapsed ? "lg:ml-[68px]" : "lg:ml-64"}`}>
        <TopBar results={SEARCH_RESULTS} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-container-padding">
          {children}
        </main>
      </div>

      <AppointmentReminders />
    </div>
  );
}