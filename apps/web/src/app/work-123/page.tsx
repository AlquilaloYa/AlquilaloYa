"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Kanban,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  User,
  X,
} from "lucide-react";

type TaskState = "PENDIENTE" | "EN_RESOLUCION" | "RESUELTA";

interface ContractBrief {
  id: string;
  codigoContrato: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  estado: string;
}

interface ContractEvent {
  kind: "REVISION" | "LIMPIEZA" | "INICIO" | "FIN";
  label: string;
  estado: string;
  departamento: string;
  diasParaVencer: number | null;
}

const EVENTO_LABEL: Record<ContractEvent["kind"], string> = {
  REVISION: "Revisión previa",
  LIMPIEZA: "Limpieza",
  INICIO: "Inicio",
  FIN: "Revisión (Check out)",
};

const EVENTO_DETALLE: Record<ContractEvent["kind"], string> = {
  REVISION: "Revisión previa (2 días antes del inicio)",
  LIMPIEZA: "Limpieza (1 día antes del inicio)",
  INICIO: "Inicio de contrato",
  FIN: "Revisión (Check out) · día de fin de contrato",
};

const CHIP_URGENTE =
  "bg-red-100 text-red-800 ring-1 ring-red-500 dark:bg-red-500/25 dark:text-red-200 dark:ring-red-400/50";
const CHIP_POR_KIND: Record<ContractEvent["kind"], string> = {
  REVISION: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  LIMPIEZA: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  INICIO: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  FIN: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
};
const CARD_URGENTE = "border-red-400/70 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10";
const CARD_POR_KIND: Record<ContractEvent["kind"], string> = {
  REVISION: "border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
  LIMPIEZA: "border-sky-300/60 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10",
  INICIO: "border-violet-300/60 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10",
  FIN: "border-violet-300/60 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10",
};
const TEXT_URGENTE = "text-red-800 dark:text-red-200";
const TEXT_POR_KIND: Record<ContractEvent["kind"], string> = {
  REVISION: "text-amber-800 dark:text-amber-200",
  LIMPIEZA: "text-sky-800 dark:text-sky-200",
  INICIO: "text-violet-800 dark:text-violet-200",
  FIN: "text-violet-800 dark:text-violet-200",
};

