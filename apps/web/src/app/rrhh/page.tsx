"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  Building2,
  IdCard,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";

type EstadoRh = "ACTIVO" | "INACTIVO" | "SUSPENDIDO" | "VACACIONES" | "PERMISO" | "FINALIZADO";
type EtapaOnboarding = "REGISTRO" | "FICHA" | "DOCUMENTOS" | "VALIDACION" | "CONTRATO" | "ACCESOS" | "ASIGNACION" | "FINALIZADO";

interface OpcionEstructura {
  id: string;
  nombre: string;
  organizationId?: string;
  departmentId?: string;
  direccion?: string;
}

interface EstructuraHR {
  organizations: OpcionEstructura[];
  sites: OpcionEstructura[];
  departments: OpcionEstructura[];
  teams: OpcionEstructura[];
  positions: OpcionEstructura[];
  managers: Array<{ id: string; nombres: string; apellidos: string; estado: string }>;
}

const EMPTY_STRUCTURE: EstructuraHR = { organizations: [], sites: [], departments: [], teams: [], positions: [], managers: [] };
const ETAPAS_ONBOARDING: Array<{ value: EtapaOnboarding; label: string }> = [
  { value: "REGISTRO", label: "Registro" },
  { value: "FICHA", label: "Ficha" },
  { value: "DOCUMENTOS", label: "Documentos" },
  { value: "VALIDACION", label: "Validación" },
  { value: "CONTRATO", label: "Contrato" },
  { value: "ACCESOS", label: "Accesos" },
  { value: "ASIGNACION", label: "Asignación organizacional" },
  { value: "FINALIZADO", label: "Completado" },
];
type TipoEstructura = "department" | "team" | "position";
const TIPOS_ESTRUCTURA: Array<{ value: TipoEstructura; label: string }> = [
  { value: "department", label: "Área / departamento" },
  { value: "team", label: "Equipo" },
  { value: "position", label: "Cargo" },
];

// Listas fijas del formulario: el resto de la estructura (área/cargo) se
// escribe a mano, así que no depende de hr_departments / hr_positions.
const EQUIPOS = ["Mantenimiento", "Administrativo"];
const RESPONSABLES = ["Jefe de Mantenimiento", "Administradora (Emely Carpio)"];

interface Employee {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  email: string;
  telefono: string;
  cargo: string;
  area: string;
  sede: string;
  equipo: string;
  responsable: string;
  organizationId: string | null;
  siteId: string | null;
  departmentId: string | null;
  teamId: string | null;
  positionId: string | null;
  managerId: string | null;
  onboardingStage: EtapaOnboarding;
  fechaIngreso: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string;
  codigoEmpleado: string;
  fechaBaja: string | null;
  estado: EstadoRh;
  direccion: string;
  notas: string;
  documentos: Array<{ nombre: string; tipo: string; url: string }>;
  creadoPor: string;
}

interface EmploymentBrief {
  id: string;
  tipoContrato: string;
  numeroContrato: string;
  fechaInicio: string;
  fechaFin: string | null;
  estado: string;
  salario: string;
  renovacionDeId: string | null;
}

interface EmployeeDocumentBrief {
  id: string;
  tipo: string;
  nombre: string;
  version: number;
  mimeType: string;
  sizeBytes: number;
  venceEn: string | null;
  uploadedBy: string;
  createdAt: string;
}

interface RequestBrief {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeLastName: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  estado: string;
  aprobadoPor: string | null;
  createdAt: string;
}

/** §5 — respuestas de GET /api/rrhh/dashboard. */
interface DashboardRRHH {
  trabajadoresActivos: number;
  incorporaciones30Dias: number;
  contratosActivos: number;
  contratosPorVencer: Array<{ id: string; empleado: string; fechaFin: string | null }>;
  documentosPendientes: number;
  documentosPorVencer: Array<{ id: string; empleado: string; nombre: string; venceEn: string | null }>;
  solicitudesPendientes: number;
  onboardingPendiente: number;
  porDepartamento: Array<{ label: string; count: number }>;
  porEquipo: Array<{ label: string; count: number }>;
  generatedAt: string;
}

