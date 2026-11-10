"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useTheme } from "@/lib/theme-provider";
import {
  playNotificationChime,
  unlockNotificationAudio,
} from "@/lib/notification-sound";
import { AccessControl, Permission } from "@contract/domain/rbac";
import { Button } from "@contract/ui/components/button";
import { ThemeToggle } from "@contract/ui/components/theme-toggle";
import {
  Bell,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  LogOut,
  Menu,
  Wrench,
  X,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";

interface InboxNotification {
  id: string;
  type?: string;
  title: string;
  body: string;
  href: string;
  isRead: boolean;
  createdAt: string;
}

interface Work123Reminder {
  id: string;
  titulo: string;
  descripcion: string;
  fechaLimite: string;
  horaEjecucion: string;
  origenEvento: string | null;
}

type ReminderDismissal = number;

function reminderDismissalKey(userId: string, taskId: string): string {
  return `alquilaya:work123-dismissed:${userId}:${taskId}`;
}

function limaTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function limaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
  const [popups, setPopups] = useState<InboxNotification[]>([]);
  const [work123Reminders, setWork123Reminders] = useState<Work123Reminder[]>([]);
  const [work123Error, setWork123Error] = useState("");
  const [confirmingTaskId, setConfirmingTaskId] = useState<string | null>(null);
  const [savingReminderTaskId, setSavingReminderTaskId] = useState<string | null>(null);
  const [work123Dismissals, setWork123Dismissals] = useState<
    Record<string, ReminderDismissal>
  >({});
  const [work123ScheduleDrafts, setWork123ScheduleDrafts] = useState<
    Record<string, { horaEjecucion: string }>
  >({});
  const [work123Now, setWork123Now] = useState(() => Date.now());
  const knownNotificationIds = useRef<Set<string> | null>(null);
  const knownWork123Ids = useRef<Set<string> | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlockAudio = () => {
      void unlockNotificationAudio().catch((error: unknown) => {
        console.warn("No se pudo habilitar el audio de notificaciones:", error);
      });
    };
    // Listeners persistentes: cada gesto reintenta el desbloqueo si el
    // navegador sigue bloqueando la salida de audio.
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  // Cierra el popover de la campana al presionar cualquier parte de la
  // pantalla fuera de él, o con la tecla Escape.
  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        bellRef.current &&
        target instanceof Node &&
        !bellRef.current.contains(target)
      ) {
        setNotificationsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  const dismissPopup = useCallback((id: string) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
  }, []);

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

      const rawItems = Array.isArray(data.items) ? data.items : [];
      // Solo notificaciones de los últimos 15 días para la campanita
      const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
      const recentItems = rawItems.filter(
        (item) => new Date(item.createdAt).getTime() >= fifteenDaysAgo,
      );

      if (knownNotificationIds.current === null) {
        // Carga inicial: registrar IDs conocidos sin sonar ni abrir popups
        knownNotificationIds.current = new Set(recentItems.map((n) => n.id));
      } else {
        // En sondeos posteriores: detectar si entraron notificaciones nuevas sin leer
        const incoming = recentItems.filter(
          (item) => !item.isRead && !knownNotificationIds.current!.has(item.id),
        );
        if (incoming.length > 0) {
          playNotificationChime();
          setPopups((prev) => [...prev, ...incoming].slice(-4));
        }
        for (const item of recentItems) {
          knownNotificationIds.current.add(item.id);
        }
      }

      // La campana solo acumula pendientes: las leídas desaparecen.
      const unreadItems = recentItems.filter((item) => !item.isRead);
      setNotifications(unreadItems);
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
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [refreshNotifications]);

  const refreshWork123Reminders = useCallback(async () => {
    try {
      const response = await apiFetch("/api/tareas/recordatorios", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "No se pudieron cargar las tareas de hoy");
      }
      const data = (await response.json()) as { items?: Work123Reminder[] };
      const items = data.items ?? [];
      // Suena solo cuando entra un recordatorio nuevo (check in/out); la
      // carga inicial registra los IDs conocidos sin sonar.
      if (knownWork123Ids.current === null) {
        knownWork123Ids.current = new Set(items.map((item) => item.id));
      } else {
        const entrantes = items.filter(
          (item) => !knownWork123Ids.current!.has(item.id),
        );
        for (const item of items) {
          knownWork123Ids.current.add(item.id);
        }
        if (entrantes.length > 0) playNotificationChime();
      }
      setWork123Reminders(items);
      setWork123ScheduleDrafts((current) => {
        const next = { ...current };
        for (const task of items) {
          next[task.id] ??= {
            horaEjecucion: task.horaEjecucion,
          };
        }
        return next;
      });
      setWork123Dismissals((current) => {
        const next: Record<string, ReminderDismissal> = {};
        for (const task of items) {
          const dismissal = current[task.id];
          const dismissalKey = user?.id
            ? reminderDismissalKey(user.id, task.id)
            : null;
          const stored = dismissalKey
            ? window.sessionStorage.getItem(dismissalKey)
            : null;
          if (dismissal !== undefined) {
            next[task.id] = dismissal;
          } else if (stored === "closed" && dismissalKey) {
            window.sessionStorage.removeItem(dismissalKey);
          } else if (stored && Number.isFinite(Number(stored))) {
            next[task.id] = Number(stored);
          }
        }
        return next;
      });
      setWork123Error("");
    } catch (error) {
      setWork123Error(
        error instanceof Error ? error.message : "No se pudieron cargar las tareas de hoy",
      );
    }
  }, [user?.id]);

  useEffect(() => {
    if (
      !user ||
      !AccessControl.forRole(user.role, user.additionalPermissions).can(
        Permission.CONTRACT_READ,
      )
    ) {
      setWork123Reminders([]);
      setWork123Error("");
      return;
    }
    void refreshWork123Reminders();
    const interval = window.setInterval(() => void refreshWork123Reminders(), 60_000);
    return () => window.clearInterval(interval);
  }, [refreshWork123Reminders, user]);

  useEffect(() => {
    const interval = window.setInterval(() => setWork123Now(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  // Cierre automático secuencial de notificaciones flotantes (8 seg)
  useEffect(() => {
    if (!popups.length) return;
    const timer = setTimeout(() => {
      setPopups((prev) => prev.slice(1));
    }, 8_000);
    return () => clearTimeout(timer);
  }, [popups]);

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
        // La notificación vista se quita de la lista: no se acumula.
        setNotifications((current) =>
          current.filter((item) => item.id !== notification.id),
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
    dismissPopup(notification.id);
    if (notification.href.startsWith("/") && !notification.href.startsWith("//")) {
      router.push(notification.href);
    }
  }

  async function confirmarTarea(task: Work123Reminder) {
    setConfirmingTaskId(task.id);
    setWork123Error("");
    try {
      const response = await apiFetch("/api/tareas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, estado: "RESUELTA" }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "No se pudo confirmar la tarea");
      }
      setWork123Reminders((current) => current.filter((item) => item.id !== task.id));
      if (user?.id) {
        window.sessionStorage.removeItem(reminderDismissalKey(user.id, task.id));
      }
      setWork123Dismissals((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
    } catch (error) {
      setWork123Error(error instanceof Error ? error.message : "No se pudo confirmar la tarea");
    } finally {
      setConfirmingTaskId(null);
    }
  }

  async function guardarHorarioTarea(
    task: Work123Reminder,
    schedule: { horaEjecucion: string },
  ) {
    setSavingReminderTaskId(task.id);
    setWork123Error("");
    try {
      const response = await apiFetch("/api/tareas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          horaEjecucion: schedule.horaEjecucion,
          repetirCadaHora: true,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "No se pudo guardar el horario");
      }
      const updated = (await response.json()) as Work123Reminder;
      setWork123Reminders((current) =>
        current.map((item) => (item.id === task.id ? updated : item)),
      );
      setWork123ScheduleDrafts((current) => ({
        ...current,
        [task.id]: {
          horaEjecucion: updated.horaEjecucion,
        },
      }));
      if (user?.id) {
        window.sessionStorage.removeItem(reminderDismissalKey(user.id, task.id));
      }
      setWork123Dismissals((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
    } catch (error) {
      setWork123Error(
        error instanceof Error ? error.message : "No se pudo guardar el horario",
      );
    } finally {
      setSavingReminderTaskId(null);
    }
  }

  function cerrarRecordatorio(task: Work123Reminder) {
    if (!user?.id) return;
    const dismissal: ReminderDismissal = Date.now() + 60 * 60 * 1_000;
    const key = reminderDismissalKey(user.id, task.id);
    window.sessionStorage.setItem(key, String(dismissal));
    setWork123Dismissals((current) => ({ ...current, [task.id]: dismissal }));
  }

  const initials =
    user?.name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?";
  const puedeExportar = Boolean(
    user &&
      AccessControl.forRole(user.role, user.additionalPermissions).can(
        Permission.CONTRACT_READ,
      ) &&
      AccessControl.forRole(user.role, user.additionalPermissions).can(
        Permission.DEPARTMENT_READ,
      ),
  );
  const now = new Date(work123Now);
  const nowDateLima = limaDate(now);
  const nowTimeLima = limaTime(now);
  const tomorrowDate = new Date(`${nowDateLima}T12:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrowLima = tomorrowDate.toISOString().slice(0, 10);
  const visibleWork123Reminders = work123Reminders.filter((task) => {
    if (task.origenEvento !== "CHECKOFF") return true;
    const date = new Date(task.fechaLimite);
    if (Number.isNaN(date.getTime())) return false;
    const taskDateLima = limaDate(date);
    if (taskDateLima < nowDateLima || taskDateLima > tomorrowLima) {
      return false;
    }
    if (taskDateLima === nowDateLima && nowTimeLima < task.horaEjecucion) {
      return false;
    }
    const dismissal = work123Dismissals[task.id];
    return dismissal === undefined || (typeof dismissal === "number" && dismissal <= work123Now);
  });

  return (
    <>
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

          {puedeExportar ? (
            <Button asChild variant="outline" className="h-10 gap-2 px-3">
              <Link href="/exportaciones" aria-label="Exportar información">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">Exportar</span>
              </Link>
            </Button>
          ) : null}

          <div className="relative" ref={bellRef}>
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
                    {notifications.map((notification) => {
                      const isMaintenance =
                        notification.type?.startsWith("WORK_ORDER") ||
                        notification.title.toLowerCase().includes("mantenimiento") ||
                        notification.title.toLowerCase().includes("orden");
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => void openNotification(notification)}
                          className={`block w-full border-b px-4 py-3 text-left transition hover:bg-muted ${
                            notification.isRead ? "" : "bg-primary/5"
                          }`}
                        >
                          <span className="flex items-start gap-2.5">
                            {!notification.isRead ? (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                            ) : null}
                            <span
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                isMaintenance
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                  : "bg-surface-container-high text-muted-foreground"
                              }`}
                            >
                              {isMaintenance ? (
                                <Wrench className="h-3.5 w-3.5" />
                              ) : (
                                <Bell className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                {notification.title}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
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
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No tienes notificaciones sin leer.
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

      {visibleWork123Reminders.length > 0 || work123Error ? (
        <aside
          aria-label="Avisos de check-in y check-out"
          className="pointer-events-auto fixed right-4 top-20 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2.5"
        >
          {work123Error ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-background p-3 text-sm text-destructive shadow-lg">
              {work123Error}
            </p>
          ) : null}
          {visibleWork123Reminders.map((task) => (
            <div key={task.id} role="status" className="rounded-xl border border-violet-500/40 bg-background p-4 shadow-xl">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{task.titulo}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{task.descripcion}</p>
                </div>
                {task.origenEvento === "CHECKOFF" ? (
                  <button
                    type="button"
                    onClick={() => cerrarRecordatorio(task)}
                    aria-label="Cerrar recordatorio"
                    title="Cerrar recordatorio"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {task.origenEvento === "CHECKOFF" ? (
                <div className="mt-3 space-y-3">
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      Hora de ejecución
                    </span>
                    <input
                      type="time"
                      value={
                        work123ScheduleDrafts[task.id]?.horaEjecucion ??
                        task.horaEjecucion
                      }
                      onChange={(event) =>
                        setWork123ScheduleDrafts((current) => ({
                          ...current,
                          [task.id]: {
                            horaEjecucion: event.target.value,
                          },
                        }))
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Si cierras este aviso, volverá a aparecer en una hora hasta completar la tarea.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void guardarHorarioTarea(
                        task,
                        work123ScheduleDrafts[task.id] ?? {
                          horaEjecucion: task.horaEjecucion,
                        },
                      )
                    }
                    disabled={savingReminderTaskId === task.id}
                    className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {savingReminderTaskId === task.id ? "Guardando…" : "Guardar horario"}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void confirmarTarea(task)}
                disabled={
                  confirmingTaskId === task.id ||
                  (task.origenEvento === "CHECKOFF" &&
                    (limaDate(new Date(task.fechaLimite)) > nowDateLima ||
                      (limaDate(new Date(task.fechaLimite)) === nowDateLima &&
                        nowTimeLima < task.horaEjecucion)))
                }
                className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Tarea hecha
              </button>
            </div>
          ))}
        </aside>
      ) : null}

      {/* POP-ups de notificaciones en la esquina inferior derecha */}
      {popups.length > 0 ? (
        <aside
          aria-label="Avisos recientes"
          className="pointer-events-auto fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2.5"
        >
          {popups.map((popup) => {
            const isMaintenance =
              popup.type?.startsWith("WORK_ORDER") ||
              popup.title.toLowerCase().includes("mantenimiento") ||
              popup.title.toLowerCase().includes("orden");

            return (
              <div
                key={popup.id}
                role="status"
                className={`flex items-start gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-md transition-all duration-300 ${
                  isMaintenance
                    ? "border-amber-500/50 bg-amber-50/95 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/90 dark:text-amber-100"
                    : "border-primary/40 bg-card/95 text-card-foreground"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isMaintenance
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {isMaintenance ? (
                    <Wrench className="h-5 w-5" />
                  ) : (
                    <Bell className="h-5 w-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        isMaintenance
                          ? "bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200"
                          : "bg-primary/20 text-primary"
                      }`}
                    >
                      {isMaintenance ? "Mantenimiento" : "Aviso"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Nuevo
                    </span>
                  </div>

                  <p className="mt-1 text-sm font-semibold leading-tight line-clamp-1">
                    {popup.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {popup.body}
                  </p>

                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openNotification(popup)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold shadow-sm transition hover:opacity-90 ${
                        isMaintenance
                          ? "bg-amber-600 text-white dark:bg-amber-500 dark:text-amber-950"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {isMaintenance ? "Ver orden" : "Ver detalle"}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => dismissPopup(popup.id)}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-black/5 dark:hover:bg-white/10"
                  title="Cerrar notificación"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </aside>
      ) : null}
    </>
  );
}
