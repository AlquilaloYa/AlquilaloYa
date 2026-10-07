"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  ArrowDownUp,
  ArrowLeft,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { AccessControl, Permission } from "@contract/domain/rbac";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type WorkStatus =
  | "CREATED"
  | "ASSIGNED"
  | "REASSIGNED"
  | "ACCEPTED"
  | "VISIT_SCHEDULED"
  | "ON_SITE"
  | "DIAGNOSIS"
  | "ESTIMATED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "PENDING_CLOSURE"
  | "COMPLETED"
  | "REJECTED"
  | "BLOCKED"
  | "CANCELLED"
  | "RESCHEDULED";

type Priority = "BAJA" | "MEDIA" | "ALTA" | "URGENTE";

interface WorkOrder {
  id: string;
  code: string;
  title: string;
  description: string;
  issueType: string;
  priority: Priority;
  status: WorkStatus;
  location: string;
  site: "Angamos" | "Benavides";
  departmentId: string | null;
  departmentCode: string;
  departmentName: string | null;
  departmentNumber: string | null;
  clientId: string | null;
  contactName: string;
  assignedEmployeeId: string | null;
  assigneeName: string | null;
  assigneeRole: string | null;
  targetAt: string | null;
  diagnosis: string;
  resolution: string;
  estimatedCost: string | null;
  actualCost: string | null;
  estimatedMinutes: string | null;
  actualMinutes: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Employee {
  id: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  area: string;
}

function normalizeDepartmentCode(code: string | null | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

interface Client {
  id: string;
  name: string;
  codigoDepartamento: string | null;
}

interface Department {
  id: string;
  code: string;
  name: string;
  number: string;
  site: "Angamos" | "Benavides";
  label: string;
  active: boolean;
}

interface Evidence {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
}

interface WorkEvent {
  id: string;
  eventType: string;
  actorName: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
  details: Record<string, unknown>;
}

interface Visit {
  id: string;
  visitNumber: string;
  scheduledAt: string;
  arrivedAt: string | null;
  completedAt: string | null;
}

interface OrderDetails extends WorkOrder {
  events: WorkEvent[];
  visits: Visit[];
  attachments: Evidence[];
  assignments: Array<{
    id: string;
    employeeId: string;
    assignedAt: string;
    endedAt: string | null;
    name: string;
    note: string;
  }>;
}

const STATUS_LABEL: Record<WorkStatus, string> = {
  CREATED: "Creada",
  ASSIGNED: "Asignada",
  REASSIGNED: "Reasignada",
  ACCEPTED: "Aceptada",
  VISIT_SCHEDULED: "Visita programada",
  ON_SITE: "En sitio",
  DIAGNOSIS: "Diagnóstico",
  ESTIMATED: "Presupuestada",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelta",
  PENDING_CLOSURE: "Por cerrar",
  COMPLETED: "Finalizada",
  REJECTED: "Rechazada",
  BLOCKED: "Bloqueada",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reprogramada",
};

const STATUS_STYLE: Record<WorkStatus, string> = {
  CREATED: "bg-slate-100 text-slate-700 ring-slate-200",
  ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200",
  REASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200",
  ACCEPTED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  VISIT_SCHEDULED: "bg-amber-50 text-amber-800 ring-amber-200",
  ON_SITE: "bg-orange-50 text-orange-800 ring-orange-200",
  DIAGNOSIS: "bg-violet-50 text-violet-800 ring-violet-200",
  ESTIMATED: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  IN_PROGRESS: "bg-amber-50 text-amber-800 ring-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PENDING_CLOSURE: "bg-teal-50 text-teal-800 ring-teal-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
  BLOCKED: "bg-rose-50 text-rose-800 ring-rose-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
  RESCHEDULED: "bg-amber-50 text-amber-800 ring-amber-200",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  BAJA: "bg-slate-100 text-slate-700",
  MEDIA: "bg-blue-50 text-blue-700",
  ALTA: "bg-amber-50 text-amber-800",
  URGENTE: "bg-red-50 text-red-700",
};
const PRIORITY_DOT: Record<Priority, string> = {
  BAJA: "bg-slate-500",
  MEDIA: "bg-blue-600",
  ALTA: "bg-amber-500",
  URGENTE: "bg-red-600",
};

const STATUS_FILTERS: Array<{
  value: "TODAS" | "ABIERTAS" | WorkStatus;
  label: string;
}> = [
  { value: "TODAS", label: "Todas" },
  { value: "ABIERTAS", label: "Abiertas" },
  { value: "ON_SITE", label: "En sitio" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "COMPLETED", label: "Finalizadas" },
];

function formatDate(
  value: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat(
    "es-PE",
    options ?? {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function isOverdue(order: WorkOrder): boolean {
  return Boolean(
    order.targetAt &&
    new Date(order.targetAt).getTime() < Date.now() &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED",
  );
}

function humanizeEvent(event: WorkEvent): string {
  if (event.eventType === "ORDER_CREATED") return "Creó la orden de trabajo";
  if (event.eventType === "ASSIGNMENT_CHANGED")
    return "Actualizó la asignación";
  if (event.fromStatus && event.toStatus) {
    return `Cambió el estado: ${STATUS_LABEL[event.fromStatus as WorkStatus] ?? event.fromStatus} → ${STATUS_LABEL[event.toStatus as WorkStatus] ?? event.toStatus}`;
  }
  return "Actualizó la orden";
}

export default function OperacionesPage() {
  const { user } = useAuth();
  const access = user ? AccessControl.forRole(user.role) : null;
  const canCreate = access?.can(Permission.WORK_ORDER_CREATE) ?? false;
  const canUpdate = access?.can(Permission.WORK_ORDER_UPDATE) ?? false;
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedSite, setSelectedSite] = useState<"Angamos" | "Benavides">(
    "Angamos",
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [creationPhotos, setCreationPhotos] = useState<File[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]["value"]>("TODAS");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [ordersResponse, employeesResponse, catalogsResponse] =
        await Promise.all([
          apiFetch("/api/operaciones/ordenes", { cache: "no-store" }),
          apiFetch("/api/operaciones/empleados", { cache: "no-store" }),
          apiFetch("/api/operaciones/catalogos", { cache: "no-store" }),
        ]);
      const ordersPayload = await ordersResponse.json();
      const employeesPayload = await employeesResponse.json();
      const catalogsPayload = await catalogsResponse.json();
      if (!ordersResponse.ok)
        throw new Error(
          ordersPayload.error ?? "No se pudieron cargar las órdenes",
        );
      if (!employeesResponse.ok)
        throw new Error(
          employeesPayload.error ?? "No se pudo cargar el equipo",
        );
      if (!catalogsResponse.ok)
        throw new Error(
          catalogsPayload.error ??
            "No se pudieron cargar clientes y departamentos",
        );
      setOrders(ordersPayload as WorkOrder[]);
      setEmployees(employeesPayload as Employee[]);
      setClients(catalogsPayload.clients as Client[]);
      setDepartments(catalogsPayload.departments as Department[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las órdenes",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const siteDepartments = departments.filter(
    (department) => department.site === selectedSite && department.active,
  );
  const clientsWithDepartment = clients.filter((client) => {
    const department = departments.find(
      (item) =>
        normalizeDepartmentCode(item.code) ===
        normalizeDepartmentCode(client.codigoDepartamento),
    );
    return Boolean(department?.active);
  });

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(
    () => ({
      open: orders.filter(
        (order) => !["COMPLETED", "CANCELLED"].includes(order.status),
      ).length,
      onsite: orders.filter((order) => order.status === "ON_SITE").length,
      progress: orders.filter((order) =>
        ["DIAGNOSIS", "ESTIMATED", "IN_PROGRESS"].includes(order.status),
      ).length,
      overdue: orders.filter(isOverdue).length,
      completed: orders.filter((order) => order.status === "COMPLETED").length,
    }),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === "TODAS" ||
        (statusFilter === "ABIERTAS"
          ? !["COMPLETED", "CANCELLED"].includes(order.status)
          : order.status === statusFilter);
      const matchesSearch =
        !search ||
        [
          order.code,
          order.title,
          `${order.site} ${order.departmentCode}`,
          order.assigneeName,
          order.contactName,
        ].some((value) => value?.toLocaleLowerCase("es").includes(search));
      return matchesStatus && matchesSearch;
    });
  }, [orders, query, statusFilter]);

  async function openOrder(order: WorkOrder) {
    setError("");
    try {
      const response = await apiFetch(`/api/operaciones/ordenes/${order.id}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "No se pudo abrir la orden");
      setSelectedOrder(payload as OrderDetails);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo abrir la orden",
      );
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const files = creationPhotos;
    const data = Object.fromEntries(
      [...form.entries()].filter(([key]) => key !== "evidence"),
    );
    try {
      const response = await apiFetch("/api/operaciones/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "No se pudo crear la orden");
      setShowCreate(false);
      await loadData(true);
      if (files.length) {
        const upload = new FormData();
        files.forEach((file) => upload.append("files", file));
        const evidenceResponse = await apiFetch(
          `/api/operaciones/ordenes/${payload.id}/evidencias`,
          { method: "POST", body: upload },
        );
        const evidencePayload = await evidenceResponse.json();
        if (!evidenceResponse.ok) {
          setError(
            `La orden ${payload.code} se creó, pero no se pudieron adjuntar las fotos: ${evidencePayload.error ?? "error de carga"}`,
          );
        } else {
          setError("");
          await openOrder(payload as WorkOrder);
        }
      }
      setCreationPhotos([]);
      setSelectedClientId("");
      setSelectedDepartmentId("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear la orden",
      );
    } finally {
      setCreating(false);
    }

  }

  async function updateOrder(body: Record<string, unknown>) {
    if (!selectedOrder) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(
        `/api/operaciones/ordenes/${selectedOrder.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "No se pudo actualizar la orden");
      await loadData(true);
      const detailResponse = await apiFetch(
        `/api/operaciones/ordenes/${selectedOrder.id}`,
        { cache: "no-store" },
      );
      const detailPayload = await detailResponse.json();
      if (detailResponse.status === 404) {
        setSelectedOrder(null);
        return;
      }
      if (!detailResponse.ok)
        throw new Error(
          detailPayload.error ?? "No se pudo actualizar el detalle",
        );
      setSelectedOrder(detailPayload as OrderDetails);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar la orden",
      );
    } finally {
      setSaving(false);
    }
  }

  async function assignOrder(employeeId: string) {
    await updateOrder({ assignedEmployeeId: employeeId || null });
  }

  function openCreateForm() {
    setSelectedSite("Angamos");
    setSelectedDepartmentId("");
    setSelectedClientId("");
    setCreationPhotos([]);
    setShowCreate(true);
  }

  function updateCreationPhotos(files: File[]) {
    const supported = ["image/jpeg", "image/png", "image/webp"];
    if (files.length > 5) {
      setError("Puedes adjuntar hasta 5 fotos por orden.");
      return;
    }
    const invalid = files.find(
      (file) => !supported.includes(file.type) || file.size > 8 * 1024 * 1024,
    );
    if (invalid) {
      setError(`"${invalid.name}" no es JPG, PNG o WebP de hasta 8 MB.`);
      return;
    }
    setError("");
    setCreationPhotos(files);
  }

  async function uploadEvidence(orderId: string, files: File[]) {
    const data = new FormData();
    files.forEach((file) => data.append("files", file));
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(
        `/api/operaciones/ordenes/${orderId}/evidencias`,
        { method: "POST", body: data },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "No se pudieron adjuntar las fotos");
      const detailResponse = await apiFetch(
        `/api/operaciones/ordenes/${orderId}`,
        { cache: "no-store" },
      );
      const detailPayload = await detailResponse.json();
      if (!detailResponse.ok)
        throw new Error(
          detailPayload.error ?? "No se pudo actualizar la orden",
        );
      setSelectedOrder(detailPayload as OrderDetails);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "No se pudieron adjuntar las fotos",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <main className="min-h-screen bg-[#f7f9fb] px-4 pb-28 pt-7 text-slate-900 sm:px-6 lg:px-8 lg:pb-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Wrench className="h-4 w-4" />
                OPERACIONES
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Órdenes de trabajo
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Coordina al equipo de campo, programa visitas y sigue cada
                intervención hasta su cierre.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void loadData(true)}
                disabled={refreshing}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <ArrowDownUp
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Actualizar
              </button>
              {canCreate && (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
                >
                  <Plus className="h-5 w-5" />
                  Nueva orden
                </button>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => setError("")}
                className="rounded p-1 hover:bg-red-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <section
            aria-label="Resumen de órdenes"
            className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-5"
          >
            <Metric
              icon={ClipboardList}
              label="Órdenes abiertas"
              value={stats.open}
              accent="blue"
            />
            <Metric
              icon={MapPin}
              label="En sitio"
              value={stats.onsite}
              accent="amber"
            />
            <Metric
              icon={Wrench}
              label="En proceso"
              value={stats.progress}
              accent="violet"
            />
            <Metric
              icon={Clock3}
              label="Vencidas"
              value={stats.overdue}
              accent="red"
            />
            <Metric
              icon={CheckCircle2}
              label="Finalizadas"
              value={stats.completed}
              accent="green"
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Despacho de trabajo
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {visibleOrders.length} órdenes en esta vista
                  </p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar orden, dirección o trabajador"
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>
              <div
                className="mt-4 flex gap-2 overflow-x-auto pb-1"
                role="tablist"
                aria-label="Filtrar por estado"
              >
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                      statusFilter === filter.value
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5" aria-label="Cargando órdenes">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-24 animate-pulse rounded-lg bg-slate-100"
                  />
                ))}
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <ClipboardList className="h-7 w-7" />
                </div>
                <h3 className="font-bold text-slate-900">
                  {orders.length ? "No hay resultados" : "Aún no hay órdenes"}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  {orders.length
                    ? "Prueba con otro filtro o término de búsqueda."
                    : "Crea una orden para coordinar la primera intervención de campo."}
                </p>
                {!orders.length && canCreate && (
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="mt-5 inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" /> Crear orden
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => void openOrder(order)}
                    className="group grid w-full grid-cols-1 gap-3 px-4 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5 lg:grid-cols-[minmax(220px,1.4fr)_minmax(130px,0.8fr)_minmax(110px,0.75fr)_minmax(150px,0.8fr)_auto] lg:items-center lg:gap-5"
                  >
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold tracking-wide text-slate-500">
                          {order.code}
                        </span>
                        <PriorityPill priority={order.priority} />
                      </div>
                      <div className="truncate font-semibold text-slate-900 group-hover:text-blue-700">
                        {order.title}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {order.site} · {order.departmentCode}
                        </span>
                      </div>
                      {order.contactName && (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <UserRound className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{order.contactName}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">
                        {order.assigneeName || "Sin asignar"}
                      </span>
                    </div>
                    <div>
                      <StatusPill status={order.status} />
                    </div>
                    <div
                      className={`flex min-w-0 flex-wrap items-center gap-2 text-sm ${isOverdue(order) ? "font-semibold text-red-700" : "text-slate-500"}`}
                    >
                      <CalendarClock className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        {order.targetAt
                          ? formatDate(order.targetAt, {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              hourCycle: "h23",
                            })
                          : "Sin fecha límite"}
                      </span>
                      {isOverdue(order) && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          Vencida
                        </span>
                      )}
                    </div>
                    <ChevronRight className="hidden h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600 lg:block" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Cada cambio de estado y asignación queda registrado en el historial
            de la orden.
          </div>
        </div>

        {showCreate && (
          <Modal
            title="Crear orden de trabajo"
            onClose={() => setShowCreate(false)}
          >
            <form onSubmit={createOrder} className="space-y-4">
              <div>
                <label
                  htmlFor="order-title"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Título de la incidencia *
                </label>
                <input
                  id="order-title"
                  name="title"
                  required
                  maxLength={255}
                  placeholder="Ej. Fuga de agua en cocina"
                  className="field"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="order-type"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Tipo de incidencia *
                  </label>
                  <select
                    id="order-type"
                    name="issueType"
                    required
                    defaultValue=""
                    className="field"
                  >
                    <option value="" disabled>
                      Selecciona un tipo
                    </option>
                    {[
                      "Plomería",
                      "Electricidad",
                      "Cerrajería",
                      "Limpieza",
                      "Mantenimiento",
                      "Otro",
                    ].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="order-priority"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Prioridad
                  </label>
                  <select
                    id="order-priority"
                    name="priority"
                    defaultValue="MEDIA"
                    className="field"
                  >
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Media</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="order-site"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Sede *
                  </label>
                  <select
                    id="order-site"
                    name="site"
                    required
                    value={selectedSite}
                    disabled={Boolean(selectedClientId)}
                    onChange={(event) => {
                      setSelectedSite(
                        event.target.value as "Angamos" | "Benavides",
                      );
                      setSelectedDepartmentId("");
                      setSelectedClientId("");
                    }}
                    className="field"
                  >
                    <option value="Angamos">Angamos</option>
                    <option value="Benavides">Benavides</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="order-department"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Departamento · UNI/DEP *
                  </label>
                  <select
                    id="order-department"
                    name="departmentId"
                    required
                    value={selectedDepartmentId}
                    disabled={Boolean(selectedClientId)}
                    onChange={(event) => {
                      setSelectedDepartmentId(event.target.value);
                      setSelectedClientId("");
                    }}
                    className="field"
                  >
                    <option value="" disabled>
                      Selecciona código de departamento
                    </option>
                    {siteDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="order-client"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Residente · Clientes
                  </label>
                  <select
                    id="order-client"
                    name="clientId"
                    value={selectedClientId}
                    onChange={(event) => {
                      const clientId = event.target.value;
                      setSelectedClientId(clientId);
                      const client = clients.find(
                        (item) => item.id === clientId,
                      );
                      const department = departments.find(
                        (item) =>
                          normalizeDepartmentCode(item.code) ===
                          normalizeDepartmentCode(client?.codigoDepartamento),
                      );
                      if (department) {
                        setSelectedDepartmentId(department.id);
                        setSelectedSite(department.site);
                      }
                    }}
                    className="field"
                  >
                    <option value="">Sin residente asociado</option>
                    {clientsWithDepartment.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} · {client.codigoDepartamento}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Al elegir un residente, su código en Clientes selecciona
                    automáticamente su departamento UNI/DEP y sede.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="order-target"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Fecha objetivo
                  </label>
                  <input
                    id="order-target"
                    name="targetAt"
                    type="datetime-local"
                    className="field"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="order-assignee"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Asignar personal de mantenimiento
                </label>
                <select
                  id="order-assignee"
                  name="assignedEmployeeId"
                  defaultValue=""
                  className="field"
                >
                  <option value="">Sin asignar por ahora</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.nombres} {employee.apellidos}
                      {employee.cargo ? ` · ${employee.cargo}` : ""}
                    </option>
                  ))}
                </select>
                {employees.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    No hay personal activo del área de mantenimiento en RR. HH.
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="order-description"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Descripción
                </label>
                <textarea
                  id="order-description"
                  name="description"
                  rows={3}
                  maxLength={10000}
                  placeholder="Describe el problema y la información útil para el equipo"
                  className="field min-h-24 resize-y py-3"
                />
              </div>
              <PhotoPicker
                files={creationPhotos}
                onChange={updateCreationPhotos}
              />
              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="h-12 rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {creating ? (
                    "Guardando..."
                  ) : (
                    <>
                      <Plus className="h-4 w-4" /> Crear orden
                    </>
                  )}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {selectedOrder && (
          <OrderDrawer
            key={selectedOrder.id}
            order={selectedOrder}
            employees={employees}
            saving={saving}
            canUpdate={canUpdate}
            onUploadEvidence={uploadEvidence}
            onClose={() => setSelectedOrder(null)}
            onAssign={assignOrder}
          />
        )}
      </main>
    </DashboardShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
  accent: "blue" | "amber" | "violet" | "red" | "green";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium leading-4 text-slate-500 sm:text-sm">
          {label}
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors[accent]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: WorkStatus }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${PRIORITY_STYLE[priority]}`}
    >
      <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[priority]}`} />
      {priority}
    </span>
  );
}

