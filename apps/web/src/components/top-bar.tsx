"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@contract/ui/components/button";
import { ThemeToggle } from "@contract/ui/components/theme-toggle";
import { Bell, LogOut, Menu } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";

interface InboxNotification {
  id: string;
  title: string;
  body: string;
  href: string;
  isRead: boolean;
  createdAt: string;
}

export interface SearchResult {
  href: string;
  label: string;
  section: string;
}

export function TopBar({
  results = [],
  onMenuClick,
}: {
  results?: SearchResult[];
  onMenuClick?: () => void;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState("");

  const refreshNotifications = useCallback(async () => {
    try {
      const response = await apiFetch("/api/notifications", {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "No se pudieron cargar las notificaciones");
      }
      const data = (await response.json()) as {
        items?: InboxNotification[];
        unreadCount?: number;
      };
      setNotifications(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(
        typeof data.unreadCount === "number" ? data.unreadCount : 0,
      );
      setNotificationError("");
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las notificaciones",
      );
    }
  }, []);

  useEffect(() => {
    void refreshNotifications();
    const interval = window.setInterval(() => {
      void refreshNotifications();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshNotifications]);

  async function openNotification(notification: InboxNotification) {
    if (!notification.isRead) {
      try {
        const response = await apiFetch(
          `/api/notifications/${notification.id}`,
          { method: "PATCH" },
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "No se pudo marcar como leída");
        }
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, isRead: true } : item,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (error) {
        setNotificationError(
          error instanceof Error
            ? error.message
            : "No se pudo marcar como leída",
        );
        return;
      }
    }
    setNotificationsOpen(false);
    if (notification.href.startsWith("/") && !notification.href.startsWith("//")) {
      router.push(notification.href);
    }
  }

  const initials =
    user?.name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 2xl:px-6">
      {onMenuClick ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
          aria-label="Abrir menú"
          title="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>
      ) : null}
      <div className="max-w-md flex-1">
        <CommandPalette navItems={results} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle
          theme={theme}
          onToggle={toggleTheme}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        />

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setNotificationsOpen((open) => !open);
              void refreshNotifications();
            }}
            aria-label={
              unreadCount
                ? `Notificaciones, ${unreadCount} sin leer`
                : "Notificaciones"
            }
            aria-expanded={notificationsOpen}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Button>
          {notificationsOpen ? (
            <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-semibold">Notificaciones</p>
                <p className="text-xs text-muted-foreground">
                  {unreadCount} sin leer
                </p>
              </div>
              {notificationError ? (
                <p role="alert" className="px-4 py-3 text-sm text-destructive">
                  {notificationError}
                </p>
              ) : notifications.length ? (
                <div className="max-h-[min(65vh,28rem)] overflow-y-auto">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void openNotification(notification)}
                      className={`block w-full border-b px-4 py-3 text-left transition hover:bg-muted ${
                        notification.isRead ? "" : "bg-primary/5"
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        {!notification.isRead ? (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {notification.title}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {notification.body}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {new Date(notification.createdAt).toLocaleString(
                              "es-PE",
                            )}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No hay notificaciones para mostrar.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mx-1 h-6 w-px bg-border" />

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.role}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}