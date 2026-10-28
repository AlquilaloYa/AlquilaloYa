"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Camera,
  LogOut,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import {
  buildClientPortalAvailabilityOptions,
  emptyAvailabilityOptions,
  localDateInputValue,
  type ClientAvailabilityInput,
} from "@/lib/client-portal-availability";
import { AvailabilityPicker } from "./availability-picker";
import "./portal-client.css";

type PortalClient = { names: string; departmentCode: string };
type Order = {
  id: string;
  code: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  customerPresentAtVisit: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  events: Array<{
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    actorName: string;
    createdAt: string;
  }>;
  availability: Array<{
    optionNumber: number;
    startsAt: string;
    endsAt: string;
    selectedAt: string | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: string | number;
    url: string | null;
  }>;
  chat: { openedAt: string; closedAt: string | null } | null;
};

type ClientRequest = {
  id: string;
  issueType: string;
  description: string;
  status: string;
  workOrderId: string | null;
  createdAt: string;
  availabilityOptions: Array<{ startsAt: string; endsAt: string }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    url: string | null;
  }>;
};

type Upload = { id: string; file: File };
type ChatMessage = {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
};
type ClientPortalNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

const MAX_SIZE = 8 * 1024 * 1024;
const COMPANY_WHATSAPP = "51937205274";
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);
const STATUS_LABELS: Record<string, string> = {
  CREATED: "Recibido",
  ASSIGNED: "Personal asignado",
  REASSIGNED: "Reasignado",
  ACCEPTED: "Aceptado por mantenimiento",
  VISIT_SCHEDULED: "Visita programada",
  ON_SITE: "Personal en el departamento",
  DIAGNOSIS: "Evaluando el problema",
  ESTIMATED: "Preparando solución",
  IN_PROGRESS: "Trabajo en curso",
  RESOLVED: "Trabajo realizado",
  PENDING_CLOSURE: "Verificando cierre",
  COMPLETED: "Completado",
  REJECTED: "Requiere nueva asignación",
  BLOCKED: "En revisión",
  CANCELLED: "Cancelado",
  RESCHEDULED: "Visita reprogramada",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function formatVisitWindow(startsAt: string, endsAt: string): string {
  const date = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "full",
    timeZone: "America/Lima",
  }).format(new Date(startsAt));
  const time = new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });
  return `${date}, ${time.format(new Date(startsAt))}–${time.format(new Date(endsAt))}`;
}

function timelineLabel(event: Order["events"][number]): string {
  if (event.eventType === "CLIENT_REPORT_SUBMITTED") return "Reporte recibido";
  if (event.eventType === "ORDER_CREATED") return "Orden registrada";
  const status = event.toStatus ? STATUS_LABELS[event.toStatus] : undefined;
  return status ?? event.eventType.replace(/_/g, " ").toLowerCase();
}