function diasHastaVencimiento(fechaFin: string | null): number | null {
  if (!fechaFin) return null;
  const fin = new Date(`${String(fechaFin).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(fin.getTime())) return null;
  return Math.ceil((fin.getTime() - Date.now()) / 86_400_000);
}

interface Task {
  id: string;
  titulo: string;
  descripcion: string;
  asignadoA: string;
  fechaLimite: string | null;
  estado: TaskState;
  creadoPor: string;
  origenTipo?: string;
  origenEvento?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

const ESTADOS: Array<{ value: TaskState; label: string }> = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "EN_RESOLUCION", label: "En resolución" },
  { value: "RESUELTA", label: "Resuelta" },
];

const ESTADO_CHIP: Record<TaskState, string> = {
  PENDIENTE: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  EN_RESOLUCION: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  RESUELTA: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200",
};

const COLUMNAS: Array<{ value: TaskState; title: string; hint: string }> = [
  { value: "PENDIENTE", title: "Tareas pendientes", hint: "Recién creadas, sin iniciar" },
  { value: "EN_RESOLUCION", title: "En resolución", hint: "En proceso por el asignado" },
  { value: "RESUELTA", title: "Tareas resueltas", hint: "Completadas" },
];

const DIA_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

const USUARIOS_SUGERIDOS = [
  "Andrea Admin",
  "Juan Operador",
  "Sofia Supervisora",
  "Alicia Auditora",
  "Felipe Firmante",
  "Maria Gomez",
  "Carlos Rojas",
  "Lucia Mendez",
  "Pedro Sanchez",
  "Ana Torres",
];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-surface-container-low p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-primary">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Work123Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contracts, setContracts] = useState<ContractBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string>(dayKey(new Date()));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({ titulo: "", descripcion: "", asignadoA: "", fechaLimite: "", estado: "PENDIENTE" as TaskState });

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskState | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [resTareas, resContratos] = await Promise.all([
        apiFetch("/api/tareas"),
        apiFetch("/api/contracts").catch(() => null),
      ]);
      if (!resTareas.ok) {
        const body = await resTareas.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${resTareas.status}`);
      }
      setTasks((await resTareas.json()) as Task[]);
      if (resContratos && resContratos.ok) {
        setContracts((await resContratos.json()) as ContractBrief[]);
      } else {
        setContracts([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.fechaLimite) continue;
      const d = new Date(t.fechaLimite);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  // Fechas que generan los contratos (inicio y fin) sobre el calendario.
  const contractEventsByDay = useMemo(() => {
    const map = new Map<string, ContractEvent[]>();
    const push = (key: string, ev: ContractEvent) => {
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    };
    for (const c of contracts) {
      if (c.estado === "ANULADO" || c.estado === "RECHAZADO") continue;
      const cliente = `${c.clienteNombre ?? ""} ${c.apellidoCliente ?? ""}`.trim();
      const label = `${c.codigoContrato}${cliente ? ` · ${cliente}` : ""}`;
      const dias = diasHastaVencimiento(c.fechaFin);
      const pushOffset = (iso: string, offsetDias: number, kind: ContractEvent["kind"]) => {
        if (!iso) return;
        const d = new Date(`${iso}T00:00:00`);
        if (Number.isNaN(d.getTime())) return;
        if (offsetDias !== 0) d.setDate(d.getDate() + offsetDias);
        push(dayKey(d), { kind, label, estado: c.estado, departamento: c.departamentoNombre, diasParaVencer: dias });
      };
      const inicio = c.fechaInicio ? String(c.fechaInicio).slice(0, 10) : "";
      const fin = c.fechaFin ? String(c.fechaFin).slice(0, 10) : "";
      // Reglas: con inicio el 15 → revisión previa el 13, limpieza el 14, inicio el 15 y check off el día del fin.
      pushOffset(inicio, -2, "REVISION");
      pushOffset(inicio, -1, "LIMPIEZA");
      pushOffset(inicio, 0, "INICIO");
      pushOffset(fin, 0, "FIN");
    }
    return map;
  }, [contracts]);

  const contractsOfDay = useMemo(
    () => contractEventsByDay.get(selectedDay) ?? [],
    [contractEventsByDay, selectedDay]
  );

  const tasksOfDay = useMemo(() => tasksByDay.get(selectedDay) ?? [], [tasksByDay, selectedDay]);

  const calendarCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= count; d++) cells.push(d);
    return cells;
  }, [cursor]);

  const todayKey = dayKey(new Date());

  function changeMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  function openCreate() {
    setEditing(null);
    setForm({ titulo: "", descripcion: "", asignadoA: "", fechaLimite: selectedDay, estado: "PENDIENTE" });
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setForm({
      titulo: task.titulo,
      descripcion: task.descripcion,
      asignadoA: task.asignadoA,
      fechaLimite: task.fechaLimite ? dayKey(new Date(task.fechaLimite)) : "",
      estado: task.estado,
    });
    setModalOpen(true);
  }

  async function saveTask() {
    if (!form.titulo.trim()) {
      setError("Indica el título de la tarea");
      return;
    }
    if (!form.fechaLimite) {
      setError("Indica la fecha límite");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: editing?.id,
        titulo: form.titulo,
        descripcion: form.descripcion,
        asignadoA: form.asignadoA,
        fechaLimite: form.fechaLimite,
        estado: form.estado,
      };
      const res = await apiFetch("/api/tareas", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/tareas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(id: string, estado: TaskState) {
    setError(null);
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const moving = previous.find((t) => t.id === id);
    if (moving) setTasks((prev) => [{ ...moving, estado }, ...prev]);
    try {
      const res = await apiFetch("/api/tareas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
      setTasks(previous);
    }
  }

  function onDrop(estado: TaskState) {
    if (dragId) void moveTask(dragId, estado);
    setDragId(null);
    setDragOverCol(null);
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Work 123</h2>
            <p className="font-body-sm text-on-surface-variant">
              Calendario y tablero de tareas · {tasks.length} tareas · {contracts.length} contratos ({contractEventsByDay.size} días con fechas)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface transition-colors hover:bg-surface-variant"
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground transition-colors hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nueva tarea
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando tareas…
          </div>
        ) : (
          <>
            <section className="rounded-lg bg-surface-container-lowest p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <h3 className="font-headline-md text-primary">
                    {cursor.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changeMonth(-1)}
                    className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high"
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                    className="rounded-md bg-surface-container-high px-3 py-1.5 font-label-md text-on-surface"
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() => changeMonth(1)}
                    className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high"
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {DIA_SEMANA.map((d) => (
                  <div key={d} className="pb-1 text-center font-mono-label text-on-surface-variant">
                    {d}
                  </div>
                ))}
                {calendarCells.map((day, i) => {
                  if (day === null) return <div key={`blank-${i}`} />;
                  const key = dayKey(new Date(cursor.getFullYear(), cursor.getMonth(), day));
                  const dayTasks = tasksByDay.get(key) ?? [];
                  const dayContracts = contractEventsByDay.get(key) ?? [];
                  const shownContracts = dayContracts.slice(0, 2);
                  const shownTasks = dayTasks.slice(0, Math.max(0, 3 - shownContracts.length));
                  const restantes = dayTasks.length + dayContracts.length - shownContracts.length - shownTasks.length;
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      className={`min-h-[68px] rounded-md border p-1 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-surface-container-low"
                          : "border-transparent hover:bg-surface-container-low"
                      } ${isToday ? "ring-1 ring-primary" : ""}`}
                    >
                      <span className={`block px-1 font-mono-label ${isToday ? "text-primary font-bold" : "text-on-surface-variant"}`}>
                        {day}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {shownContracts.map((ev, j) => {
                          const urgente = ev.diasParaVencer !== null && ev.diasParaVencer < 4;
                          const estilo = urgente ? CHIP_URGENTE : CHIP_POR_KIND[ev.kind];
                          return (
                            <div
                              key={`c-${ev.label}-${ev.kind}-${j}`}
                              title={`Contrato ${ev.label} — ${EVENTO_DETALLE[ev.kind]} (${ev.estado})${
                                urgente
                                  ? ev.diasParaVencer !== null && ev.diasParaVencer >= 0
                                    ? ` · vence en ${ev.diasParaVencer} día(s)`
                                    : " · VENCIDO"
                                  : ""
                              }`}
                              className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${estilo}`}
                            >
                              <FileText className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">
                                {EVENTO_LABEL[ev.kind]} · {ev.label}
                                {urgente && ev.diasParaVencer !== null && ev.diasParaVencer >= 0
                                  ? ` (${ev.diasParaVencer}d)`
                                  : urgente
                                    ? " (vencido)"
                                    : ""}
                              </span>
                            </div>
                          );
                        })}
                        {shownTasks.map((t) => (
                          <div
                            key={t.id}
                            title={`${t.titulo} · ${t.asignadoA || "sin asignado"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(t);
                            }}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${ESTADO_CHIP[t.estado]}`}
                          >
                            <span className="truncate">{t.asignadoA ? iniciales(t.asignadoA) : "·"}</span>
                            <span className="truncate">{t.titulo}</span>
                          </div>
                        ))}
                        {restantes > 0 ? (
                          <div className="px-1 text-[10px] font-medium text-on-surface-variant">
                            +{restantes} más
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg bg-surface-container-lowest p-4 shadow-sm">
              <h3 className="font-headline-md text-primary mb-3">Tareas del {fmtFecha(selectedDay)}</h3>
              {tasksOfDay.length === 0 && contractsOfDay.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant">Sin tareas ni contratos para esta fecha.</p>
              ) : null}
              {contractsOfDay.length > 0 ? (
                <ul className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {contractsOfDay.map((ev, j) => {
                    const urgente = ev.diasParaVencer !== null && ev.diasParaVencer < 4;
                    const card = urgente ? CARD_URGENTE : CARD_POR_KIND[ev.kind];
                    const texto = urgente ? TEXT_URGENTE : TEXT_POR_KIND[ev.kind];
                    return (
                      <li
                        key={`${ev.label}-${ev.kind}-${j}`}
                        className={`rounded-md border p-3 shadow-sm ${card}`}
                      >
                        <span className={`flex items-center gap-1 font-label-md ${texto}`}>
                          <FileText className="h-3.5 w-3.5" />
                          {EVENTO_DETALLE[ev.kind]}
                        </span>
                        <p className={`mt-1 font-body-sm ${urgente ? "text-red-900 dark:text-red-100" : "text-on-surface"}`}>
                          {ev.label}
                          {ev.departamento ? ` · Depto ${ev.departamento}` : ""}
                        </p>
                        <p
                          className={`mt-1 font-mono-label ${urgente ? "text-red-700 dark:text-red-300" : "text-on-surface-variant"}`}
                        >
                          Estado: {ev.estado}
                        </p>
                        {urgente ? (
                          <p className="mt-1 font-label-md text-red-600 dark:text-red-300">
                            {ev.diasParaVencer !== null && ev.diasParaVencer >= 0
                              ? `Vence en ${ev.diasParaVencer} ${ev.diasParaVencer === 1 ? "día" : "días"}`
                              : "Contrato vencido"}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {tasksOfDay.length === 0 ? null : (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {tasksOfDay.map((t) => (
                    <li
                      key={t.id}
                      className={`rounded-md border p-3 shadow-sm ${ESTADO_CHIP[t.estado]}`}
                    >
                      <button onClick={() => openEdit(t)} className="text-left hover:underline">
                        <span className="font-label-md">{t.titulo}</span>
                      </button>
                      {t.origenTipo === "CONTRATO" ? (
                        <span className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 font-mono-label text-[9px] text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                          de contrato
                        </span>
                      ) : null}
                      {t.descripcion ? <p className="mt-1 font-body-sm opacity-80">{t.descripcion}</p> : null}
                      <div className="mt-2 flex items-center gap-3 font-mono-label">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {t.asignadoA || "Sin asignado"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtFecha(t.fechaLimite)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Kanban className="h-5 w-5 text-primary" />
                <h3 className="font-headline-md text-primary">Tablero de trabajo</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {COLUMNAS.map((col) => {
                  const items = tasks.filter((t) => t.estado === col.value);
                  const isOver = dragOverCol === col.value;
                  return (
                    <section
                      key={col.value}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverCol(col.value);
                      }}
                      onDragLeave={() => setDragOverCol((c) => (c === col.value ? null : c))}
                      onDrop={() => onDrop(col.value)}
                      className={`flex min-h-[240px] flex-col rounded-lg border bg-surface-container-lowest shadow-sm transition-colors ${
                        isOver ? "border-primary bg-surface-container-low" : "border-outline-variant/40"
                      }`}
                    >
                      <header className="border-b border-outline-variant/40 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-headline-md text-primary">{col.title}</h4>
                          <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-label text-on-surface-variant">
                            {items.length}
                          </span>
                        </div>
                        <p className="mt-1 font-body-sm text-on-surface-variant">{col.hint}</p>
                      </header>
                      <ul className="flex flex-1 flex-col gap-3 p-3">
                        {items.length === 0 ? (
                          <li className="rounded-md border border-dashed border-outline-variant/60 p-4 text-center font-body-sm text-on-surface-variant">
                            Sin tareas aquí.
                          </li>
                        ) : (
                          items.map((t) => (
                            <li
                              key={t.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer?.setData("text/task-id", t.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDragId(t.id);
                              }}
                              onDragEnd={() => {
                                setDragId(null);
                                setDragOverCol(null);
                              }}
                              className={`cursor-grab rounded-md bg-surface-container-low p-3 shadow-sm transition-opacity active:cursor-grabbing ${
                                dragId === t.id ? "opacity-40" : ""
                              }`}
                            >
                              <button
                                onClick={() => openEdit(t)}
                                className="flex w-full items-start justify-between gap-2 text-left"
                              >
                                <span className="font-label-md text-on-surface hover:text-primary">{t.titulo}</span>
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
                              </button>
                              {t.origenTipo === "CONTRATO" ? (
                                <span className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 font-mono-label text-[9px] text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                                  de contrato
                                </span>
                              ) : null}
                              {t.descripcion ? (
                                <p className="mt-1 line-clamp-2 font-body-sm text-on-surface-variant">{t.descripcion}</p>
                              ) : null}
                              <div className="mt-2 flex items-center justify-between font-mono-label text-on-surface-variant">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {t.asignadoA || "Sin asignado"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {fmtFecha(t.fechaLimite)}
                                </span>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <p className="flex items-center gap-2 font-body-sm text-on-surface-variant">
          <Kanban className="h-4 w-4" />
          Arrastra las tarjetas entre columnas para cambiar su estado.
        </p>
      </div>

      {modalOpen ? (
        <Modal title={editing ? "Editar tarea" : "Nueva tarea"} onClose={() => setModalOpen(false)}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block font-label-md text-on-surface">Título *</label>
              <input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none"
                placeholder="Describe la tarea"
              />
            </div>
            <div>
              <label className="mb-1 block font-label-md text-on-surface">Descripción</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none"
                rows={2}
                placeholder="Detalle opcional"
              />
            </div>
            <div>
              <label className="mb-1 block font-label-md text-on-surface">Asignada a</label>
              <input
                value={form.asignadoA}
                onChange={(e) => setForm({ ...form, asignadoA: e.target.value })}
                list="usuarios-sugeridos"
                className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none"
                placeholder="Nombre de la persona"
              />
              <datalist id="usuarios-sugeridos">
                {USUARIOS_SUGERIDOS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Fecha límite *</label>
                <input
                  type="date"
                  value={form.fechaLimite}
                  onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })}
                  className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Estado</label>
                <select
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value as TaskState })}
                  className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none"
                >
                  {ESTADOS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              {editing ? (
                <button
                  onClick={() => void deleteTask(editing.id)}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-md bg-error-container px-3 py-2 font-label-md text-error-container-foreground disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-md bg-surface-container-high px-4 py-2 font-label-md text-on-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void saveTask()}
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground disabled:opacity-40"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </DashboardShell>
  );
}