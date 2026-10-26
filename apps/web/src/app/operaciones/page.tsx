"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  Bell,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  MapPin,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
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
  clientName: string | null;
  contactName: string;
  customerPresentAtVisit: boolean;
  assignedEmployeeId: string | null;
  assigneeName: string | null;
  assigneeRole: string | null;
  targetAt: string | null;
  arrivalWindowEnd: string | null;
  diagnosis: string;
  resolution: string;
  materialsConfirmed: boolean;
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
  kind?: string;
  description?: string;
}

const EVIDENCE_KINDS = ["FOTO INICIAL", "FOTO DIAGNÓSTICO", "FOTO FINAL"] as const;
type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

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
  arrivalWindowEnd: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
}

interface WorkOrderMaterial {
  id: string;
  material: string;
  quantity: string;
  unit: string;
  unitCost: string;
  totalCost: string;
  observations: string;
  createdAt: string;
}

interface OrderDetails extends WorkOrder {
  events: WorkEvent[];
  visits: Visit[];
  availability: Array<{
    id: string;
    optionNumber: number;
    startsAt: string;
    endsAt: string;
    selectedAt: string | null;
  }>;
  attachments: Evidence[];
  materials: WorkOrderMaterial[];
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
  CREATED: "bg-muted text-on-surface-variant ring-border",
  ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  REASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  ACCEPTED: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
  VISIT_SCHEDULED: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  ON_SITE: "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30",
  DIAGNOSIS: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
  ESTIMATED: "bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/30",
  IN_PROGRESS: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  RESOLVED: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  PENDING_CLOSURE: "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  BLOCKED: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  CANCELLED: "bg-muted text-on-surface-variant ring-border",
  RESCHEDULED: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  BAJA: "bg-muted text-on-surface-variant",
  MEDIA: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  ALTA: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  URGENTE: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};
const PRIORITY_DOT: Record<Priority, string> = {
  BAJA: "bg-slate-400 dark:bg-slate-500",
  MEDIA: "bg-blue-600 dark:bg-blue-400",
  ALTA: "bg-amber-500 dark:bg-amber-400",
  URGENTE: "bg-red-600 dark:bg-red-400",
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

const DEFAULT_WINDOW_MS = 2 * 60 * 60 * 1000;

function addHours(value: string, hours: number): string {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function formatTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatArrivalWindow(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "Sin fecha de llegada";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "Sin fecha de llegada";
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + DEFAULT_WINDOW_MS);
  const sameDay =
    startDate.toDateString() === endDate.toDateString();
  const startDay = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
  }).format(startDate);
  const endDay = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
  }).format(endDate);
  return sameDay
    ? `${startDay} · ${formatTime(start)} – ${formatTime(endDate.toISOString())}`
    : `${startDay} ${formatTime(start)} – ${endDay} ${formatTime(endDate.toISOString())}`;
}

function orderWindowEnd(order: WorkOrder): string | null {
  return order.arrivalWindowEnd ?? (order.targetAt ? addHours(order.targetAt, 2) : null);
}

function isOverdue(order: WorkOrder): boolean {
  const windowEnd = orderWindowEnd(order);
  return Boolean(
    windowEnd &&
      new Date(windowEnd).getTime() < Date.now() &&
      order.status !== "COMPLETED" &&
      order.status !== "CANCELLED",
  );
}

function humanizeEvent(event: WorkEvent): string {
  if (event.eventType === "ORDER_CREATED") return "Recepción de la orden";
  if (event.eventType === "ASSIGNMENT_CHANGED")
    return "Actualizó la asignación";
  if (event.eventType === "VISIT_RESCHEDULED") {
    const reason = typeof event.details.reason === "string" ? event.details.reason : "";
    return reason
      ? `Reprogramó la visita · ${reason}`
      : "Reprogramó la visita";
  }
  if (event.eventType === "CUSTOMER_APPOINTMENT_SCHEDULED")
    return "Programó una cita con el cliente";
  if (event.eventType === "WORK_ORDER_DETAILS_UPDATED")
    return "Actualizó el detalle de la orden";
  if (event.eventType === "MATERIAL_ADDED") return "Registró un material";
  if (event.eventType === "EVIDENCE_UPLOADED") return "Adjuntó evidencia";
  if (event.toStatus === "VISIT_SCHEDULED") return "Visita programada";
  if (event.toStatus === "ON_SITE") return "Llegada del técnico registrada";
  if (event.toStatus === "DIAGNOSIS") return "Inició el diagnóstico";
  if (event.toStatus === "IN_PROGRESS") return "Inició el trabajo";
  if (event.toStatus === "COMPLETED") return "Orden finalizada";
  if (event.fromStatus && event.toStatus) {
    return `Cambió el estado: ${STATUS_LABEL[event.fromStatus as WorkStatus] ?? event.fromStatus} → ${STATUS_LABEL[event.toStatus as WorkStatus] ?? event.toStatus}`;
  }
  return "Actualizó la orden";
}