function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">
              Fotos de la incidencia
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              JPG, PNG o WebP · hasta 5 fotos · 8 MB por foto
            </p>
          </div>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Plus className="h-4 w-4" />
          Elegir fotos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => {
              onChange(Array.from(event.target.files ?? []));
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              {previews[index] && (
                <img
                  src={previews[index]}
                  alt={`Vista previa ${index + 1}: ${file.name}`}
                  className="h-28 w-full object-cover"
                />
              )}
              <div className="truncate px-2 py-1.5 text-xs text-slate-600">
                {file.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-xl font-bold text-slate-950">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Los campos marcados con * son obligatorios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function OrderDrawer({
  order,
  employees,
  saving,
  canUpdate,
  onUploadEvidence,
  onClose,
  onAssign,
}: {
  order: OrderDetails;
  employees: Employee[];
  saving: boolean;
  canUpdate: boolean;
  onUploadEvidence: (orderId: string, files: File[]) => Promise<void>;
  onClose: () => void;
  onAssign: (employeeId: string) => Promise<void>;
}) {
  const [assignee, setAssignee] = useState(order.assignedEmployeeId ?? "");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-[#f8fafc] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wide text-slate-500">
                {order.code}
              </span>
              <StatusPill status={order.status} />
            </div>
            <h2
              id="drawer-title"
              className="text-xl font-bold text-slate-950 sm:text-2xl"
            >
              {order.title}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="h-4 w-4 shrink-0" />
              {order.site} · {order.departmentCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Prioridad
              </div>
              <div className="mt-1">
                <PriorityPill priority={order.priority} />
              </div>
            </div>
            <InfoBlock label="Tipo de incidencia" value={order.issueType} />
            <InfoBlock
              label="Departamento · UNI/DEP"
              value={order.departmentCode}
            />
            <InfoBlock label="Sede" value={order.site} />
            <InfoBlock
              label="Fecha objetivo"
              value={formatDate(order.targetAt)}
            />
            <InfoBlock
              label="Contacto"
              value={order.contactName || "No indicado"}
            />
          </div>

          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-bold text-slate-900">
              Descripción
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {order.description || "Sin descripción adicional."}
            </p>
          </section>

          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Fotos y evidencias
              </h3>
            </div>
            {order.attachments.length > 0 ? (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {order.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-slate-200"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="h-28 w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1.5 text-xs text-slate-600">
                      {attachment.fileName}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-sm text-slate-500">
                Todavía no hay fotos adjuntas.
              </p>
            )}
            {canUpdate && (
              <div className="space-y-3">
                <PhotoPicker
                  files={evidenceFiles}
                  onChange={setEvidenceFiles}
                />
                <button
                  type="button"
                  disabled={saving || evidenceFiles.length === 0}
                  onClick={() => {
                    void onUploadEvidence(order.id, evidenceFiles);
                    setEvidenceFiles([]);
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  {saving ? "Subiendo fotos..." : "Adjuntar a la orden"}
                </button>
              </div>
            )}
          </section>

          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Responsable</h3>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                className="field flex-1"
                disabled={!canUpdate}
              >
                {!order.assignedEmployeeId && (
                  <option value="">Sin asignar</option>
                )}
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.nombres} {employee.apellidos}
                  </option>
                ))}
              </select>
              <button
                type="button"
                hidden={!canUpdate}
                disabled={
                  saving || assignee === (order.assignedEmployeeId ?? "")
                }
                onClick={() => void onAssign(assignee)}
                className="h-12 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Guardar asignación
              </button>
            </div>
            {order.assignments.length > 1 && (
              <p className="mt-3 text-xs text-slate-500">
                Historial de asignación: {order.assignments.length} cambios
                registrados.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">
              Historial de actividad
            </h3>
            <div className="space-y-4">
              {order.events.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    {event.eventType === "STATUS_CHANGED" ? (
                      <ArrowLeft className="h-3.5 w-3.5" />
                    ) : (
                      <UserRound className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {humanizeEvent(event)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {event.actorName} · {formatDate(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {order.status === "COMPLETED" && (
          <footer className="border-t border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800 sm:px-7">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Orden finalizada{" "}
              {formatDate(order.completedAt)}
            </span>
          </footer>
        )}
      </aside>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">
        {value}
      </div>
    </div>
  );
}
