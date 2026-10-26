"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  LogOut,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Send,
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
    url: string;
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
    url: string;
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

const MAX_SIZE = 8 * 1024 * 1024;
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
  }).format(new Date(value));
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
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

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
  }, [loadOrders, router]);

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
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            <LogOut aria-hidden className="h-4 w-4" />
            Cerrar sesión
          </button>
        </header>

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
                    {clientRequest.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-cyan-400"
                      >
                        <Paperclip aria-hidden className="h-3 w-3" />
                        {attachment.fileName}
                      </a>
                    ))}
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
                      {order.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-cyan-400"
                        >
                          <Paperclip aria-hidden className="h-3 w-3" />
                          {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  )}
                  {order.availability.length > 0 && (
                    <div className="mt-4 rounded-lg bg-slate-950/70 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Opciones de visita</p>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {order.availability.map((option) => (
                          <li key={option.optionNumber}>
                            Opción {option.optionNumber}: {formatDate(option.startsAt)} – {formatDate(option.endsAt)}
                            {option.selectedAt && <span className="ml-2 text-emerald-300">Seleccionada</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Seguimiento</h4>
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
        <footer className="mt-10 border-t border-white/10 pt-5 text-center text-xs text-slate-500">
          Portal independiente de clientes · Acceso exclusivo a reportes del departamento
        </footer>
      </div>
    </main>
  );
}
