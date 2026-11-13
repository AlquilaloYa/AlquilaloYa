"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Camera,
  CreditCard,
  FileUp,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Paperclip,
  Receipt,
  RefreshCw,
  Send,
  Wrench,
  X,
} from "lucide-react";
import {
  buildClientPortalAvailabilityOptions,
  emptyAvailabilityOptions,
  localDateInputValue,
  type ClientAvailabilityInput,
} from "@/lib/client-portal-availability";
import { compressImageFile, MAX_SOURCE_IMAGE_BYTES } from "@/lib/image-compression";
import { AvailabilityPicker } from "./availability-picker";
import "./portal-client.css";

type PortalClient = { names: string; departmentCode: string };
type PaymentObligation = {
  id: string;
  targetType: "MONTHLY" | "SERVICE";
  title: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: "PAID" | "UPLOADED" | "DUE";
  canUpload: boolean;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | "USED" | null;
  approvalId: string | null;
  period?: string;
  voucherFilename?: string | null;
};
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
  const date = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(new Date(value));
  const time = new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Lima",
  }).format(new Date(value));
  return `${date} ${time}`;
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatMoney(value: string | number): string {
  return Number(value).toLocaleString("es-PE", {
    style: "currency",
    currency: "PEN",
  });
}

function formatVisitWindow(startsAt: string, endsAt: string): string {
  const date = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(new Date(startsAt));
  const time = new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
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
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeView, setActiveView] = useState<
    "dashboard" | "reports" | "payments"
  >("dashboard");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitStage, setSubmitStage] = useState<"uploading" | "saving" | "refreshing">("saving");
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
  const [optimizingUploads, setOptimizingUploads] = useState(false);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [notifications, setNotifications] = useState<ClientPortalNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [paymentItems, setPaymentItems] = useState<PaymentObligation[]>([]);
  const [paymentToday, setPaymentToday] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [paymentApprovalBusyId, setPaymentApprovalBusyId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [openPaymentFormId, setOpenPaymentFormId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    fileName: string;
    mimeType: string;
    url: string;
  } | null>(null);
  const submittingRef = useRef(false);
  const seenNotificationIds = useRef<Set<string> | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
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

  // Cierra el popover de notificaciones tocando cualquier parte de la
  // pantalla fuera de él (anclado a la campana) o con la tecla Escape.
  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        notificationsRef.current &&
        target instanceof Node &&
        !notificationsRef.current.contains(target)
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

  const loadPayments = useCallback(async () => {
    setPaymentLoading(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/portal-cliente/pagos", {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/portal-cliente/login");
        return;
      }
      const body = (await response.json()) as {
        obligations?: PaymentObligation[];
        today?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudieron consultar tus pagos.");
      }
      setPaymentItems(body.obligations ?? []);
      setPaymentToday(body.today ?? "");
    } catch (reason) {
      setPaymentError(
        reason instanceof Error
          ? reason.message
          : "No se pudieron consultar tus pagos.",
      );
    } finally {
      setPaymentLoading(false);
    }
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
        setLoadingProgress(10);
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
        setLoadingProgress(35);
        await loadOrders();
        setLoadingProgress(70);
        await loadNotifications();
        setLoadingProgress(92);
      } catch (reason) {
        if (alive) {
          setError(reason instanceof Error ? reason.message : "Error al cargar el portal");
        }
      } finally {
        if (alive) {
          setLoadingProgress(100);
          setLoading(false);
        }
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

  async function addFiles(files: FileList | null) {
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
      (file) =>
        !ALLOWED_TYPES.has(file.type) ||
        file.size < 1 ||
        (file.type.startsWith("image/")
          ? file.size > MAX_SOURCE_IMAGE_BYTES
          : file.size > MAX_SIZE),
    );
    if (invalid) {
      setError("Solo se permiten fotos JPG, PNG o WebP de hasta 30 MB antes de optimizar y videos MP4 o WebM de hasta 8 MB.");
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
      return;
    }
    setOptimizingUploads(true);
    try {
      const prepared: File[] = [];
      for (const file of next) {
        prepared.push(
          file.type.startsWith("image/")
            ? await compressImageFile(file, "photo")
            : file,
        );
      }
      const oversized = prepared.find((file) => file.size > MAX_SIZE);
      if (oversized) {
        throw new Error(
          `"${oversized.name}" supera 8 MB después de optimizar.`,
        );
      }
      setSelectedFiles((current) => [
        ...current,
        ...prepared.map((file) => ({ id: crypto.randomUUID(), file })),
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudieron optimizar las imágenes adjuntas.",
      );
    } finally {
      setOptimizingUploads(false);
    }
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function uploadFile(
    file: File,
    onProgress: (loadedBytes: number) => void,
  ): Promise<string> {
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
    const signedUrl = preparedBody.signedUrl;
    const uploadId = preparedBody.uploadId;
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", signedUrl);
      request.setRequestHeader("Content-Type", file.type);
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      });
      request.addEventListener("load", () => {
        if (request.status >= 200 && request.status < 300) {
          resolve();
        } else {
          reject(new Error(`No se pudo subir ${file.name}. Inténtalo de nuevo.`));
        }
      });
      request.addEventListener("error", () => {
        reject(new Error(`No se pudo subir ${file.name}. Inténtalo de nuevo.`));
      });
      request.addEventListener("abort", () => {
        reject(new Error(`Se canceló la carga de ${file.name}.`));
      });
      request.send(file);
    });
    onProgress(file.size);
    return uploadId;
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (optimizingUploads) {
      setError("Espera a que termine la optimización de las imágenes.");
      return;
    }
    submittingRef.current = true;
    setError("");
    setSubmitting(true);
    const fileIds: string[] = [];
    const totalBytes = selectedFiles.reduce((total, item) => total + item.file.size, 0);
    let completedBytes = 0;
    setUploadProgress(0);
    setSubmitStage(selectedFiles.length ? "uploading" : "saving");
    try {
      const options = buildClientPortalAvailabilityOptions(availability);
      for (const item of selectedFiles) {
        fileIds.push(
          await uploadFile(item.file, (loadedBytes) => {
            const progress = totalBytes
              ? Math.floor(((completedBytes + loadedBytes) / totalBytes) * 100)
              : 100;
            setUploadProgress(Math.min(progress, 100));
          }),
        );
        completedBytes += item.file.size;
      }
      setUploadProgress(100);
      setSubmitStage("saving");
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
      setSubmitStage("refreshing");
      await loadOrders();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el reporte");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function requestPaymentApproval(item: PaymentObligation) {
    setPaymentApprovalBusyId(item.id);
    setPaymentError("");
    setPaymentNotice("");
    try {
      const response = await fetch("/api/portal-cliente/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request-approval",
          targetType: item.targetType,
          targetId: item.id,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (response.status === 401) {
        router.replace("/portal-cliente/login");
        return;
      }
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo enviar la solicitud.");
      }
      setPaymentNotice(
        "Solicitud enviada a Pedidos de clientes. Podrás subir el voucher cuando el ERP la apruebe.",
      );
      await loadPayments();
    } catch (reason) {
      setPaymentError(
        reason instanceof Error
          ? reason.message
          : "No se pudo enviar la solicitud de autorización.",
      );
    } finally {
      setPaymentApprovalBusyId(null);
    }
  }

  async function submitPaymentVoucher(
    item: PaymentObligation,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!paymentFile || !paymentAmount) {
      setPaymentError("Selecciona el voucher e indica el monto a depositar.");
      return;
    }
    setPaymentBusyId(item.id);
    setPaymentError("");
    setPaymentNotice("");
    try {
      const form = new FormData();
      form.set("targetType", item.targetType);
      form.set("targetId", item.id);
      form.set("amount", paymentAmount);
      form.set("file", paymentFile);
      if (
        item.approvalStatus === "APPROVED" &&
        item.approvalId &&
        item.dueDate < paymentToday
      ) {
        form.set("approvalRequestId", item.approvalId);
      }
      const response = await fetch("/api/portal-cliente/pagos", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as { error?: string };
      if (response.status === 401) {
        router.replace("/portal-cliente/login");
        return;
      }
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo registrar el voucher.");
      }
      setPaymentNotice(
        "Voucher recibido. El ERP fue notificado y lo revisará para confirmar el pago.",
      );
      setOpenPaymentFormId(null);
      setPaymentAmount("");
      setPaymentFile(null);
      await loadPayments();
    } catch (reason) {
      setPaymentError(
        reason instanceof Error
          ? reason.message
          : "No se pudo registrar el voucher.",
      );
    } finally {
      setPaymentBusyId(null);
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
  const contactWhatsappUrl = `https://wa.me/${COMPANY_WHATSAPP}?text=${encodeURIComponent(
    `Hola AlquilaYa, necesito comunicarme con atención al cliente del departamento ${client?.departmentCode ?? ""}.`,
  )}`;
  const unreadNotificationCount = notifications.filter((item) => !item.isRead).length;

  return (
    <main
      className="client-portal-app min-h-[100svh] bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8"
      aria-busy={loading}
    >
      <div className="mx-auto max-w-6xl" inert={submitting}>
        {!loading && (
        <header className="portal-client-header mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="portal-dashboard-brand">
            <img src="/logo-white-mode.png" alt="AlquilaYa" />
            <div>
              <p className="text-sm font-semibold text-cyan-300">ALQUILAYA REPAIR</p>
              <h1 className="mt-1 text-2xl font-semibold">Hola, {client?.names ?? "…"}</h1>
              <p className="mt-1 text-sm text-slate-400">
                Departamento {client?.departmentCode ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
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
              {notificationsOpen && (
                <div
                  role="dialog"
                  aria-label="Notificaciones del portal"
                  className="portal-notifications-popover"
                >
                  <div className="portal-notifications-head">
                    <h2>Notificaciones</h2>
                    <button
                      type="button"
                      onClick={() =>
                        void loadNotifications().catch((reason) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : "No se pudieron actualizar las notificaciones",
                          ),
                        )
                      }
                    >
                      Actualizar
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="portal-notifications-empty">
                      No tienes notificaciones todavía.
                    </p>
                  ) : (
                    <ul className="portal-notifications-list">
                      {notifications.map((item) => (
                        <li
                          key={item.id}
                          className={`portal-notifications-item${item.isRead ? "" : " unread"}`}
                        >
                          <div>
                            <p className="portal-notifications-title">{item.title}</p>
                            {item.type === "VISIT_CONFIRMED" ? (
                              <p className="portal-notifications-visit">
                                {item.body}
                              </p>
                            ) : (
                              <p className="portal-notifications-body">{item.body}</p>
                            )}
                            <time className="portal-notifications-date">
                              {formatDate(item.createdAt)}
                            </time>
                          </div>
                          {!item.isRead && (
                            <button
                              type="button"
                              onClick={() => void markNotificationRead(item.id)}
                              className="portal-notifications-read"
                            >
                              Marcar como leída
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
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
        )}

        {loading ? (
          <div className="portal-loading-content" role="status" aria-live="polite">
            <div className="portal-loading-card">
              <div
                className="portal-loading-progress"
                role="progressbar"
                aria-label="Cargando tus reportes"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={loadingProgress}
              >
                <svg viewBox="0 0 72 72" aria-hidden="true">
                  <circle className="portal-loading-progress-track" cx="36" cy="36" r="31" />
                  <circle
                    className="portal-loading-progress-value"
                    cx="36"
                    cy="36"
                    r="31"
                    style={{ strokeDashoffset: `${194.78 * (1 - loadingProgress / 100)}` }}
                  />
                </svg>
                <img src="/app-icon.png" alt="" />
              </div>
              <p className="portal-loading-label">Cargando tus reportes</p>
              <span className="portal-loading-percent">{loadingProgress}%</span>
            </div>
          </div>
        ) : (
          <>
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

        {activeView === "dashboard" ? (
          <section className="portal-dashboard" aria-labelledby="portal-dashboard-title">
            <div className="portal-dashboard-intro">
              <h2 id="portal-dashboard-title">Dashboard</h2>
              <p>Selecciona una opción para continuar.</p>
            </div>
            <div className="portal-dashboard-cards">
              <button
                type="button"
                className="portal-dashboard-card portal-dashboard-card-reports"
                onClick={() => setActiveView("reports")}
              >
                <span className="portal-dashboard-card-icons">
                  <Wrench aria-hidden />
                </span>
                <span className="portal-dashboard-card-copy">
                  <strong>Reportes de averías</strong>
                  <span>Crea un reporte y revisa el avance de mantenimiento.</span>
                </span>
                <ArrowRight aria-hidden className="portal-dashboard-card-arrow" />
              </button>
              <button
                type="button"
                className="portal-dashboard-card portal-dashboard-card-payments"
                onClick={() => {
                  setActiveView("payments");
                  void loadPayments();
                }}
              >
                <span className="portal-dashboard-card-icons">
                  <CreditCard aria-hidden />
                  <Receipt aria-hidden />
                </span>
                <span className="portal-dashboard-card-copy">
                  <strong>Pagos</strong>
                  <span>Revisa tus cuotas, servicios y vouchers.</span>
                </span>
                <ArrowRight aria-hidden className="portal-dashboard-card-arrow" />
              </button>
              <a
                href={contactWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-dashboard-card portal-dashboard-card-contact"
              >
                <span className="portal-dashboard-card-icons">
                  <MessageCircle aria-hidden />
                </span>
                <span className="portal-dashboard-card-copy">
                  <strong>Contáctenos</strong>
                  <span>Escríbenos directamente por WhatsApp.</span>
                </span>
                <ArrowUpRight aria-hidden className="portal-dashboard-card-arrow" />
              </a>
            </div>
          </section>
        ) : activeView === "payments" ? (
          <>
            <button
              type="button"
              className="portal-report-back"
              onClick={() => setActiveView("dashboard")}
            >
              <ArrowLeft aria-hidden />
              Volver al Dashboard
            </button>
            <section className="space-y-5" aria-labelledby="portal-payments-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="portal-payments-title" className="text-2xl font-semibold">
                    Pagos
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Mensualidad, mantenimiento y servicios registrados por el ERP.
                  </p>
                  <p className="mt-2 text-xs text-emerald-200">
                    Los importes de mensualidad incluyen solo canon y mantenimiento; no incluyen penalidades.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadPayments()}
                  disabled={paymentLoading}
                  className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:text-white disabled:opacity-50"
                  aria-label="Actualizar pagos"
                >
                  <RefreshCw aria-hidden className="h-4 w-4" />
                  Actualizar
                </button>
              </div>
              {paymentError ? (
                <div role="alert" className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
                  {paymentError}
                </div>
              ) : null}
              {paymentNotice ? (
                <div role="status" className="rounded-lg border border-emerald-900 bg-emerald-950/50 p-3 text-sm text-emerald-200">
                  {paymentNotice}
                </div>
              ) : null}
              {paymentLoading ? (
                <div className="rounded-2xl border border-white/10 bg-slate-900 p-8 text-center text-sm text-slate-400">
                  Cargando tus pagos…
                </div>
              ) : paymentItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
                  El ERP aún no registra pagos o servicios para este contrato.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {paymentItems.map((item) => {
                    const overdue = item.dueDate < paymentToday;
                    const canRequestApproval =
                      overdue &&
                      Number(item.remainingAmount) > 0 &&
                      item.status !== "PAID" &&
                      item.approvalStatus !== "PENDING" &&
                      item.approvalStatus !== "APPROVED" &&
                      item.approvalStatus !== "USED";
                    const partialAllowed =
                      item.targetType === "MONTHLY" &&
                      item.dueDate > paymentToday;
                    const formOpen = openPaymentFormId === item.id;
                    return (
                      <article
                        key={`${item.targetType}-${item.id}`}
                        className="space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-cyan-300">
                              {item.targetType === "MONTHLY" ? "Mensualidad" : "Servicio"}
                              {item.period ? ` · ${item.period}` : ""}
                            </p>
                            <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                              item.status === "PAID"
                                ? "bg-emerald-950 text-emerald-200"
                                : item.status === "UPLOADED"
                                  ? "bg-amber-950 text-amber-200"
                                  : overdue
                                    ? "bg-red-950 text-red-200"
                                    : "bg-slate-800 text-slate-200"
                            }`}
                          >
                            {item.status === "PAID"
                              ? "Pagado"
                              : item.status === "UPLOADED"
                                ? "Voucher en revisión"
                                : overdue
                                  ? "Vencido"
                                  : "Pendiente"}
                          </span>
                        </div>
                        <div className="grid gap-3 rounded-xl bg-slate-950/70 p-4 sm:grid-cols-2">
                          <div>
                            <p className="flex items-center gap-2 text-xs text-slate-400">
                              <CalendarDays aria-hidden className="h-4 w-4" />
                              Fecha de pago
                            </p>
                            <p className="mt-1 font-medium">{formatDateOnly(item.dueDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">
                              {item.targetType === "MONTHLY" ? "Mensualidad + mantenimiento" : "Monto del servicio"}
                            </p>
                            <p className="mt-1 font-semibold">{formatMoney(item.totalAmount)}</p>
                          </div>
                          {item.targetType === "MONTHLY" ? (
                            <div>
                              <p className="text-xs text-slate-400">Saldo pendiente</p>
                              <p className="mt-1 font-semibold text-cyan-200">
                                {formatMoney(item.remainingAmount)}
                              </p>
                            </div>
                          ) : null}
                        </div>
                        {item.approvalStatus === "PENDING" ? (
                          <p className="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-100">
                            Solicitud enviada a Pedidos de clientes. Espera la validación del ERP antes de depositar.
                          </p>
                        ) : item.approvalStatus === "APPROVED" ? (
                          <p className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-100">
                            El ERP aprobó la solicitud. Ya puedes subir el voucher del saldo completo.
                          </p>
                        ) : item.approvalStatus === "REJECTED" ? (
                          <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
                            La solicitud fue rechazada. Puedes enviar una nueva solicitud al ERP.
                          </p>
                        ) : null}
                        {item.status === "UPLOADED" ? (
                          <p className="text-sm text-amber-100">
                            Tu voucher fue recibido y está pendiente de verificación.
                          </p>
                        ) : null}
                        {canRequestApproval ? (
                          <button
                            type="button"
                            onClick={() => void requestPaymentApproval(item)}
                            disabled={paymentApprovalBusyId === item.id}
                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-700 px-4 text-sm font-semibold text-amber-100 hover:bg-amber-950/50 disabled:opacity-50"
                          >
                            <CreditCard aria-hidden className="h-4 w-4" />
                            {paymentApprovalBusyId === item.id
                              ? "Enviando solicitud…"
                              : "Solicitar autorización al ERP"}
                          </button>
                        ) : null}
                        {item.canUpload && item.status !== "PAID" ? (
                          formOpen ? (
                            <form
                              onSubmit={(event) => void submitPaymentVoucher(item, event)}
                              className="space-y-3 border-t border-white/10 pt-4"
                            >
                              {partialAllowed ? (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPaymentAmount(item.remainingAmount)}
                                    className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400"
                                  >
                                    Pago total
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPaymentAmount("")}
                                    className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400"
                                  >
                                    Pago parcial
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">
                                  {overdue
                                    ? "Con autorización aprobada, debes depositar el saldo completo."
                                    : "En la fecha de vencimiento se requiere el pago completo."}
                                </p>
                              )}
                              <label className="block space-y-1.5 text-sm">
                                <span className="font-medium">Monto del depósito (S/)</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  max={item.remainingAmount}
                                  step="0.01"
                                  required
                                  value={paymentAmount}
                                  onChange={(event) => setPaymentAmount(event.target.value)}
                                  readOnly={!partialAllowed}
                                  className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400 read-only:text-slate-400"
                                />
                                <span className="block text-xs text-slate-400">
                                  Saldo disponible: {formatMoney(item.remainingAmount)}
                                </span>
                              </label>
                              <label className="block space-y-1.5 text-sm">
                                <span className="font-medium">Voucher (PDF, JPG, PNG o WebP)</span>
                                <input
                                  required
                                  type="file"
                                  accept="application/pdf,image/jpeg,image/png,image/webp"
                                  onChange={(event) =>
                                    setPaymentFile(event.target.files?.[0] ?? null)
                                  }
                                  className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-100 hover:file:bg-slate-700"
                                />
                              </label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenPaymentFormId(null);
                                    setPaymentFile(null);
                                  }}
                                  className="min-h-11 flex-1 rounded-lg border border-slate-700 px-4 text-sm font-medium text-slate-200 hover:border-slate-500"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="submit"
                                  disabled={paymentBusyId === item.id}
                                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50"
                                >
                                  <FileUp aria-hidden className="h-4 w-4" />
                                  {paymentBusyId === item.id ? "Subiendo…" : "Subir voucher"}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenPaymentFormId(item.id);
                                setPaymentAmount(item.remainingAmount);
                                setPaymentFile(null);
                                setPaymentError("");
                              }}
                              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                            >
                              <FileUp aria-hidden className="h-4 w-4" />
                              Depositar y subir voucher
                            </button>
                          )
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <button
              type="button"
              className="portal-report-back"
              onClick={() => setActiveView("dashboard")}
            >
              <ArrowLeft aria-hidden />
              Volver al Dashboard
            </button>
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
                disabled={optimizingUploads || submitting}
                onChange={(event) => void addFiles(event.target.files)}
                className="sr-only"
                id="portal-evidence"
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={optimizingUploads || submitting}
                onChange={(event) => void addFiles(event.target.files)}
                className="sr-only"
                id="portal-camera-capture"
              />
              <label
                htmlFor="portal-evidence"
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                <Paperclip aria-hidden className="h-4 w-4" />
                Agregar fotos optimizadas o videos (8 MB máx. tras optimizar)
              </label>
              <button
                type="button"
                disabled={optimizingUploads || submitting}
                onClick={() => cameraInput.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                <Camera aria-hidden className="h-4 w-4" />
                {optimizingUploads ? "Optimizando…" : "Tomar foto"}
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
              disabled={submitting || optimizingUploads}
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
          </>
        )}
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
          </>
        )}
      </div>
      {submitting && (
        <section
          className="portal-submit-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-submit-title"
          aria-describedby="portal-submit-description"
        >
          <div className="portal-submit-card">
            {submitStage === "uploading" ? (
              <div
                className="portal-progress-ring"
                role="progressbar"
                aria-label="Progreso de subida de archivos"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
              >
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <circle className="portal-progress-ring-track" cx="32" cy="32" r="27" />
                  <circle
                    className="portal-progress-ring-value"
                    cx="32"
                    cy="32"
                    r="27"
                    style={{ strokeDashoffset: `${Math.PI * 54 * (1 - uploadProgress / 100)}` }}
                  />
                </svg>
                <span>{uploadProgress}%</span>
              </div>
            ) : (
              <LoaderCircle aria-hidden className="portal-submit-spinner" />
            )}
            <h2 id="portal-submit-title">
              {submitStage === "uploading"
                ? "Subiendo archivos"
                : submitStage === "saving"
                  ? "Registrando tu reporte"
                  : "Actualizando tus reportes"}
            </h2>
            <p id="portal-submit-description">
              {submitStage === "uploading"
                ? "El porcentaje refleja la carga total de tus archivos."
                : submitStage === "saving"
                  ? "Estamos guardando la solicitud. No cierres esta página."
                  : "Tu reporte fue registrado; estamos actualizando la lista."}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