function FieldOpsMobilePreview() {
  const cards = [
    { label: "Urgente", value: 2, tone: "bg-[#f8d7d7] text-[#cc3a3a]" },
    { label: "Alta", value: 3, tone: "bg-[#dfeafc] text-[#2b4f9d]" },
    { label: "Curso", value: 5, tone: "bg-[#e9ebf0] text-[#4b5563]" },
  ];

  return (
    <section className="mb-7 rounded-[24px] border border-border bg-[#f3f5f7] p-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:hidden">
      <div className="mx-auto max-w-[420px] rounded-[26px] border border-border bg-[#f5f6f8] p-0 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
        <div className="border-b border-border bg-[#f5f6f8] px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Volver"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-on-surface-variant shadow-sm"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                FIELDOPS
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Notificaciones"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-on-surface-variant shadow-sm"
              >
                <Bell className="h-4 w-4" />
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#7bb7ff] via-[#f1d0b3] to-[#7ad0a9] text-xs font-bold text-on-surface shadow-sm">
                PR
              </div>
            </div>
          </div>
          <h2 className="mt-4 text-[2rem] font-black leading-none tracking-[-0.04em] text-on-surface">
            Mis Tareas
          </h2>
        </div>

        <div className="bg-[#f5f6f8] px-4 pb-4 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-[1.05rem] font-semibold text-on-surface">
              Hola, <span className="font-black">Pedro Rodríguez</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#d7f6e8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#0e8b5c]">
              <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
              TURNO ACTIVO · EN LÍNEA
            </div>
          </div>
          <p className="mt-2 text-sm text-on-surface-variant">
            Técnico Principal · Electromecánico
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {cards.map((card) => (
              <div
                key={card.label}
                className={`rounded-2xl border border-border px-3 py-3 ${card.tone}`}
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-current/80">
                  {card.label}
                </div>
                <div className="mt-2 text-[2.05rem] font-black leading-none tracking-[-0.05em]">
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2 overflow-hidden rounded-full bg-surface-variant p-1 text-[11px] font-bold uppercase tracking-[0.04em]">
            {[
              { label: "Todas (11)", active: false },
              { label: "Urgentes (2)", active: true },
              { label: "Prioridad Alta (3)", active: false },
            ].map((filter) => (
              <button
                key={filter.label}
                type="button"
                className={`flex-1 rounded-full px-2 py-2 transition ${filter.active ? "bg-card text-on-surface shadow-sm" : "text-on-surface-variant"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-[18px] border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
                <span className="font-mono text-[#eb4d4d]">OT-000125</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#ffebeb] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#d63b3b]">
                <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                URGENTE
              </span>
            </div>

            <h3 className="mt-4 text-[1.1rem] font-black leading-[1.2] tracking-[-0.04em] text-on-surface">
              Fuga de agua departamento 302
            </h3>

            <div className="mt-3 flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-on-surface-variant">
                <MapPin className="h-3 w-3" />
              </span>
              Torre B · Depto 302 (Residente: Juan Pérez)
            </div>

            <div className="mt-4 flex gap-3 text-xs text-on-surface-variant">
              <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <Camera className="h-3.5 w-3.5" />
                3 fotos
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                1 video
              </div>
            </div>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#d9f7e8] px-3 py-2 text-[11px] font-black uppercase tracking-[0.06em] text-[#0d8b53]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
              VISITA PROGRAMADA
            </div>

            <button
              type="button"
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0f5fd7] text-sm font-black text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)]"
            >
              Iniciar Tarea & Abrir Chat Operativo
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-[#eff4ff] p-3 text-sm leading-6 text-on-surface-variant">
            <div className="flex items-start gap-2">
              <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#dfeafe] text-[#2563eb]">
                <AlertCircle className="h-3 w-3" />
              </span>
              <span>
                Canal temporal directo con Despacho que se paga/archiva al finalizar la tarea.
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-[#f5f6f8] px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              aria-label="Volver"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-on-surface-variant shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              FIELDOPS
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
                #OT-000125
              </span>
              <span className="rounded-full bg-[#dfeafc] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#2d5bc9]">
                ALTA / CRÍTICA
              </span>
            </div>

            <h3 className="mt-4 text-[2.25rem] font-black leading-[1.05] tracking-[-0.06em] text-on-surface">
              Fuga de agua departamento 302
            </h3>

            <div className="mt-4 flex items-center gap-2 text-[15px] text-on-surface-variant">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#e5ecff] text-[#2563eb]">
                <CalendarClock className="h-3.5 w-3.5" />
              </span>
              Programada para hoy: 10:30 AM (en 15 min)
            </div>

            <div className="mt-5 rounded-[20px] border border-border bg-[#f5f7fb] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#d9f7e8] text-[#1b8d63]">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[15px] font-bold text-on-surface">
                      Confirmación Operativa
                    </div>
                    <div className="mt-1 text-sm text-on-surface-variant">
                      Protocolo en Terreno · Sección 10
                    </div>
                  </div>
                </div>
                <span className="rounded-full bg-[#bfe7d5] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.06em] text-[#0b7b4b]">
                  GPS · LISTO
                </span>
              </div>
            </div>

            <button
              type="button"
              className="mt-5 flex h-[58px] w-full items-center justify-center rounded-2xl bg-[#0f5fd7] text-[1.1rem] font-black uppercase tracking-[-0.02em] text-white shadow-[0_12px_24px_rgba(15,80,210,0.28)]"
            >
              ESTOY AQUÍ · REGISTRAR LLEGADA
            </button>

            <div className="mt-4 rounded-xl bg-muted p-3 text-[15px] leading-6 text-on-surface-variant">
              <div className="flex items-center gap-2 text-on-surface">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-card text-[#2563eb]">
                  <Check className="h-3.5 w-3.5" />
                </span>
                Estampa fecha y hora exacta del servidor en tiempo real. Próximo estado del flujo: ON_SITE (En Sitio).
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-[#f5f6f8] px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              aria-label="Volver"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-on-surface-variant shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              FIELDOPS
            </div>
          </div>

          <div className="rounded-[20px] border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
                <span className="font-mono">#OT-000125</span>
              </div>
              <span className="rounded-full bg-[#dfeafc] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#2d5bc9]">
                Cierre técnico
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-on-surface-variant">
              <div className="rounded-xl bg-[#edf3f8] p-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                  Inicio en sitio
                </div>
                <div className="mt-2 text-[1.1rem] font-black text-on-surface">10:34 AM</div>
              </div>
              <div className="rounded-xl bg-[#edf3f8] p-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                  Duración real
                </div>
                <div className="mt-2 text-[1.1rem] font-black text-on-surface">2h 28m</div>
              </div>
            </div>

            <div className="mt-4 rounded-[16px] border border-border bg-[#f4f7f9] p-3">
              <div className="flex items-center gap-2 text-[15px] font-black text-on-surface">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#dfeafe] text-[#3b82f6]">
                  <Wrench className="h-3.5 w-3.5" />
                </span>
                Resolución Técnica
              </div>
              <p className="mt-3 text-[15px] leading-6 text-on-surface-variant">
                Se retiró tramo dañado de 2 metros de tubería de 2&quot;, se instalaron nuevos codos y unión con sellador industrial. Se ejecutó prueba de flujo continuo y presión durante 15 minutos sin caída de presión.
              </p>
            </div>

            <div className="mt-4 rounded-[16px] border border-[#d1f7e4] bg-[#ebfff5] p-3 text-[15px] leading-6 text-on-surface">
              <div className="flex items-center gap-2 font-black text-on-surface">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d8fbe8] text-[#0e8b5c]">
                  <Check className="h-3.5 w-3.5" />
                </span>
                Prueba de estanqueidad y presión satisfactoria
              </div>
              <p className="mt-2">
                15 min en régimen continuo a 4.2 bar sin caída de presión.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-[16px] border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-[15px] font-black text-on-surface">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#dfeafe] text-[#2563eb]">
                  <Camera className="h-3.5 w-3.5" />
                </span>
                Evidencia Final en Sitio
              </div>
              <div className="text-[11px] font-black uppercase tracking-[0.08em] text-on-surface-variant">
                2/2 requeridas
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="h-24 rounded-xl bg-[linear-gradient(135deg,#cbcfda,#bcc5d1)]" />
              <div className="h-24 rounded-xl bg-[linear-gradient(135deg,#c0cbd3,#adb9c1)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OperacionesPage() {
  const clientOrdersOnly = usePathname() === "/pedidos-clientes";
  const { user } = useAuth();
  const access = user ? AccessControl.forRole(user.role, user.additionalPermissions) : null;
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
  const [timelineOrder, setTimelineOrder] = useState<OrderDetails | null>(null);
  const [expandedTimelineOrderId, setExpandedTimelineOrderId] = useState<
    string | null
  >(null);
  const [timelineLoadingId, setTimelineLoadingId] = useState<string | null>(
    null,
  );
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]["value"]>("TODAS");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [timelineToast, setTimelineToast] = useState<{
    id: number;
    title: string;
    message: string;
  } | null>(null);
  const lastTimelineEventRef = useRef<string | null>(null);
  const timelineRequestRef = useRef(0);
  const timelinePollingErrorRef = useRef(false);
  const isAdmin = user?.role === "ADMIN";

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

  useEffect(() => {
    if (!timelineToast) return undefined;
    const timer = window.setTimeout(() => setTimelineToast(null), 6500);
    return () => window.clearTimeout(timer);
  }, [timelineToast]);

  async function toggleOrderTimeline(order: WorkOrder) {
    if (expandedTimelineOrderId === order.id) {
      timelineRequestRef.current += 1;
      setExpandedTimelineOrderId(null);
      setTimelineOrder(null);
      setTimelineLoadingId(null);
      lastTimelineEventRef.current = null;
      return;
    }

    const requestId = timelineRequestRef.current + 1;
    timelineRequestRef.current = requestId;
    setExpandedTimelineOrderId(order.id);
    setTimelineOrder(null);
    setTimelineLoadingId(order.id);
    setError("");
    try {
      const response = await apiFetch(`/api/operaciones/ordenes/${order.id}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "No se pudo cargar la línea de tiempo");
      if (timelineRequestRef.current !== requestId) return;
      const detail = payload as OrderDetails;
      lastTimelineEventRef.current = detail.events?.[0]?.id ?? null;
      setTimelineOrder(detail);
    } catch (timelineError) {
      if (timelineRequestRef.current === requestId) {
        setExpandedTimelineOrderId(null);
        setError(
          timelineError instanceof Error
            ? timelineError.message
            : "No se pudo cargar la línea de tiempo",
        );
      }
    } finally {
      if (timelineRequestRef.current === requestId) setTimelineLoadingId(null);
    }
  }

  const timelineOrderId = timelineOrder?.id;
  useEffect(() => {
    if (!timelineOrderId) return undefined;
    let cancelled = false;
    let requestInFlight = false;
    const timer = window.setInterval(async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await apiFetch(
          `/api/operaciones/ordenes/${timelineOrderId}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            payload?.error ?? "No se pudo actualizar la línea de tiempo",
          );
        }
        const payload = (await response.json()) as OrderDetails;
        if (cancelled) return;
        const latest = payload.events?.[0];
        if (latest && latest.id !== lastTimelineEventRef.current) {
          lastTimelineEventRef.current = latest.id;
          setTimelineOrder(payload);
          setTimelineToast({
            id: Date.now(),
            title: `Línea de tiempo · ${payload.code}`,
            message: humanizeEvent(latest),
          });
        }
        if (timelinePollingErrorRef.current) {
          timelinePollingErrorRef.current = false;
          setError("");
        }
      } catch (pollError) {
        if (!cancelled) {
          timelinePollingErrorRef.current = true;
          setError(
            pollError instanceof Error
              ? pollError.message
              : "No se pudo actualizar la línea de tiempo",
          );
        }
      } finally {
        requestInFlight = false;
      }
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [timelineOrderId]);

  const scopedOrders = useMemo(
    () =>
      clientOrdersOnly
        ? orders.filter((order) => order.clientId !== null)
        : orders,
    [clientOrdersOnly, orders],
  );

  const stats = useMemo(
    () => ({
      open: scopedOrders.filter(
        (order) => !["COMPLETED", "CANCELLED"].includes(order.status),
      ).length,
      onsite: scopedOrders.filter((order) => order.status === "ON_SITE").length,
      progress: scopedOrders.filter((order) =>
        ["DIAGNOSIS", "ESTIMATED", "IN_PROGRESS"].includes(order.status),
      ).length,
      overdue: scopedOrders.filter(isOverdue).length,
      completed: scopedOrders.filter((order) => order.status === "COMPLETED").length,
    }),
    [scopedOrders],
  );

  const visibleOrders = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("es");
    return scopedOrders.filter((order) => {
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
          order.clientName,
          order.contactName,
        ].some((value) => value?.toLocaleLowerCase("es").includes(search));
      return matchesStatus && matchesSearch;
    });
  }, [scopedOrders, query, statusFilter]);

  async function openOrder(order: WorkOrder) {
    setError("");
    try {
      const response = await apiFetch(`/api/operaciones/ordenes/${order.id}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "No se pudo abrir la orden");
      const detail = payload as OrderDetails;
      setSelectedOrder(detail);
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
      const targetDate = String(data.targetDate ?? "").trim();
      const targetStart = String(data.targetStart ?? "").trim();
      const targetEnd = String(data.targetEnd ?? "").trim();
      delete data.targetDate;
      delete data.targetStart;
      delete data.targetEnd;
      if (targetDate && targetStart) {
        if (targetEnd && targetEnd <= targetStart) {
          throw new Error(
            "La ventana de llegada debe terminar después de la hora de inicio.",
          );
        }
        data.targetAt = new Date(`${targetDate}T${targetStart}`).toISOString();
        if (targetEnd)
          data.arrivalWindowEnd = new Date(`${targetDate}T${targetEnd}`).toISOString();
        else delete data.arrivalWindowEnd;
      } else if (targetDate || targetStart || targetEnd) {
        throw new Error("Indica la fecha y hora de inicio de la ventana de llegada.");
      } else {
        delete data.targetAt;
        delete data.arrivalWindowEnd;
      }
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
        upload.append("kind", "FOTO INICIAL");
        upload.append(
          "description",
          String(data.description ?? "").trim() ||
            `Fotos iniciales de la orden ${payload.code}`,
        );
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

  async function selectAvailability(optionId: string) {
    if (!selectedOrder) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(
        `/api/operaciones/ordenes/${selectedOrder.id}/availability`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo confirmar el horario");
      }
      await loadData(true);
      const detailResponse = await apiFetch(
        `/api/operaciones/ordenes/${selectedOrder.id}`,
        { cache: "no-store" },
      );
      const detailPayload = await detailResponse.json();
      if (!detailResponse.ok) {
        throw new Error(detailPayload.error ?? "No se pudo actualizar el pedido");
      }
      setSelectedOrder(detailPayload as OrderDetails);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo confirmar el horario",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder(order: WorkOrder) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente la orden ${order.code}? Se borrarán sus visitas, materiales y fotos. Esta acción no se puede deshacer.`,
      )
    )
      return;
    setDeletingId(order.id);
    setError("");
    try {
      const response = await apiFetch(`/api/operaciones/ordenes/${order.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "No se pudo eliminar la orden");
      }
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
      setOrders((prev) => prev.filter((item) => item.id !== order.id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar la orden",
      );
    } finally {
      setDeletingId(null);
    }
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

  async function uploadEvidence(
    orderId: string,
    files: File[],
    kind: EvidenceKind,
    description: string,
  ): Promise<boolean> {
    const data = new FormData();
    files.forEach((file) => data.append("files", file));
    data.append("kind", kind);
    data.append("description", description.trim());
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
      return true;
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "No se pudieron adjuntar las fotos",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <main className="min-h-screen bg-surface-container-low px-4 pb-28 pt-7 text-on-surface sm:px-6 lg:px-8 lg:pb-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Wrench className="h-4 w-4" />
                OPERACIONES
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
                {clientOrdersOnly ? "Pedidos de clientes" : "Órdenes de trabajo"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-on-surface-variant sm:text-base">
                {clientOrdersOnly
                  ? "Gestiona los reportes enviados por clientes y verifica en cada pedido el cliente, departamento y código UNI/DEP asociado."
                  : "Coordina al equipo de campo, programa visitas y sigue cada intervención hasta su cierre."}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void loadData(true)}
                disabled={refreshing}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-on-surface transition hover:bg-muted disabled:opacity-60"
              >
                <ArrowDownUp
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Actualizar
              </button>
              {canCreate && !clientOrdersOnly && (
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

          <FieldOpsMobilePreview />

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

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <div className="border-b border-border p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">
                    Despacho de trabajo
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {visibleOrders.length} órdenes en esta vista
                  </p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar orden, dirección o trabajador"
                    className="h-12 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm outline-none transition placeholder:text-on-surface-variant focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                        : "bg-muted text-on-surface-variant hover:bg-muted"
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
                    className="h-24 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <ClipboardList className="h-7 w-7" />
                </div>
                <h3 className="font-bold text-on-surface">
                  {orders.length ? "No hay resultados" : "Aún no hay órdenes"}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">
                  {scopedOrders.length
                    ? "Prueba con otro filtro o término de búsqueda."
                    : clientOrdersOnly
                      ? "Los pedidos de clientes aparecerán aquí cuando se envíen desde el portal."
                      : "Crea una orden para coordinar la primera intervención de campo."}
                </p>
                {!clientOrdersOnly && !scopedOrders.length && canCreate && (
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
              <div className="divide-y divide-border">
                {visibleOrders.map((order) => (
                  <div key={order.id} className="group">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => void openOrder(order)}
                        className="grid w-full flex-1 grid-cols-1 gap-3 px-4 py-4 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5 lg:grid-cols-[minmax(220px,1.4fr)_minmax(130px,0.8fr)_minmax(110px,0.75fr)_minmax(150px,0.8fr)_auto] lg:items-center lg:gap-5"
                      >
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold tracking-wide text-on-surface-variant">
                            {order.code}
                          </span>
                          <PriorityPill priority={order.priority} />
                        </div>
                        <div className="truncate font-semibold text-on-surface group-hover:text-blue-700">
                          {order.title}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-on-surface-variant">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {order.site} · {order.departmentCode}
                          </span>
                        </div>
                        {order.contactName && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
                            <UserRound className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {order.clientName || order.contactName}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <UserRound className="h-4 w-4 shrink-0 text-on-surface-variant" />
                        <span className="truncate">
                          {order.assigneeName || "Sin asignar"}
                        </span>
                      </div>
                      <div>
                        <StatusPill status={order.status} />
                      </div>
                      <div
                        className={`flex min-w-0 flex-wrap items-center gap-2 text-sm ${isOverdue(order) ? "font-semibold text-red-700" : "text-on-surface-variant"}`}
                      >
                        <CalendarClock className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">
                          {formatArrivalWindow(
                            order.targetAt,
                            orderWindowEnd(order),
                          )}
                        </span>
                        {isOverdue(order) && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                            Vencida
                          </span>
                        )}
                      </div>
                      <ChevronRight className="hidden h-5 w-5 text-on-surface-variant transition group-hover:translate-x-0.5 group-hover:text-blue-600 lg:block" />
                      </button>
                      <div className="flex items-center gap-1 pr-3 sm:pr-5">
                        <button
                          type="button"
                          onClick={() => void toggleOrderTimeline(order)}
                          aria-expanded={expandedTimelineOrderId === order.id}
                          aria-controls={`timeline-${order.id}`}
                          aria-label={`${expandedTimelineOrderId === order.id ? "Ocultar" : "Ver"} línea de tiempo ${order.code}`}
                          title={`${expandedTimelineOrderId === order.id ? "Ocultar" : "Ver"} línea de tiempo`}
                          className={`flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${
                            expandedTimelineOrderId === order.id
                              ? "bg-amber-100 text-amber-900"
                              : "text-on-surface-variant hover:bg-muted"
                          }`}
                        >
                          <Clock3 className="h-4 w-4" />
                          <span className="hidden xl:inline">Línea de tiempo</span>
                        </button>
                        {isAdmin && (
                        <button
                          type="button"
                          onClick={() => void deleteOrder(order)}
                          disabled={deletingId === order.id}
                          aria-label={`Eliminar orden ${order.code}`}
                          title="Eliminar orden"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        )}
                      </div>
                    </div>
                    {expandedTimelineOrderId === order.id && (
                      <div id={`timeline-${order.id}`} className="border-t border-border bg-surface-container-low/50 px-4 py-4 sm:px-6">
                        {timelineLoadingId === order.id ? (
                          <p className="text-sm text-on-surface-variant" role="status">
                            Cargando línea de tiempo...
                          </p>
                        ) : timelineOrder?.id === order.id ? (
                          <HorizontalOrderTimeline order={timelineOrder} />
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-on-surface-variant">
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
                  className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
                    className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
                    className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
                    className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
                    className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
                    className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
                  <p className="mt-1.5 text-xs text-on-surface-variant">
                    Al elegir un residente, su código en Clientes selecciona
                    automáticamente su departamento UNI/DEP y sede.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="order-target-date"
                    className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
                  >
                    Fecha de llegada
                  </label>
                  <input
                    id="order-target-date"
                    name="targetDate"
                    type="date"
                    className="field"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="order-window-start"
                    className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
                  >
                    Ventana de llegada
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="order-window-start"
                      name="targetStart"
                      type="time"
                      aria-label="Hora de inicio de la ventana de llegada"
                      className="field flex-1"
                    />
                    <span className="text-sm font-semibold text-on-surface-variant">
                      hasta
                    </span>
                    <input
                      id="order-window-end"
                      name="targetEnd"
                      type="time"
                      aria-label="Hora de fin de la ventana de llegada"
                      className="field flex-1"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-on-surface-variant">
                    El técnico puede llegar en cualquier momento dentro de este
                    rango. Si no indicas el fin, se usan 2 horas.
                  </p>
                </div>
              </div>
              <div>
                <label
                  htmlFor="order-assignee"
                  className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
                  className="mb-1.5 block text-sm font-semibold text-on-surface-variant"
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
              <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="h-12 rounded-lg border border-border px-5 text-sm font-semibold text-on-surface-variant hover:bg-muted"
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
            onSelectAvailability={selectAvailability}
            canDelete={isAdmin}
            onDelete={deleteOrder}
          />
        )}
      </main>

      {timelineToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-5 z-[100] w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-amber-300 bg-card shadow-2xl dark:border-amber-500/40"
        >
          <div className="flex items-start gap-3 p-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                {timelineToast.title}
              </p>
              <p className="mt-1 text-sm font-semibold text-on-surface">
                {timelineToast.message}
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar aviso de línea de tiempo"
              onClick={() => setTimelineToast(null)}
              className="rounded p-1 text-on-surface-variant hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="h-1 bg-amber-400" />
        </div>
      )}
    </DashboardShell>
  );
}

function HorizontalOrderTimeline({ order }: { order: OrderDetails }) {
  const events = [...order.events].reverse();
  const isClosed = ["COMPLETED", "CANCELLED"].includes(order.status);

  return (
    <section
      aria-label={`Línea de tiempo de la orden ${order.code}`}
      className={`rounded-xl border p-4 ${
        isClosed
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10"
          : "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10"
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isClosed
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
          }`}
        >
          {isClosed ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {!isClosed && (
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-on-surface">
            Línea de tiempo · {order.code}
          </h3>
          <p className="text-xs text-on-surface-variant">
            {isClosed
              ? "Orden cerrada · historial completo"
              : "Modo alerta · se actualiza con cada visita y proceso"}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${
            isClosed
              ? "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/30"
              : "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/30"
          }`}
        >
          {isClosed ? "Completada" : "Alerta activa"}
        </span>
      </div>

      {!isClosed && isOverdue(order) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          La ventana de llegada terminó y la orden sigue abierta.
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          Todavía no hay movimientos registrados.
        </p>
      ) : (
        <ol className="relative flex gap-0 overflow-x-auto pb-2">
          <span
            aria-hidden="true"
            className="absolute left-3 right-8 top-3 h-px bg-amber-300 dark:bg-amber-500/40"
          />
          {events.map((event, index) => {
            const isLatest = index === events.length - 1;
            const scheduledAt =
              typeof event.details.scheduledAt === "string"
                ? event.details.scheduledAt
                : null;
            const arrivalWindowEnd =
              typeof event.details.arrivalWindowEnd === "string"
                ? event.details.arrivalWindowEnd
                : null;

            return (
              <li
                key={event.id}
                className="relative z-10 w-64 shrink-0 pr-5"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-amber-50 ${
                    isLatest
                      ? "bg-blue-600 text-white ring-blue-100 dark:bg-blue-400 dark:ring-blue-500/20"
                      : "bg-amber-500 text-white dark:bg-amber-400 dark:ring-amber-500/20"
                  }`}
                >
                  {event.eventType === "STATUS_CHANGED" ? (
                    <ArrowLeft className="h-3 w-3" />
                  ) : (
                    <UserRound className="h-3 w-3" />
                  )}
                </span>
                <div className="mt-3 min-h-20 rounded-lg border border-amber-200/80 bg-card/80 p-3 dark:border-amber-500/20">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm leading-5 ${
                        isLatest
                          ? "font-bold text-on-surface"
                          : "font-medium text-on-surface"
                      }`}
                    >
                      {humanizeEvent(event)}
                    </p>
                    {isLatest && (
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                        Último
                      </span>
                    )}
                  </div>
                  {scheduledAt && arrivalWindowEnd && (
                    <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
                      Ventana:{" "}
                      {formatArrivalWindow(scheduledAt, arrivalWindowEnd)}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-on-surface-variant">
                    {event.actorName} ·{" "}
                    {formatDate(event.createdAt, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium leading-4 text-on-surface-variant sm:text-sm">
          {label}
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors[accent]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-on-surface">
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
    <div className="rounded-xl border border-dashed border-border bg-muted p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-on-surface">
              Fotos de la incidencia
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              JPG, PNG o WebP · hasta 5 fotos · 8 MB por foto
            </p>
          </div>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-on-surface-variant hover:bg-muted">
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
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              {previews[index] && (
                <img
                  src={previews[index]}
                  alt={`Vista previa ${index + 1}: ${file.name}`}
                  className="h-28 w-full object-cover"
                />
              )}
              <div className="truncate px-2 py-1.5 text-xs text-on-surface-variant">
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
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl sm:max-w-2xl sm:rounded-xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-xl font-bold text-on-surface">
              {title}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Los campos marcados con * son obligatorios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

interface ChatMessage {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
}

function WorkOrderChat({
  orderId,
  enabled,
  closed,
}: {
  orderId: string;
  enabled: boolean;
  closed: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadMessages = useCallback(async () => {
    const response = await apiFetch(
      `/api/operaciones/ordenes/${orderId}/chat`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as {
      messages?: ChatMessage[];
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? "No se pudo consultar el chat");
    setMessages(body.messages ?? []);
  }, [orderId]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        await loadMessages();
        if (alive) setError("");
      } catch (reason) {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudo consultar el chat");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await apiFetch(
        `/api/operaciones/ordenes/${orderId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const body = (await response.json()) as {
        message?: ChatMessage;
        error?: string;
      };
      if (!response.ok || !body.message) {
        throw new Error(body.error ?? "No se pudo enviar el mensaje");
      }
      setMessages((current) => [...current, body.message!]);
      setDraft("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <h3 className="mb-2 text-sm font-bold text-on-surface">
        Chat con el cliente
      </h3>
      {!enabled && !closed && (
        <p className="text-sm text-on-surface-variant">
          Se habilitará al registrar la llegada de mantenimiento al departamento.
        </p>
      )}
      {closed && (
        <p className="mb-3 text-sm text-on-surface-variant">
          La conversación se cerró al finalizar o cancelar la orden.
        </p>
      )}
      {(enabled || closed) && (
        <>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-card p-3">
            {loading ? (
              <p className="text-sm text-on-surface-variant">Cargando conversación…</p>
            ) : messages.length ? (
              messages.map((message) => (
                <div key={message.id} className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs font-semibold text-on-surface">
                    {message.senderName} · {formatDate(message.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface-variant">
                    {message.content}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant">
                {enabled ? "Envía un mensaje para abrir el chat con el cliente." : "No hay mensajes."}
              </p>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
          {enabled && (
            <form onSubmit={sendMessage} className="mt-3 flex gap-2">
              <input
                value={draft}
                maxLength={2000}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escribe al cliente…"
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-md bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "Enviando…" : "Enviar"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function OrderDrawer({
  order,
  employees,
  saving,
  canUpdate,
  canDelete,
  onUploadEvidence,
  onClose,
  onAssign,
  onSelectAvailability,
  onDelete,
}: {
  order: OrderDetails;
  employees: Employee[];
  saving: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onUploadEvidence: (
    orderId: string,
    files: File[],
    kind: EvidenceKind,
    description: string,
  ) => Promise<boolean>;
  onClose: () => void;
  onAssign: (employeeId: string) => Promise<void>;
  onSelectAvailability: (optionId: string) => Promise<void>;
  onDelete: (order: WorkOrder) => Promise<void>;
}) {
  const [assignee, setAssignee] = useState(order.assignedEmployeeId ?? "");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>("FOTO FINAL");
  const [evidenceDescription, setEvidenceDescription] = useState("");
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
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wide text-on-surface-variant">
                {order.code}
              </span>
              <StatusPill status={order.status} />
            </div>
            <h2
              id="drawer-title"
              className="text-xl font-bold text-on-surface sm:text-2xl"
            >
              {order.title}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-on-surface-variant">
              <MapPin className="h-4 w-4 shrink-0" />
              {order.site} · {order.departmentCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                Prioridad
              </div>
              <div className="mt-1">
                <PriorityPill priority={order.priority} />
              </div>
            </div>
            <InfoBlock label="Tipo de incidencia" value={order.issueType} />
            <InfoBlock
              label="Departamento · UNI/DEP"
              value={
                order.departmentName
                  ? `${order.departmentName}${order.departmentNumber ? ` ${order.departmentNumber}` : ""} · ${order.departmentCode}`
                  : order.departmentCode
              }
            />
            <InfoBlock label="Sede" value={order.site} />
            <InfoBlock
              label="Ventana de llegada"
              value={formatArrivalWindow(order.targetAt, orderWindowEnd(order))}
            />
            <InfoBlock
              label="Contacto"
              value={order.clientName || order.contactName || "No indicado"}
            />
          </div>

          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-bold text-on-surface">
              Descripción
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">
              {order.description || "Sin descripción adicional."}
            </p>
          </section>

          {!order.customerPresentAtVisit && (
            <WorkOrderChat
              orderId={order.id}
              enabled={["ON_SITE", "DIAGNOSIS", "ESTIMATED", "IN_PROGRESS", "RESOLVED", "PENDING_CLOSURE"].includes(order.status)}
              closed={["COMPLETED", "CANCELLED"].includes(order.status)}
            />
          )}

          {order.availability.length > 0 && (
            <section className="mb-5 rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                <h3 className="text-sm font-bold text-on-surface">
                  Horarios propuestos por el cliente
                </h3>
              </div>
              {order.status !== "ACCEPTED" &&
                !order.availability.some((option) => option.selectedAt) && (
                  <p className="mb-3 text-xs leading-5 text-on-surface-variant">
                    Acepta la orden para poder confirmar uno de estos horarios.
                  </p>
                )}
              <ol className="space-y-2">
                {order.availability.map((option) => (
                  <li
                    key={option.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-100 bg-card px-3 py-2 dark:border-cyan-900"
                  >
                    <span className="text-sm font-medium text-on-surface">
                      Opción {option.optionNumber} ·{" "}
                      {formatArrivalWindow(option.startsAt, option.endsAt)}
                    </span>
                    {option.selectedAt && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Seleccionada
                      </span>
                    )}
                    {canUpdate && !option.selectedAt && (
                      <button
                        type="button"
                        disabled={saving || order.status !== "ACCEPTED"}
                        onClick={() => void onSelectAvailability(option.id)}
                        className="rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Confirmar visita
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-on-surface">
                Visitas y ventanas de llegada
              </h3>
              {order.visits.length > 0 && (
                <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
                  {order.visits.length}
                </span>
              )}
            </div>
            {order.visits.length > 0 ? (
              <ul className="divide-y divide-border">
                {order.visits.map((visit) => (
                  <li key={visit.id} className="py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-on-surface">
                        Visita {Number(visit.visitNumber)}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30">
                        {formatArrivalWindow(
                          visit.scheduledAt,
                          visit.arrivalWindowEnd ??
                            addHours(visit.scheduledAt, 2),
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                      <span>
                        {visit.arrivedAt
                          ? `Llegada: ${formatDate(visit.arrivedAt, {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              hourCycle: "h23",
                            })}`
                          : "Llegada pendiente"}
                      </span>
                      {visit.completedAt ? (
                        <span>
                          Cierre: {formatDate(visit.completedAt, {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            hourCycle: "h23",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-on-surface-variant">
                Aún no hay visitas programadas. La ventana se mostrará aquí en
                cuanto el equipo confirme la visita.
              </p>
            )}
          </section>

          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-on-surface">
                Productos y materiales solicitados
              </h3>
              {order.materials.length > 0 && (
                <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
                  {order.materials.length}
                </span>
              )}
            </div>
            {order.materials.length > 0 ? (
              <ul className="divide-y divide-border">
                {order.materials.map((material) => (
                  <li
                    key={material.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-on-surface">
                        {material.material}
                      </p>
                      {material.observations && (
                        <p className="truncate text-xs text-on-surface-variant">
                          {material.observations}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-on-surface-variant">
                      {material.quantity}
                      {material.unit ? ` ${material.unit}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-on-surface-variant">
                {order.materialsConfirmed
                  ? "El técnico confirmó que no se requieren productos."
                  : "Todavía no se registraron productos solicitados."}
              </p>
            )}
          </section>

          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-on-surface">
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
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="h-28 w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1.5 text-xs text-on-surface-variant">
                      {attachment.kind ? `${attachment.kind} · ` : ""}
                      {attachment.fileName}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-sm text-on-surface-variant">
                Todavía no hay fotos adjuntas.
              </p>
            )}
            {canUpdate && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-on-surface-variant">
                      Tipo de evidencia
                    </span>
                    <select
                      value={evidenceKind}
                      onChange={(event) =>
                        setEvidenceKind(event.target.value as EvidenceKind)
                      }
                      className="field"
                    >
                      {EVIDENCE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-on-surface-variant">
                      Descripción
                    </span>
                    <input
                      value={evidenceDescription}
                      onChange={(event) =>
                        setEvidenceDescription(event.target.value)
                      }
                      maxLength={1000}
                      placeholder="Ej. Conexión reparada y sin fugas"
                      className="field"
                    />
                  </label>
                </div>
                <PhotoPicker
                  files={evidenceFiles}
                  onChange={setEvidenceFiles}
                />
                <button
                  type="button"
                  disabled={
                    saving ||
                    evidenceFiles.length === 0 ||
                    !evidenceDescription.trim()
                  }
                  onClick={() => {
                    void onUploadEvidence(
                      order.id,
                      evidenceFiles,
                      evidenceKind,
                      evidenceDescription,
                    ).then((ok) => {
                      if (ok) {
                        setEvidenceFiles([]);
                        setEvidenceDescription("");
                      }
                    });
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-on-surface-variant hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  {saving ? "Subiendo fotos..." : "Adjuntar a la orden"}
                </button>
                {evidenceFiles.length > 0 && !evidenceDescription.trim() && (
                  <p className="text-xs text-amber-700">
                    Escribe una descripción para adjuntar la evidencia.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-on-surface">Responsable</h3>
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
                className="h-12 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-on-surface hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Guardar asignación
              </button>
            </div>
            {order.assignments.length > 1 && (
                <p className="mt-3 text-xs text-on-surface-variant">
                  Historial de asignación: {order.assignments.length} cambios
                  registrados.
                </p>
              )}
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

        {canDelete && (
          <footer className="border-t border-border bg-card px-5 py-4 sm:px-7">
            <button
              type="button"
              onClick={() => void onDelete(order)}
              disabled={saving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar orden
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-on-surface">
        {value}
      </div>
    </div>
  );
}
