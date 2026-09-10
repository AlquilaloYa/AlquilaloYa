"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AccessControl } from "@contract/domain/rbac";
import type { Permission } from "@contract/domain/rbac";
import { TopBar, type SearchResult } from "@/components/top-bar";
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
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
  phase?: string;
  permission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Dashboard" },
  { href: "/contactos", label: "Contactos", icon: Contact, section: "Contactos" },
  { href: "/departamentos", label: "Uni/Dep", icon: Building2, section: "Departamentos", permission: "department.read" },
  { href: "/contratos", label: "Pre contrato", icon: FileText, section: "Contratos", permission: "contract.read" },
  { href: "/contrato-final", label: "Contrato Final", icon: FileCheck, section: "Contrato Final", permission: "contract.read" },
  { href: "/clientes", label: "Clientes", icon: Star, section: "Clientes", permission: "client.read" },
  { href: "/pagos", label: "Cobranza", icon: Banknote, section: "Cobranza", permission: "contract.read" },
  { href: "/plantillas", label: "Plantillas", icon: FilePlus2, section: "Plantillas", permission: "template.read" },
  { href: "/workflow", label: "Workflow", icon: Workflow, section: "Workflow", permission: "contract.read" },
  { href: "/checklist", label: "Checklist", icon: ListChecks, section: "Checklist" },
  { href: "/actividad", label: "Actividad", icon: Activity, section: "Actividad", permission: "activity.read" },
  { href: "/integraciones", label: "Integraciones", icon: Plug, section: "Integraciones", permission: "integration.read" },
];

const FOOTER_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: "Configuración", icon: Settings },
  { label: "Soporte", icon: HelpCircle },
];

const CONFIGURATION_ITEMS: NavItem[] = [
  { href: "/auditoria", label: "Auditoría", icon: ShieldCheck, section: "Auditoría", permission: "audit.read" },
];

function visibleNav(role: import("@contract/domain/rbac").UserRole): NavItem[] {
  if (!role) return [];
  const ac = AccessControl.forRole(role);
  return NAV_ITEMS.filter((n) => !n.permission || ac.can(n.permission));
}

const SEARCH_RESULTS: SearchResult[] = [...NAV_ITEMS, ...CONFIGURATION_ITEMS].map((n) => ({
  href: n.href,
  label: n.label,
  section: n.section,
}));

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      {...(onNavigate
        ? { onClick: () => onNavigate() }
        : {})}
      {...(collapsed
        ? { title: item.label, "aria-label": item.label }
        : {})}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-surface-container-low text-primary border-l-2 border-primary font-bold dark:bg-white/10 dark:text-white dark:border-white"
          : "text-on-surface-variant hover:bg-surface-container-high dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white border-l-2 border-transparent"
      } ${collapsed ? "justify-center px-0" : ""}`}
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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);

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
            ? "z-40 bg-surface/40 backdrop-blur-md supports-[backdrop-filter]:bg-surface/25 dark:bg-[#151a24]/60"
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
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded">
                  <img src="/logo-white-mode.png" alt="CP" className="h-8 w-auto object-contain dark:hidden" />
                  <img src="/logo-black-mode.png" alt="CP" className="h-8 w-auto object-contain hidden dark:block" />
                </div>
                <div>
                  <h1 className="font-headline-md font-bold leading-tight text-primary dark:text-white">
                    CP ERP
                  </h1>
                </div>
              </div>
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

        <nav className="flex flex-1 flex-col gap-1 px-2">
          {visibleNav(user.role).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-outline-variant/30 pt-4 px-2 dark:border-white/10">
          <ul className="flex flex-col gap-1">
            {FOOTER_ITEMS.map((item) => {
              const Icon = item.icon;
              const configurationItems = visibleNav(user.role).filter((navItem) =>
                CONFIGURATION_ITEMS.some((configurationItem) => configurationItem.href === navItem.href)
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
    </div>
  );
}