/** §13 — respuesta de GET/POST/PATCH /api/rrhh/:id/onboarding. */
interface OnboardingRRHH {
  id: string;
  employeeId: string;
  etapa: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string | null;
  creadoPor: string;
  pasos: Array<{
    id: string;
    clave: string;
    titulo: string;
    descripcion: string;
    orden: number;
    estado: string;
    taskId: string | null;
    responsable: string;
    fechaLimite: string | null;
    completedAt: string | null;
  }>;
}

const ESTADOS: Array<{ value: EstadoRh; label: string; chip: string }> = [
  { value: "ACTIVO", label: "Activo", chip: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  { value: "INACTIVO", label: "Inactivo", chip: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70" },
  { value: "SUSPENDIDO", label: "Suspendido", chip: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200" },
  { value: "VACACIONES", label: "Vacaciones", chip: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200" },
  { value: "PERMISO", label: "Permiso", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  { value: "FINALIZADO", label: "Finalizado", chip: "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-white/70" },
];

function estadoChip(estado: string): string {
  return ESTADOS.find((s) => s.value === estado)?.chip ?? ESTADOS[1]?.chip ?? "";
}
function estadoLabel(estado: string): string {
  return ESTADOS.find((s) => s.value === estado)?.label ?? estado;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const EMPTY = {
  nombres: "",
  apellidos: "",
  dni: "",
  email: "",
  telefono: "",
  cargo: "",
  area: "",
  equipo: "",
  responsable: "",
  departmentId: "",
  teamId: "",
  positionId: "",
  managerId: "",
  onboardingStage: "REGISTRO" as EtapaOnboarding,
  fechaIngreso: "",
  fechaNacimiento: "",
  nacionalidad: "",
  codigoEmpleado: "",
  fechaBaja: "",
  estado: "ACTIVO" as EstadoRh,
  direccion: "",
  notas: "",
};

export default function RecursosHumanosPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [estructura, setEstructura] = useState<EstructuraHR>(EMPTY_STRUCTURE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<Array<{ id: string; actor: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [structureType, setStructureType] = useState<TipoEstructura>("department");
  const [structureName, setStructureName] = useState("");
  const [structureParentId, setStructureParentId] = useState("");
  const [structureSaving, setStructureSaving] = useState(false);
  const [employmentRows, setEmploymentRows] = useState<EmploymentBrief[]>([]);
  const [employeeDocuments, setEmployeeDocuments] = useState<EmployeeDocumentBrief[]>([]);
  const [requests, setRequests] = useState<RequestBrief[]>([]);
  const [dashboard, setDashboard] = useState<DashboardRRHH | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingRRHH | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [employmentForm, setEmploymentForm] = useState({ tipoContrato: "INDEFINIDO", numeroContrato: "", fechaInicio: "", fechaFin: "", salario: "" });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentForm, setDocumentForm] = useState({ tipo: "CONTRATO", fechaDocumento: "", venceEn: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, resEstructura] = await Promise.all([
        apiFetch("/api/rrhh"),
        apiFetch("/api/rrhh/estructura"),
      ]);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setRows((await res.json()) as Employee[]);
      if (resEstructura.ok) setEstructura((await resEstructura.json()) as EstructuraHR);
      const resSolicitudes = await apiFetch("/api/rrhh/solicitudes");
      if (resSolicitudes.ok) setRequests((await resSolicitudes.json()) as RequestBrief[]);
      const resDashboard = await apiFetch("/api/rrhh/dashboard");
      if (resDashboard.ok) setDashboard((await resDashboard.json()) as DashboardRRHH);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.nombres, r.apellidos, r.dni, r.email, r.cargo, r.area].join(" ").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const metricas = useMemo(() => {
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    const porArea = new Map<string, number>();
    for (const row of rows) {
      const area = row.area.trim() || "Sin área";
      porArea.set(area, (porArea.get(area) ?? 0) + 1);
    }
    return {
      activos: rows.filter((row) => row.estado === "ACTIVO").length,
      ingresosRecientes: rows.filter((row) => row.fechaIngreso && new Date(row.fechaIngreso) >= hace30Dias).length,
      expedientesIncompletos: rows.filter((row) => !row.documentos?.length).length,
      ausencias: rows.filter((row) => row.estado === "VACACIONES" || row.estado === "PERMISO").length,
      areas: [...porArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [rows]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOnboarding(null);
    setModalOpen(true);
  }
  function openEdit(r: Employee) {
    setEditing(r);
    setForm({
      nombres: r.nombres,
      apellidos: r.apellidos,
      dni: r.dni,
      email: r.email,
      telefono: r.telefono,
      cargo: r.cargo,
      area: r.area,
      equipo: r.equipo,
      responsable: r.responsable,
      departmentId: r.departmentId ?? "",
      teamId: r.teamId ?? "",
      positionId: r.positionId ?? "",
      managerId: r.managerId ?? "",
      onboardingStage: r.onboardingStage ?? "REGISTRO",
      fechaIngreso: r.fechaIngreso ? r.fechaIngreso.slice(0, 10) : "",
      fechaNacimiento: r.fechaNacimiento ? r.fechaNacimiento.slice(0, 10) : "",
      nacionalidad: r.nacionalidad ?? "",
      codigoEmpleado: r.codigoEmpleado ?? "",
      fechaBaja: r.fechaBaja ? r.fechaBaja.slice(0, 10) : "",
      estado: r.estado,
      direccion: r.direccion,
      notas: r.notas,
    });
    setModalOpen(true);
    void loadEmployeeRecords(r.id);
  }

  async function loadEmployeeRecords(id: string) {
    try {
      const [employmentResponse, documentResponse, onboardingResponse] = await Promise.all([
        apiFetch(`/api/rrhh/${id}/empleos`),
        apiFetch(`/api/rrhh/${id}/documentos`),
        apiFetch(`/api/rrhh/${id}/onboarding`),
      ]);
      if (employmentResponse.ok) setEmploymentRows((await employmentResponse.json()) as EmploymentBrief[]);
      if (documentResponse.ok) setEmployeeDocuments((await documentResponse.json()) as EmployeeDocumentBrief[]);
      setOnboarding(onboardingResponse.ok ? ((await onboardingResponse.json()) as OnboardingRRHH | null) : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar el expediente relacionado");
    }
  }

  async function openHistory(employee: Employee) {
    setHistoryLoading(true);
    setHistoryOpen(true);
    try {
      const response = await apiFetch(`/api/rrhh?history=${encodeURIComponent(employee.id)}`);
      if (!response.ok) throw new Error("No se pudo cargar el historial");
      setHistoryRows(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar el historial");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function createStructureOption() {
    setStructureSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = { tipo: structureType, nombre: structureName.trim() };
      if (structureType === "team") payload.departmentId = structureParentId;
      const response = await apiFetch("/api/rrhh/estructura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la opción");
      }
      setStructureName("");
      setStructureModalOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la opción");
    } finally {
      setStructureSaving(false);
    }
  }

  async function createEmployment() {
    if (!editing || !employmentForm.fechaInicio) return;
    setSaving(true);
    try {
      const active = employmentRows.find((row) => row.estado === "ACTIVO");
      const response = await apiFetch(`/api/rrhh/${editing.id}/empleos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...employmentForm, fechaInicio: `${employmentForm.fechaInicio}T00:00:00`, fechaFin: employmentForm.fechaFin ? `${employmentForm.fechaFin}T23:59:59` : null, renovacionDeId: active?.id ?? null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la relación laboral");
      }
      setEmploymentForm({ tipoContrato: "INDEFINIDO", numeroContrato: "", fechaInicio: "", fechaFin: "", salario: "" });
      await loadEmployeeRecords(editing.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la relación laboral");
    } finally {
      setSaving(false);
    }
  }

  async function iniciarOnboarding() {
    if (!editing) return;
    setOnboardingLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/rrhh/${editing.id}/onboarding`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo iniciar el onboarding");
      }
      setOnboarding((await response.json()) as OnboardingRRHH);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar el onboarding");
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function alternarPaso(clave: string, completada: boolean) {
    if (!editing) return;
    setOnboardingLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/rrhh/${editing.id}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, completada }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo actualizar el paso");
      }
      const payload = (await response.json()) as OnboardingRRHH;
      setOnboarding(payload);
      setForm((current) => ({ ...current, onboardingStage: payload.etapa as EtapaOnboarding }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar el paso");
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function uploadEmployeeDocument() {
    if (!editing || !documentFile) return;
    setSaving(true);
    try {
      const payload = new FormData();
      payload.set("file", documentFile);
      payload.set("tipo", documentForm.tipo);
      if (documentForm.fechaDocumento) payload.set("fechaDocumento", `${documentForm.fechaDocumento}T00:00:00`);
      if (documentForm.venceEn) payload.set("venceEn", `${documentForm.venceEn}T23:59:59`);
      const response = await apiFetch(`/api/rrhh/${editing.id}/documentos`, { method: "POST", body: payload });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo subir el documento");
      }
      setDocumentFile(null);
      const input = document.getElementById("hr-document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadEmployeeRecords(editing.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir el documento");
    } finally {
      setSaving(false);
    }
  }

  async function descargarDocumento(documento: EmployeeDocumentBrief) {
    if (!editing) return;
    try {
      const response = await apiFetch(`/api/rrhh/${editing.id}/documentos/${documento.id}`);
      if (!response.ok) throw new Error("No se pudo descargar el documento");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = documento.nombre;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo descargar el documento");
    }
  }

  async function responderSolicitud(request: RequestBrief, estado: "APROBADA" | "RECHAZADA") {
    const respuesta = window.prompt(estado === "APROBADA" ? "Observación de aprobación (opcional)" : "Motivo de rechazo");
    if (respuesta === null) return;
    try {
      const response = await apiFetch(`/api/rrhh/solicitudes/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, respuesta }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo responder la solicitud");
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo responder la solicitud");
    }
  }

  async function save() {
    if (!form.nombres.trim()) {
      setError("Indica los nombres del colaborador");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/rrhh", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing?.id,
          ...form,
          fechaIngreso: form.fechaIngreso ? `${form.fechaIngreso}T00:00:00` : undefined,
          fechaNacimiento: form.fechaNacimiento ? `${form.fechaNacimiento}T00:00:00` : undefined,
          fechaBaja: form.fechaBaja ? `${form.fechaBaja}T00:00:00` : undefined,
        }),
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

  async function remove(id: string) {
    if (!window.confirm("El expediente se archivará como finalizado y se conservará su historial. ¿Continuar?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/rrhh?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Recursos Humanos</h2>
            <p className="font-body-sm text-on-surface-variant">
              Expedientes del personal · {rows.length} colaboradores
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStructureModalOpen(true)} className="flex items-center gap-2 rounded-md border border-outline-variant px-3 py-2 font-label-md text-on-surface hover:bg-surface-container-low">
              <Building2 className="h-4 w-4" /> Estructura
            </button>
            <button onClick={() => void load()} className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface hover:bg-surface-variant">
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              Nuevo expediente
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : null}

        {requests.some((request) => request.estado === "PENDIENTE") ? (
          <section className="border-y border-outline-variant py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-label-lg text-on-surface">Solicitudes por revisar</h3>
              <span className="font-mono-label text-on-surface-variant">{requests.filter((request) => request.estado === "PENDIENTE").length}</span>
            </div>
            <ul className="divide-y divide-outline-variant">
              {requests.filter((request) => request.estado === "PENDIENTE").map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-on-surface">{request.employeeName} {request.employeeLastName} · {request.tipo}</p>
                    <p className="text-sm text-on-surface-variant">{fmtFecha(request.fechaInicio)} a {fmtFecha(request.fechaFin)} · {request.motivo}</p>
                  </div>
                  <button type="button" onClick={() => void responderSolicitud(request, "RECHAZADA")} className="rounded-md border border-outline-variant px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-low">Rechazar</button>
                  <button type="button" onClick={() => void responderSolicitud(request, "APROBADA")} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Aprobar</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, DNI, correo, cargo o área…"
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-3 font-body-md text-on-surface focus:border-primary focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ESTADOS.map((estado) => (
            <div key={estado.value} className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5">
              <p className="text-xs text-on-surface-variant">{estado.label}</p>
              <p className="mt-1 font-headline-sm text-on-surface">{rows.filter((row) => row.estado === estado.value).length}</p>
            </div>
          ))}
        </div>

        <section aria-label="Indicadores de personal" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Personal activo", value: metricas.activos },
            { label: "Ingresos últimos 30 días", value: metricas.ingresosRecientes },
            { label: "Sin documentos registrados", value: metricas.expedientesIncompletos },
            { label: "Vacaciones y permisos", value: metricas.ausencias },
          ].map((item) => (
            <div key={item.label} className="border-l-2 border-primary px-3 py-2">
              <p className="text-xs text-on-surface-variant">{item.label}</p>
              <p className="mt-1 font-headline-md text-on-surface">{item.value}</p>
            </div>
          ))}
        </section>

        {dashboard ? (
          <section aria-label="Indicadores operativos de RRHH" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "Contratos activos", value: dashboard.contratosActivos },
              { label: "Contratos por vencer (30 d)", value: dashboard.contratosPorVencer.length },
              { label: "Documentación vencida", value: dashboard.documentosPendientes },
              { label: "Solicitudes por aprobar", value: dashboard.solicitudesPendientes },
              { label: "Onboarding en curso", value: dashboard.onboardingPendiente },
            ].map((item) => (
              <div key={item.label} className="border-l-2 border-primary px-3 py-2">
                <p className="text-xs text-on-surface-variant">{item.label}</p>
                <p className="mt-1 font-headline-md text-on-surface">{item.value}</p>
              </div>
            ))}
          </section>
        ) : null}

        {dashboard && (dashboard.contratosPorVencer.length > 0 || dashboard.documentosPorVencer.length > 0) ? (
          <section aria-label="Alertas de vencimiento" className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
            <h3 className="mb-3 font-label-lg text-on-surface">Alertas</h3>
            <ul className="space-y-2">
              {dashboard.contratosPorVencer.slice(0, 5).map((item) => (
                <li key={`c-${item.id}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-on-surface-variant">
                    Vence relación laboral · {item.empleado || "Sin nombre"}
                  </span>
                  <span className="shrink-0 font-mono-label text-on-surface">{fmtFecha(item.fechaFin)}</span>
                </li>
              ))}
              {dashboard.documentosPorVencer.slice(0, 5).map((item) => (
                <li key={`d-${item.id}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-on-surface-variant">
                    {item.nombre || "Documento"} · {item.empleado || "Sin nombre"}
                  </span>
                  <span className="shrink-0 font-mono-label text-on-surface">{fmtFecha(item.venceEn)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {metricas.areas.length > 0 ? (
          <section className="border-t border-outline-variant pt-4">
            <h3 className="mb-3 font-label-lg text-on-surface">Distribución por área</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {metricas.areas.map(([area, total]) => (
                <div key={area} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-on-surface-variant">{area}</span>
                  <span className="font-mono-label text-on-surface">{total}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando expedientes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center shadow-sm">
            <Users className="mx-auto mb-3 h-10 w-10 text-on-surface-variant" />
            <p className="font-body-md text-on-surface">
              {rows.length === 0 ? "Aún no hay expedientes. Crea el primero." : "Sin resultados para tu búsqueda."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <article key={r.id} className="flex flex-col overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm transition-shadow hover:shadow-md">
              <button
                type="button"
                onClick={() => openEdit(r)}
                className="flex flex-1 flex-col p-4 text-left"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-headline-md text-primary">
                      {(r.nombres[0] ?? "").toUpperCase()}{(r.apellidos[0] ?? "").toUpperCase()}
                    </span>
                    <div>
                      <p className="font-label-md text-on-surface">{r.nombres} {r.apellidos}</p>
                      <p className="font-body-sm text-on-surface-variant">{r.cargo || "Sin cargo"}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono-label ${estadoChip(r.estado)}`}>
                    {estadoLabel(r.estado)}
                  </span>
                </div>
                <div className="space-y-1 font-mono-label text-on-surface-variant">
                  {r.area ? <p className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {r.area}</p> : null}
                  {r.equipo ? <p className="flex items-center gap-1"><Users className="h-3 w-3" /> {r.equipo}</p> : null}
                  {r.responsable ? <p className="flex items-center gap-1"><User className="h-3 w-3" /> Responsable: {r.responsable}</p> : null}
                  {r.dni ? <p className="flex items-center gap-1"><IdCard className="h-3 w-3" /> {r.dni}</p> : null}
                  {r.email ? <p className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" /> {r.email}</p> : null}
                  {r.telefono ? <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {r.telefono}</p> : null}
                  <p className="flex items-center gap-1"><User className="h-3 w-3" /> Ingreso: {fmtFecha(r.fechaIngreso)}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => void openHistory(r)}
                className="border-t border-outline-variant px-4 py-2 text-left text-xs font-medium text-primary hover:bg-surface-container-low hover:underline"
              >
                Ver historial de cambios
              </button>
              </article>
            ))}
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-surface-container-low p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline-md text-primary">{editing ? "Editar expediente" : "Nuevo expediente"}</h3>
              {editing ? (
                <button type="button" onClick={() => void openHistory(editing)} className="ml-auto mr-3 text-xs font-medium text-primary hover:underline">
                  Historial
                </button>
              ) : null}
              <button onClick={() => setModalOpen(false)} className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombres *" value={form.nombres} onChange={(v) => setForm({ ...form, nombres: v })} />
                <Field label="Apellidos" value={form.apellidos} onChange={(v) => setForm({ ...form, apellidos: v })} />
                <Field label="DNI" value={form.dni} onChange={(v) => setForm({ ...form, dni: v })} />
                <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
                <Field label="Correo" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Área / departamento</label>
                  <input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value, departmentId: "" })} placeholder="Escribe el área" className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Equipo</label>
                  <select value={form.equipo} onChange={(event) => setForm({ ...form, equipo: event.target.value, teamId: "" })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface">
                    <option value="">Sin equipo</option>{EQUIPOS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Cargo / posición</label>
                  <input value={form.cargo} onChange={(event) => setForm({ ...form, cargo: event.target.value, positionId: "" })} placeholder="Escribe el cargo" className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Responsable directo</label>
                  <select value={form.responsable} onChange={(event) => setForm({ ...form, responsable: event.target.value, managerId: "" })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface">
                    <option value="">Sin responsable</option>{RESPONSABLES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Fecha de ingreso</label>
                  <input type="date" value={form.fechaIngreso} onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Código de empleado</label>
                  <input value={form.codigoEmpleado} onChange={(e) => setForm({ ...form, codigoEmpleado: e.target.value })} placeholder="Automático si queda vacío" className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Nacionalidad</label>
                  <input value={form.nacionalidad} onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })} placeholder="Peruana" className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Fecha de nacimiento</label>
                  <input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                {editing ? (
                  <div>
                    <label className="mb-1 block font-label-md text-on-surface">Fecha de baja</label>
                    <input type="date" value={form.fechaBaja} onChange={(e) => setForm({ ...form, fechaBaja: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                  </div>
                ) : <div />}
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Estado</label>
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoRh })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none">
                    {ESTADOS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block font-label-md text-on-surface">Etapa de onboarding</label>
                  <select value={form.onboardingStage} onChange={(event) => setForm({ ...form, onboardingStage: event.target.value as EtapaOnboarding })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface">
                    {ETAPAS_ONBOARDING.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Dirección</label>
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Notas del expediente</label>
                <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
              </div>
              {editing ? (
                <div className="space-y-4 border-t border-outline-variant pt-4">
                  <section>
                    <h4 className="mb-2 font-label-lg text-on-surface">Relación laboral</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={employmentForm.tipoContrato} onChange={(event) => setEmploymentForm({ ...employmentForm, tipoContrato: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface">
                        <option value="INDEFINIDO">Indefinido</option><option value="PLAZO_FIJO">Plazo fijo</option><option value="TEMPORAL">Temporal</option><option value="LOCACION">Locación de servicios</option><option value="PRACTICAS">Prácticas</option>
                      </select>
                      <input aria-label="Número de contrato laboral" placeholder="N.º de contrato" value={employmentForm.numeroContrato} onChange={(event) => setEmploymentForm({ ...employmentForm, numeroContrato: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface" />
                      <input aria-label="Inicio de contrato laboral" type="date" value={employmentForm.fechaInicio} onChange={(event) => setEmploymentForm({ ...employmentForm, fechaInicio: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface" />
                      <input aria-label="Fin de contrato laboral" type="date" value={employmentForm.fechaFin} onChange={(event) => setEmploymentForm({ ...employmentForm, fechaFin: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface" />
                      <input aria-label="Salario" placeholder="Salario acordado" value={employmentForm.salario} onChange={(event) => setEmploymentForm({ ...employmentForm, salario: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface" />
                      <button type="button" disabled={!employmentForm.fechaInicio || saving} onClick={() => void createEmployment()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{employmentRows.some((item) => item.estado === "ACTIVO") ? "Registrar renovación" : "Registrar contrato"}</button>
                    </div>
                    {employmentRows.length ? <ul className="mt-3 divide-y divide-outline-variant">{employmentRows.map((employment) => <li key={employment.id} className="flex justify-between gap-2 py-2 text-xs"><span className="text-on-surface">{employment.tipoContrato} · {employment.numeroContrato || "Sin número"} · {fmtFecha(employment.fechaInicio)}–{fmtFecha(employment.fechaFin)}</span><span className="text-on-surface-variant">{employment.estado}</span></li>)}</ul> : <p className="mt-2 text-xs text-on-surface-variant">Sin contratos laborales registrados.</p>}
                  </section>

                  <section className="border-t border-outline-variant pt-4">
                    <h4 className="mb-2 font-label-lg text-on-surface">Expediente documental privado</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={documentForm.tipo} onChange={(event) => setDocumentForm({ ...documentForm, tipo: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface">
                        <option value="CONTRATO">Contrato</option><option value="ANEXO">Anexo</option><option value="IDENTIDAD">Documento personal</option><option value="CERTIFICADO">Certificado</option><option value="ADMINISTRATIVO">Administrativo</option><option value="ONBOARDING">Incorporación</option>
                      </select>
                      <input aria-label="Archivo HR" id="hr-document-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} className="min-w-0 text-xs text-on-surface" />
                      <input aria-label="Fecha del documento" type="date" value={documentForm.fechaDocumento} onChange={(event) => setDocumentForm({ ...documentForm, fechaDocumento: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface" />
                      <input aria-label="Vencimiento del documento" type="date" value={documentForm.venceEn} onChange={(event) => setDocumentForm({ ...documentForm, venceEn: event.target.value })} className="rounded-md border border-outline-variant bg-surface p-2 text-sm text-on-surface" />
                      <button type="button" disabled={!documentFile || saving} onClick={() => void uploadEmployeeDocument()} className="col-span-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Subiendo…" : "Subir nueva versión"}</button>
                    </div>
                    {employeeDocuments.length ? <ul className="mt-3 divide-y divide-outline-variant">{employeeDocuments.map((doc) => <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="min-w-0 text-on-surface">{doc.tipo} · {doc.nombre} · v{doc.version}{doc.venceEn ? ` · vence ${fmtFecha(doc.venceEn)}` : ""}</span><button type="button" onClick={() => void descargarDocumento(doc)} className="shrink-0 font-medium text-primary hover:underline">Descargar</button></li>)}</ul> : <p className="mt-2 text-xs text-on-surface-variant">Sin documentos privados registrados.</p>}
                  </section>

                  <section className="border-t border-outline-variant pt-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="font-label-lg text-on-surface">Onboarding</h4>
                      {onboarding ? (
                        <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-label text-on-surface-variant">
                          {onboarding.pasos.filter((paso) => paso.estado === "RESUELTA").length}/{onboarding.pasos.length} · {onboarding.etapa}
                        </span>
                      ) : null}
                    </div>
                    {!onboarding ? (
                      <button type="button" disabled={onboardingLoading} onClick={() => void iniciarOnboarding()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                        {onboardingLoading ? "Iniciando…" : "Iniciar incorporación"}
                      </button>
                    ) : (
                      <ul className="divide-y divide-outline-variant">
                        {onboarding.pasos.map((paso) => {
                          const hecha = paso.estado === "RESUELTA";
                          return (
                            <li key={paso.id} className="flex items-start gap-2 py-2 text-xs">
                              <input
                                type="checkbox"
                                checked={hecha}
                                disabled={onboardingLoading}
                                onChange={(event) => void alternarPaso(paso.clave, event.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                              />
                              <span className="min-w-0">
                                <span className={hecha ? "text-on-surface line-through" : "text-on-surface"}>{paso.titulo}</span>
                                <span className="block text-on-surface-variant">{paso.descripcion}</span>
                                {hecha && paso.completedAt ? <span className="block text-on-surface-variant">Hecho {fmtFecha(paso.completedAt)}</span> : null}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 pt-2">
                {editing ? (
                  <button onClick={() => void remove(editing.id)} disabled={saving} className="flex items-center gap-2 rounded-md bg-error-container px-3 py-2 font-label-md text-error-container-foreground disabled:opacity-40">
                    <Trash2 className="h-4 w-4" />
                    Archivar expediente
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => setModalOpen(false)} className="rounded-md bg-surface-container-high px-4 py-2 font-label-md text-on-surface">Cancelar</button>
                  <button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground disabled:opacity-40">
                    <Pencil className="h-4 w-4" />
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setHistoryOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="rrhh-history-title" className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-surface-container-lowest shadow-xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-outline-variant p-4">
              <h3 id="rrhh-history-title" className="font-headline-md text-on-surface">Historial del expediente</h3>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Cerrar historial" className="rounded p-1 text-on-surface-variant hover:bg-surface-container-high"><X className="h-4 w-4" /></button>
            </header>
            <div className="max-h-[65vh] overflow-y-auto p-4">
              {historyLoading ? (
                <p className="py-8 text-center text-sm text-on-surface-variant">Cargando historial…</p>
              ) : historyRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-on-surface-variant">No hay cambios registrados.</p>
              ) : (
                <ul className="divide-y divide-outline-variant">
                  {historyRows.map((item) => (
                    <li key={item.id} className="py-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-label-md text-on-surface">{item.action}</span>
                        <time className="text-xs text-on-surface-variant">{new Date(item.createdAt).toLocaleString("es-PE")}</time>
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">Por {item.actor}</p>
                      {item.after ? (
                        <ul className="mt-2 space-y-1 text-xs text-on-surface-variant">
                          {Object.keys(item.after)
                            .filter((campo) => JSON.stringify(item.before?.[campo] ?? null) !== JSON.stringify(item.after?.[campo] ?? null))
                            .map((campo) => (
                              <li key={campo}>
                                <span className="font-medium text-on-surface">{campo}:</span>{" "}
                                {item.before?.[campo] == null ? "—" : String(item.before[campo])}
                                {" → "}
                                {item.after?.[campo] == null ? "—" : String(item.after[campo])}
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {structureModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setStructureModalOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="hr-structure-title" className="w-full max-w-md rounded-lg bg-surface-container-lowest p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 id="hr-structure-title" className="font-headline-md text-on-surface">Agregar a la estructura</h3>
              <button type="button" onClick={() => setStructureModalOpen(false)} aria-label="Cerrar" className="rounded p-1 text-on-surface-variant hover:bg-surface-container-high"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-on-surface">Tipo
                <select value={structureType} onChange={(event) => { setStructureType(event.target.value as TipoEstructura); setStructureParentId(""); }} className="mt-1 w-full rounded-md border border-outline-variant bg-surface p-2">
                  {TIPOS_ESTRUCTURA.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              {structureType === "team" ? (
                <label className="block text-sm font-medium text-on-surface">Área
                  <select value={structureParentId} onChange={(event) => setStructureParentId(event.target.value)} className="mt-1 w-full rounded-md border border-outline-variant bg-surface p-2">
                    <option value="">Selecciona…</option>
                    {estructura.departments.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                  </select>
                </label>
              ) : null}
              <Field label="Nombre" value={structureName} onChange={setStructureName} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setStructureModalOpen(false)} className="rounded-md bg-surface-container-high px-3 py-2 text-sm text-on-surface">Cancelar</button>
                <button type="button" disabled={!structureName.trim() || structureSaving || (structureType === "team" && !structureParentId)} onClick={() => void createStructureOption()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{structureSaving ? "Guardando…" : "Agregar"}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block font-label-md text-on-surface">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
    </div>
  );
}