export default function ClientPortalPage() {
  const router = useRouter();
  const [client, setClient] = useState<PortalClient | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [customerPresentAtVisit, setCustomerPresentAtVisit] = useState(true);
  const [currentLocalDate, setCurrentLocalDate] = useState("");
  const [availability, setAvailability] = useState<ClientAvailabilityInput[]>(() =>
    emptyAvailabilityOptions(),
  );
  const [selectedFiles, setSelectedFiles] = useState<Upload[]>([]);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [notifications, setNotifications] = useState<ClientPortalNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{
    fileName: string;
    mimeType: string;
    url: string;
  } | null>(null);
  const seenNotificationIds = useRef<Set<string> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!previewAttachment) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewAttachment(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewAttachment]);

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/portal-cliente/ordenes", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/portal-cliente/login");
      return;
    }
    const body = (await response.json()) as {
      orders?: Order[];
      requests?: ClientRequest[];
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? "No se pudieron consultar los reportes");
    setOrders(body.orders ?? []);
    setRequests(body.requests ?? []);
  }, [router]);

  const loadNotifications = useCallback(
    async (announceNew = false) => {
      const response = await fetch("/api/portal-cliente/notificaciones", {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/portal-cliente/login");
        return;
      }
      const body = (await response.json()) as {
        notifications?: ClientPortalNotification[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudieron consultar las notificaciones");
      }
      const nextNotifications = body.notifications ?? [];
      const seenIds = seenNotificationIds.current;
      const newUnread = announceNew && seenIds
        ? nextNotifications.filter((item) => !item.isRead && !seenIds.has(item.id))
        : [];
      seenNotificationIds.current = new Set(nextNotifications.map((item) => item.id));
      setNotifications(nextNotifications);
      const latestNotification = newUnread.at(0);
      if (latestNotification) {
        setNotice(`${latestNotification.title}: ${latestNotification.body}`);
        void loadOrders().catch((reason) =>
          setError(reason instanceof Error ? reason.message : "No se pudieron actualizar los reportes"),
        );
      }
    },
    [loadOrders, router],
  );

  useEffect(() => {
    let alive = true;
    async function initialize() {
      try {
        const today = localDateInputValue(new Date());
        setCurrentLocalDate(today);
        setAvailability(emptyAvailabilityOptions(today));
        const response = await fetch("/api/portal-cliente/session", { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/portal-cliente/login");
          return;
        }
        const body = (await response.json()) as { client?: PortalClient; error?: string };
        if (!response.ok || !body.client) {
          throw new Error(body.error ?? "No se pudo validar la sesión");
        }
        if (!alive) return;
        setClient(body.client);
        await loadOrders();
        await loadNotifications();
      } catch (reason) {
        if (alive) {
          setError(reason instanceof Error ? reason.message : "Error al cargar el portal");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void initialize();
    return () => {
      alive = false;
    };
  }, [loadNotifications, loadOrders, router]);

  useEffect(() => {
    if (!client) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications(true).catch((reason) =>
          setError(reason instanceof Error ? reason.message : "No se pudieron actualizar las notificaciones"),
        );
      }
    };
    const intervalId = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, loadNotifications]);

  async function markNotificationRead(id: string) {
    try {
      const response = await fetch("/api/portal-cliente/notificaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo actualizar la notificación");
      }
      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la notificación");
    }
  }

  function updateAvailability(
    index: number,
    field: keyof ClientAvailabilityInput,
    value: string,
  ) {
    setAvailability((items) =>
      items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    setNotice("");
    const next = Array.from(files);
    if (selectedFiles.length + next.length > 5) {
      setError("Puedes adjuntar hasta 5 archivos.");
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
      return;
    }
    const invalid = next.find(
      (file) => !ALLOWED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_SIZE,
    );
    if (invalid) {
      setError("Solo se permiten fotos JPG, PNG o WebP y videos MP4 o WebM de hasta 8 MB cada uno.");
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
      return;
    }
    setSelectedFiles((current) => [
      ...current,
      ...next.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function uploadFile(file: File): Promise<string> {
    const prepared = await fetch("/api/portal-cliente/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
    const preparedBody = (await prepared.json()) as {
      uploadId?: string;
      signedUrl?: string;
      error?: string;
    };
    if (!prepared.ok || !preparedBody.signedUrl || !preparedBody.uploadId) {
      throw new Error(preparedBody.error ?? `No se pudo preparar ${file.name}`);
    }
    const uploaded = await fetch(preparedBody.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploaded.ok) {
      throw new Error(`No se pudo subir ${file.name}. Inténtalo de nuevo.`);
    }
    return preparedBody.uploadId;
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const fileIds: string[] = [];
    try {
      const options = buildClientPortalAvailabilityOptions(availability);
      for (const item of selectedFiles) fileIds.push(await uploadFile(item.file));
      const response = await fetch("/api/portal-cliente/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueType,
          description,
          customerPresentAtVisit,
          availability: options,
          attachmentIds: fileIds,
        }),
      });
      const body = (await response.json()) as { error?: string; request?: ClientRequest };
      if (!response.ok) throw new Error(body.error ?? "No se pudo enviar el reporte");
      setNotice("Solicitud enviada. El equipo de mantenimiento la revisará antes de crear una orden de trabajo.");
      setIssueType("");
      setDescription("");
      const today = localDateInputValue(new Date());
      setCurrentLocalDate(today);
      setAvailability(emptyAvailabilityOptions(today));
      setSelectedFiles([]);
      setCustomerPresentAtVisit(true);
      await loadOrders();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el reporte");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/portal-cliente/auth/logout", { method: "POST" });
    router.replace("/portal-cliente/login");
  }

  async function toggleChat(orderId: string) {
    setChatError("");
    if (openChatId === orderId) {
      setOpenChatId(null);
      setChatMessages([]);
      return;
    }
    setChatBusy(true);
    try {
      const response = await fetch(
        `/api/portal-cliente/ordenes/${orderId}/chat`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        messages?: ChatMessage[];
        error?: string;
      };
      if (response.status === 401) {
        router.replace("/portal-cliente/login");
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "No se pudo abrir el chat");
      setChatMessages(body.messages ?? []);
      setOpenChatId(orderId);
    } catch (reason) {
      setChatError(reason instanceof Error ? reason.message : "No se pudo abrir el chat");
    } finally {
      setChatBusy(false);
    }
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openChatId || !chatDraft.trim()) return;
    setChatBusy(true);
    setChatError("");
    try {
      const response = await fetch(
        `/api/portal-cliente/ordenes/${openChatId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: chatDraft }),
        },
      );
      const body = (await response.json()) as {
        message?: ChatMessage;
        error?: string;
      };
      if (response.status === 401) {
        router.replace("/portal-cliente/login");
        return;
      }
      if (!response.ok || !body.message) {
        throw new Error(body.error ?? "No se pudo enviar el mensaje");
      }
      setChatMessages((current) => [...current, body.message!]);
      setChatDraft("");
    } catch (reason) {
      setChatError(reason instanceof Error ? reason.message : "No se pudo enviar el mensaje");
    } finally {
      setChatBusy(false);
    }
  }

  const currentCalendarMonth = currentLocalDate
    ? new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(
        new Date(`${currentLocalDate}T12:00:00`),
      )
    : "";
  const urgentWhatsappUrl = `https://wa.me/${COMPANY_WHATSAPP}?text=${encodeURIComponent(
    `Hola AlquilaYa, estoy aquí ahora y necesito atención urgente en el departamento ${client?.departmentCode ?? ""}.`,
  )}`;
  const unreadNotificationCount = notifications.filter((item) => !item.isRead).length;

  if (loading) {
    return (
      <main className="client-portal-app flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Cargando tus reportes…
      </main>
    );
  }

  return (
    <main className="client-portal-app min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="portal-dashboard-brand">
            <img src="/logo-white-mode.png" alt="AlquilaYa" />
            <div>
              <p className="text-sm font-semibold text-cyan-300">ALQUILAYA REPAIR</p>
              <h1 className="mt-1 text-2xl font-semibold">Hola, {client?.names}</h1>
              <p className="mt-1 text-sm text-slate-400">Departamento {client?.departmentCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              aria-expanded={notificationsOpen}
              aria-label={`Notificaciones${unreadNotificationCount ? `, ${unreadNotificationCount} sin leer` : ""}`}
              title="Notificaciones"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-cyan-400 hover:text-white"
            >
              <Bell aria-hidden className="h-4 w-4" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-cyan-300 px-1 text-center text-xs font-semibold leading-5 text-slate-950">
                  {unreadNotificationCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              <LogOut aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </header>

        {notificationsOpen && (
          <section
            aria-label="Notificaciones del portal"
            className="mb-6 rounded-2xl border border-cyan-900/70 bg-slate-900 p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Notificaciones</h2>
              <button
                type="button"
                onClick={() =>
                  void loadNotifications().catch((reason) =>
                    setError(reason instanceof Error ? reason.message : "No se pudieron actualizar las notificaciones"),
                  )
                }
                className="text-sm text-cyan-300 hover:text-cyan-200"
              >
                Actualizar
              </button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-400">No tienes notificaciones todavía.</p>
            ) : (
              <ul className="space-y-3">
                {notifications.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-lg border p-3 ${item.isRead ? "border-slate-800" : "border-cyan-800 bg-cyan-950/30"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        {item.type === "VISIT_CONFIRMED" ? (
                          <p className="mt-2 inline-block rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">
                            {item.body}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-slate-300">{item.body}</p>
                        )}
                        <time className="mt-2 block text-xs text-slate-500">
                          {formatDate(item.createdAt)}
                        </time>
                      </div>
                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={() => void markNotificationRead(item.id)}
                          className="shrink-0 text-sm text-cyan-300 hover:text-cyan-200"
                        >
                          Marcar como leída
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mb-6 rounded-lg border border-emerald-900 bg-emerald-950/50 p-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <form onSubmit={submitReport} className="h-fit space-y-5 rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-7">
            <div>
              <h2 className="text-xl font-semibold">Crear un reporte</h2>
              <p className="mt-1 text-sm text-slate-400">Cuéntanos qué sucede y cuándo puedes recibir mantenimiento.</p>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Tipo de problema</span>
              <select
                required
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400"
              >
                <option value="">Selecciona un tipo</option>
                <option value="Plomeria">Plomería</option>
                <option value="Electricidad">Electricidad</option>
                <option value="Cerrajeria">Cerrajería</option>
                <option value="Limpieza">Limpieza</option>
                <option value="Mantenimiento">Mantenimiento</option>
                <option value="Otro">Otro</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Describe el problema</span>
              <textarea
                required
                maxLength={10000}
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-400"
                placeholder="Indica qué ocurre, desde cuándo y cualquier detalle útil."
              />
            </label>

            <div className="portal-upload-field">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                multiple
                onChange={(event) => addFiles(event.target.files)}
                className="sr-only"
                id="portal-evidence"
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => addFiles(event.target.files)}
                className="sr-only"
                id="portal-camera-capture"
              />
              <label
                htmlFor="portal-evidence"
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                <Paperclip aria-hidden className="h-4 w-4" />
                Agregar fotos o videos (máx. 8 MB cada uno)
              </label>
              <button
                type="button"
                onClick={() => cameraInput.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                <Camera aria-hidden className="h-4 w-4" />
                Tomar foto
              </button>
              {selectedFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {selectedFiles.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.file.name} · {(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles((current) => current.filter((file) => file.id !== item.id))}
                        className="shrink-0 text-red-300 hover:text-red-200"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Elige tres opciones de visita</legend>
              <div className="space-y-3 rounded-lg border border-amber-700/70 bg-amber-950/30 p-4">
                <div>
                  <p className="font-semibold text-amber-100">Estoy aquí ahora, trabajo urgente</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Contacta rápidamente a mantenimiento por WhatsApp para coordinar la atención.
                  </p>
                </div>
                <a
                  href={urgentWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                >
                  <MessageCircle aria-hidden className="h-4 w-4" />
                  Contactar por WhatsApp ahora
                </a>
              </div>
              <p className="portal-calendar-note">
                El calendario abre en {currentCalendarMonth}. La hora elegida inicia una ventana de atención de dos horas.
              </p>
              {availability.map((option, index) => (
                <AvailabilityPicker
                  key={index}
                  index={index}
                  option={option}
                  today={currentLocalDate}
                  onChange={(field, value) => updateAvailability(index, field, value)}
                />
              ))}
            </fieldset>

            <label className="flex items-start gap-3 rounded-lg border border-slate-800 p-3 text-sm">
              <input
                type="checkbox"
                checked={customerPresentAtVisit}
                onChange={(event) => setCustomerPresentAtVisit(event.target.checked)}
                className="mt-1 accent-cyan-400"
              />
              <span>
                <span className="block font-medium">Estaré en el departamento</span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">
                  Si no estás, se habilitará un chat para avisarte cuando llegue mantenimiento.
                </span>
              </span>
            </label>

            <button
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
            >
              <Send aria-hidden className="h-4 w-4" />
              {submitting ? "Enviando reporte…" : "Enviar reporte"}
            </button>
          </form>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Tus reportes</h2>
                <p className="mt-1 text-sm text-slate-400">Consulta el estado y los avances de cada solicitud.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadOrders().catch((reason) => setError(reason.message))}
                className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:text-white"
                aria-label="Actualizar reportes"
              >
                <RefreshCw aria-hidden className="h-4 w-4" />
                Actualizar
              </button>
            </div>
            {requests.length === 0 && orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
                Aún no tienes reportes. Completa el formulario para enviar uno.
              </div>
            ) : null}
            {requests.map((clientRequest) => (
              <article key={clientRequest.id} className="rounded-2xl border border-cyan-900/70 bg-slate-900 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-cyan-300">Solicitud · {formatDate(clientRequest.createdAt)}</p>
                    <h3 className="mt-1 font-semibold">{clientRequest.issueType}</h3>
                  </div>
                  <span className="rounded-full border border-amber-800 bg-amber-950/60 px-3 py-1 text-xs font-medium text-amber-100">
                    {clientRequest.status === "PENDING"
                      ? "Pendiente de revisión"
                      : clientRequest.status === "CONVERTED"
                        ? "Convertida en orden"
                        : "Cerrada"}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {clientRequest.description}
                </p>
                {clientRequest.workOrderId && (
                  <p className="mt-3 text-sm text-emerald-200">
                    La solicitud ya fue derivada al equipo de mantenimiento.
                  </p>
                )}
                {clientRequest.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {clientRequest.attachments.map((attachment) => {
                      const url = attachment.url;
                      if (url) {
                        const isImage = attachment.mimeType.startsWith("image/");
                        return (
                          <button
                            key={attachment.id}
                            type="button"
                            onClick={() =>
                              setPreviewAttachment({
                                fileName: attachment.fileName,
                                mimeType: attachment.mimeType,
                                url,
                              })
                            }
                            aria-label={`Ver vista previa: ${attachment.fileName}`}
                            className="group relative h-24 w-24 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-left text-xs text-slate-300 hover:border-cyan-400"
                          >
                            {isImage ? (
                              <img
                                src={url}
                                alt={attachment.fileName}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                            ) : (
                              <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                                <Paperclip aria-hidden className="h-4 w-4" />
                                <span className="w-full truncate">{attachment.fileName}</span>
                                <span>Vista previa</span>
                              </span>
                            )}
                          </button>
                        );
                      }
                      return (
                        <span
                          key={attachment.id}
                          title="El archivo no está disponible en Storage"
                          className="inline-flex items-center gap-2 rounded-md border border-amber-800 px-2 py-1 text-xs text-amber-100"
                        >
                          <Paperclip aria-hidden className="h-3 w-3" />
                          {attachment.fileName} · no disponible
                        </span>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
            {orders.length > 0 ? (
              orders.map((order) => (
                <article key={order.id} className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-cyan-300">{order.code}</p>
                      <h3 className="mt-1 font-semibold">{order.title}</h3>
                    </div>
                    <span className="rounded-full border border-cyan-900 bg-cyan-950/60 px-3 py-1 text-xs font-medium text-cyan-100">
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{order.description}</p>
                  {order.attachments.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {order.attachments.map((attachment) => {
                        const url = attachment.url;
                        if (url) {
                          const isImage = attachment.mimeType.startsWith("image/");
                          return (
                            <button
                              key={attachment.id}
                              type="button"
                              onClick={() =>
                                setPreviewAttachment({
                                  fileName: attachment.fileName,
                                  mimeType: attachment.mimeType,
                                  url,
                                })
                              }
                              aria-label={`Ver vista previa: ${attachment.fileName}`}
                              className="group relative h-24 w-24 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-left text-xs text-slate-300 hover:border-cyan-400"
                            >
                              {isImage ? (
                                <img
                                  src={url}
                                  alt={attachment.fileName}
                                  className="h-full w-full object-cover transition group-hover:scale-105"
                                />
                              ) : (
                                <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                                  <Paperclip aria-hidden className="h-4 w-4" />
                                  <span className="w-full truncate">{attachment.fileName}</span>
                                  <span>Vista previa</span>
                                </span>
                              )}
                            </button>
                          );
                        }
                        return (
                          <span
                            key={attachment.id}
                            title="El archivo no está disponible en Storage"
                            className="inline-flex items-center gap-2 rounded-md border border-amber-800 px-2 py-1 text-xs text-amber-100"
                          >
                            <Paperclip aria-hidden className="h-3 w-3" />
                            {attachment.fileName} · no disponible
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {order.availability.length > 0 && (
                    <div className="mt-4 rounded-lg bg-slate-950/70 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Opciones de visita</p>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {order.availability.map((option) => (
                          <li key={option.optionNumber}>
                            {option.selectedAt ? (
                              <span className="inline-block rounded-md bg-emerald-700 px-3 py-2 font-semibold text-white">
                                Visita confirmada: {formatVisitWindow(option.startsAt, option.endsAt)}
                              </span>
                            ) : (
                              <>
                                Opción {option.optionNumber}: {formatDate(option.startsAt)} – {formatDate(option.endsAt)}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Seguimiento</h4>
                    <div
                      className="portal-follow-up-scroll"
                      role="region"
                      aria-label={`Historial de seguimiento de ${order.code}`}
                      tabIndex={0}
                    >
                      <ol className="space-y-3">
                        {order.events.map((event, index) => (
                          <li key={`${event.eventType}-${event.createdAt}-${index}`} className="flex gap-3">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
                            <div className="min-w-0">
                              <p className="text-sm text-slate-200">{timelineLabel(event)}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  {order.chat?.openedAt && (
                    <div className="mt-4 rounded-lg border border-slate-700 p-3 text-xs text-slate-400">
                      {order.chat.closedAt ? "La conversación con mantenimiento ha finalizado." : "La conversación con mantenimiento está habilitada."}
                    </div>
                  )}
                  {!order.customerPresentAtVisit && (
                    <div className="mt-4">
                      {order.chat?.openedAt ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void toggleChat(order.id)}
                            disabled={chatBusy}
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-800 px-3 text-sm font-medium text-cyan-200 hover:bg-cyan-950/50 disabled:opacity-50"
                          >
                            <MessageCircle aria-hidden className="h-4 w-4" />
                            {openChatId === order.id ? "Cerrar chat" : "Conversar con mantenimiento"}
                          </button>
                          {openChatId === order.id && (
                            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                              <div className="max-h-56 space-y-2 overflow-y-auto">
                                {chatMessages.length ? chatMessages.map((message) => (
                                  <div key={message.id} className="rounded-md bg-slate-900 p-2">
                                    <p className="text-xs font-semibold text-cyan-200">
                                      {message.senderName} · {formatDate(message.createdAt)}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                                      {message.content}
                                    </p>
                                  </div>
                                )) : (
                                  <p className="text-sm text-slate-400">Aún no hay mensajes.</p>
                                )}
                              </div>
                              {!order.chat.closedAt && (
                                <form onSubmit={sendChatMessage} className="mt-3 flex gap-2">
                                  <input
                                    type="text"
                                    value={chatDraft}
                                    maxLength={2000}
                                    onChange={(event) => setChatDraft(event.target.value)}
                                    placeholder="Escribe un mensaje…"
                                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
                                  />
                                  <button
                                    type="submit"
                                    disabled={chatBusy || !chatDraft.trim()}
                                    className="rounded-md bg-cyan-300 px-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
                                  >
                                    Enviar
                                  </button>
                                </form>
                              )}
                              {chatError && <p role="alert" className="mt-2 text-sm text-red-300">{chatError}</p>}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">
                          El chat se habilitará cuando mantenimiento llegue al departamento.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              ))
            ) : null}
          </section>
        </section>
        {previewAttachment ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
            onClick={() => setPreviewAttachment(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`Vista previa: ${previewAttachment.fileName}`}
              className="relative flex max-h-full w-full max-w-5xl flex-col items-center gap-3"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                aria-label="Cerrar vista previa"
                className="absolute -top-12 right-0 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
              >
                <X aria-hidden className="h-6 w-6" />
              </button>
              {previewAttachment.mimeType.startsWith("image/") ? (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.fileName}
                  className="max-h-[80vh] max-w-full rounded-lg object-contain"
                />
              ) : (
                <video
                  src={previewAttachment.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[80vh] max-w-full rounded-lg"
                />
              )}
              <p className="max-w-full truncate text-sm text-white">
                {previewAttachment.fileName}
              </p>
            </section>
          </div>
        ) : null}
        <footer className="mt-10 border-t border-white/10 pt-5 text-center text-xs text-slate-500">
          Portal independiente de clientes · Acceso exclusivo a reportes del departamento
        </footer>
      </div>
    </main>
  );
}
