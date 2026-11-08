"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";
import type { LocalModule } from "@/lib/locales-records";
import {
  LocalDocumentsModal,
  type LocalDocumentOwner,
} from "@/components/locales/local-documents-modal";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, RefreshCw, X } from "lucide-react";

type LocalRecord = {
  id: string;
  codigo: string;
  sede: string;
  nombre: string;
  precioAlquiler?: string;
  garantia?: string;
  mantenimiento?: string;
};
type LocalTemplateOption = {
  id: string;
  version: number;
  label: string;
};

type DataRow = Record<string, string | number | boolean | null> & {
  id: string;
  localId: string;
};

type FieldType = "text" | "email" | "tel" | "date" | "number" | "textarea" | "select" | "checkbox";
type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
};

type ModuleConfig = {
  title: string;
  description: string;
  singular: string;
  fields: FieldConfig[];
  columns: { name: string; label: string; format?: "money" | "reference" | "date" }[];
  references: Partial<Record<"contactos" | "separaciones" | "contratos", string>>;
};

const STATUS_SEPARATION = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "CONFIRMADA", label: "Confirmada" },
  { value: "CANCELADA", label: "Cancelada" },
];
const TYPE_SEPARATION = [
  { value: "500", label: "S/ 500" },
  { value: "TOTAL", label: "Total del alquiler" },
  { value: "FLUCTUANTE", label: "Monto personalizado" },
];
const STATUS_CONTRACT = [
  { value: "BORRADOR", label: "Borrador" },
  { value: "EMITIDO", label: "Emitido (pendiente de documentos)" },
  { value: "NOTARIADO_FIRMADO", label: "Notariado y firmado" },
  { value: "VIGENTE", label: "Vigente" },
  { value: "FINALIZADO", label: "Finalizado" },
  { value: "ANULADO", label: "Anulado" },
];
const STATUS_ANNEX = [
  { value: "BORRADOR", label: "Borrador" },
  { value: "EMITIDA", label: "Emitida" },
  { value: "NOTARIADA_FIRMADA", label: "Notariada y firmada" },
  { value: "VIGENTE", label: "Vigente" },
  { value: "ANULADA", label: "Anulada" },
];

function estadoLabel(value: string) {
  if (value === "VENCIDA") return "Vencida";
  if (value === "PERDIDA") return "Vencida · separación perdida";
  return [...STATUS_SEPARATION, ...STATUS_CONTRACT, ...STATUS_ANNEX]
    .find((status) => status.value === value)?.label ?? value;
}

function separationNotExpired(record: DataRow) {
  const deadline = new Date(String(record.fechaLimiteManual ?? "")).getTime();
  return Number.isFinite(deadline) && Date.now() <= deadline;
}

const MODULES: Record<LocalModule, ModuleConfig> = {
  contactos: {
    title: "Contactos de Locales",
    description: "Contactos independientes, asociados solo al local seleccionado.",
    singular: "contacto",
    fields: [
      { name: "nombres", label: "Nombres", type: "text", required: true },
      { name: "apellidos", label: "Apellidos", type: "text" },
      { name: "documento", label: "Documento", type: "text" },
      { name: "telefono", label: "Teléfono", type: "tel" },
      { name: "email", label: "Correo electrónico", type: "email" },
    ],
    columns: [
      { name: "nombres", label: "Nombres" },
      { name: "apellidos", label: "Apellidos" },
      { name: "documento", label: "Documento" },
      { name: "telefono", label: "Teléfono" },
      { name: "email", label: "Correo" },
    ],
    references: {},
  },
  separaciones: {
    title: "Separaciones de Locales",
    description: "Registra separaciones vinculadas a contactos de este local.",
    singular: "separación",
    fields: [
      { name: "contactId", label: "Contacto", type: "select", required: true },
      { name: "tipoSeparacion", label: "Tipo de separación", type: "select", required: true, options: TYPE_SEPARATION },
      { name: "monto", label: "Monto (S/)", type: "number", required: true },
      { name: "diasTiempo", label: "Tiempo restante (días)", type: "number", required: true },
      { name: "estado", label: "Estado", type: "select", required: true, options: STATUS_SEPARATION },
      { name: "fecha", label: "Fecha", type: "date", required: true },
      { name: "observaciones", label: "Observaciones", type: "textarea" },
    ],
    columns: [
      { name: "contactId", label: "Contacto", format: "reference" },
      { name: "tipoSeparacion", label: "Tipo" },
      { name: "monto", label: "Monto", format: "money" },
      { name: "estadoVista", label: "Estado" },
      { name: "fecha", label: "Fecha" },
      { name: "diasTiempo", label: "Días" },
      { name: "fechaLimiteManual", label: "Fecha límite", format: "date" },
      { name: "garantiaExtendida", label: "Extensión" },
    ],
    references: { contactos: "contactId" },
  },
  contratos: {
    title: "Contratos de Locales",
    description: "Emite contratos para este local y completa la garantía, la primera mensualidad y el contrato firmado.",
    singular: "contrato",
    fields: [
      { name: "codigo", label: "Código del contrato", type: "text", required: true },
      { name: "plantillaVersionId", label: "Plantilla de contrato", type: "select", required: true },
      { name: "contactId", label: "Contacto", type: "select", required: true },
      { name: "separationId", label: "Separación vinculada (opcional)", type: "select" },
      { name: "montoCanon", label: "Canon mensual (S/)", type: "number", required: true },
      { name: "depositoGarantia", label: "Garantía (S/)", type: "number", required: true },
      { name: "mantenimiento", label: "Mantenimiento mensual (S/)", type: "number", required: true },
      { name: "fechaInicio", label: "Fecha de inicio", type: "date", required: true },
      { name: "fechaFin", label: "Fecha de fin", type: "date", required: true },
      { name: "estado", label: "Estado", type: "select", required: true, options: [STATUS_CONTRACT[0]!] },
    ],
    columns: [
      { name: "codigo", label: "Código" },
      { name: "contactId", label: "Contacto", format: "reference" },
      { name: "montoCanon", label: "Canon", format: "money" },
      { name: "depositoGarantia", label: "Garantía", format: "money" },
      { name: "fechaInicio", label: "Inicio" },
      { name: "fechaFin", label: "Fin" },
      { name: "estado", label: "Estado" },
    ],
    references: { contactos: "contactId", separaciones: "separationId" },
  },
  adendas: {
    title: "Adendas de Locales",
    description: "Adendas vinculadas únicamente a contratos del mismo local.",
    singular: "adenda",
    fields: [
      { name: "contractId", label: "Contrato", type: "select", required: true },
      { name: "numero", label: "Número de adenda", type: "text", required: true },
      {
        name: "tipoAdenda",
        label: "Tipo",
        type: "select",
        required: true,
        options: [
          { value: "ADENDA", label: "Adenda" },
          { value: "ADENDA_EXTENSION", label: "Extensión" },
        ],
      },
      { name: "descripcion", label: "Descripción", type: "textarea", required: true },
      { name: "fecha", label: "Fecha", type: "date", required: true },
      { name: "fechaFin", label: "Nueva fecha de fin (extensión)", type: "date" },
      { name: "montoCanon", label: "Nuevo canon mensual (S/)", type: "number" },
      { name: "estado", label: "Estado", type: "select", required: true, options: [STATUS_ANNEX[0]!] },
    ],
    columns: [
      { name: "numero", label: "Adenda" },
      { name: "contractId", label: "Contrato", format: "reference" },
      { name: "fecha", label: "Fecha" },
      { name: "estado", label: "Estado" },
      { name: "descripcion", label: "Descripción" },
    ],
    references: { contratos: "contractId" },
  },
  servicios: {
    title: "Servicios de Locales",
    description: "Servicios y cargos propios de cada local.",
    singular: "servicio",
    fields: [
      { name: "nombre", label: "Nombre", type: "text", required: true },
      { name: "descripcion", label: "Descripción", type: "textarea" },
      { name: "monto", label: "Monto (S/)", type: "number", required: true },
      {
        name: "frecuencia",
        label: "Frecuencia",
        type: "select",
        required: true,
        options: [
          { value: "UNICO", label: "Único" },
          { value: "MENSUAL", label: "Mensual" },
          { value: "ANUAL", label: "Anual" },
        ],
      },
      { name: "activo", label: "Activo", type: "checkbox" },
    ],
    columns: [
      { name: "nombre", label: "Servicio" },
      { name: "monto", label: "Monto", format: "money" },
      { name: "frecuencia", label: "Frecuencia" },
      { name: "activo", label: "Estado" },
    ],
    references: {},
  },
};

function emptyForm(config: ModuleConfig): Record<string, string | boolean> {
  return Object.fromEntries(
    config.fields.map((field) => [
      field.name,
      field.type === "checkbox"
        ? true
        : field.options?.[0]?.value ?? "",
    ]),
  );
}

function recordLabel(type: "contactos" | "separaciones" | "contratos", row: DataRow) {
  if (type === "contactos") {
    return [row.nombres, row.apellidos, row.documento].filter(Boolean).join(" ");
  }
  if (type === "contratos") return String(row.codigo ?? "");
  return `${row.fecha ?? ""} · ${row.estado ?? ""}`;
}

function formatCell(value: string | number | boolean | null | undefined, format?: "money" | "date") {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "money") {
    return `S/ ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf())
      ? "—"
      : date.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
  }
  if (typeof value === "boolean") return value ? "Activo" : "Inactivo";
  return String(value);
}

export function LocalModulePage({ module }: { module: LocalModule }) {
  const config = MODULES[module];
  const [locales, setLocales] = useState<LocalRecord[]>([]);
  const [localId, setLocalId] = useState("");
  const [records, setRecords] = useState<DataRow[]>([]);
  const [references, setReferences] = useState<Partial<Record<"contactos" | "separaciones" | "contratos", DataRow[]>>>({});
  const [templates, setTemplates] = useState<LocalTemplateOption[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [editing, setEditing] = useState<DataRow | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<{
    ownerType: LocalDocumentOwner;
    ownerId: string;
    action: "completar" | "extender";
    requiredDocuments: { tipo: string; label: string }[];
  } | null>(null);
  const limit = 50;

  const local = useMemo(() => locales.find((item) => item.id === localId), [localId, locales]);

  useEffect(() => {
    let active = true;
    void apiFetch("/api/locales")
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? "No se pudieron cargar los locales.");
        }
        return (await response.json()) as LocalRecord[];
      })
      .then((items) => {
        if (!active) return;
        setLocales(items);
        setLocalId((current) =>
          items.some((item) => item.id === current)
            ? current
            : items[0]?.id ?? "",
        );
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los locales.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (module !== "contratos") return;
    let active = true;
    void apiFetch("/api/contracts/bootstrap?mode=templates")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof body === "object" && body !== null && "error" in body ? String(body.error) : "No se pudieron cargar las plantillas.");
        }
        const selector = (body as { templateSelector?: { templates?: { id: string; clave: string; nombre: string }[]; versions?: Record<string, { id: string; version: number; publicada: boolean } | null> } }).templateSelector;
        if (!Array.isArray(selector?.templates) || !selector.versions) {
          throw new Error("La respuesta de plantillas no es válida.");
        }
        const options = selector.templates.flatMap((template) => {
          const version = selector.versions?.[template.id];
          return version?.publicada ? [{
            id: version.id,
            version: version.version,
            label: `${template.nombre} · v${version.version}`,
          }] : [];
        });
        if (active) setTemplates(options);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las plantillas.");
      });
    return () => {
      active = false;
    };
  }, [module]);

  const loadRecords = useCallback(async () => {
    if (!localId) {
      setRecords([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tipo: module,
        localId,
        limit: String(limit),
        offset: String(offset),
      });
      const response = await apiFetch(`/api/locales/registros?${params}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron cargar los registros.");
      }
      const body = (await response.json()) as { records: DataRow[]; total: number };
      setRecords(body.records);
      setTotal(body.total);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los registros.");
    } finally {
      setLoading(false);
    }
  }, [localId, module, offset]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    let active = true;
    const dependencyTypes = Object.keys(config.references) as ("contactos" | "separaciones" | "contratos")[];
    if (!localId || dependencyTypes.length === 0) {
      setReferences({});
      return;
    }
    void Promise.all(
      dependencyTypes.map(async (type) => {
        const params = new URLSearchParams({ tipo: type, localId, limit: "100", offset: "0" });
        const response = await apiFetch(`/api/locales/registros?${params}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `No se pudieron cargar los ${type}.`);
        }
        const result = (await response.json()) as { records: DataRow[] };
        return [type, result.records] as const;
      }),
    )
      .then((entries) => {
        if (active) setReferences(Object.fromEntries(entries));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las referencias.");
      });
    return () => {
      active = false;
    };
  }, [config.references, localId]);

  function openEditor(record: DataRow | null) {
    setEditing(record);
    const initialForm = record
      ? Object.fromEntries(config.fields.map((field) => {
          const value = record[field.name];
          return [
            field.name,
            typeof value === "boolean" || typeof value === "string"
              ? value
              : value === null || value === undefined
                ? ""
                : String(value),
          ];
        }))
      : emptyForm(config);
    if (!record) {
      if (module === "separaciones") {
        Object.assign(initialForm, {
          monto: "500",
          diasTiempo: "1",
          garantiaExtendida: false,
          fecha: new Date().toISOString().slice(0, 10),
        });
      } else if (module === "contratos") {
        Object.assign(initialForm, {
          codigo: local ? `CTR-${local.codigo}-${Date.now().toString().slice(-6)}` : "",
          montoCanon: local?.precioAlquiler ?? "0",
          depositoGarantia: local?.garantia ?? "0",
          mantenimiento: local?.mantenimiento ?? "0",
          fechaInicio: new Date().toISOString().slice(0, 10),
          fechaFin: "",
        });
      } else if (module === "adendas") {
        Object.assign(initialForm, { fecha: new Date().toISOString().slice(0, 10) });
      }
    }
    if (module === "separaciones" && record) {
      initialForm.garantiaExtendida = Boolean(record.garantiaExtendida);
    }
    setForm(
      initialForm,
    );
    setError(null);
    setIsOpen(true);
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!localId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(
        editing
          ? `/api/locales/registros/${editing.id}?tipo=${module}`
          : "/api/locales/registros",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, tipo: module, localId }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar el registro.");
      }
      setIsOpen(false);
      setEditing(null);
      await loadRecords();
      const dependencyTypes = Object.keys(config.references) as ("contactos" | "separaciones" | "contratos")[];
      const refreshed = await Promise.all(dependencyTypes.map(async (type) => {
        const params = new URLSearchParams({ tipo: type, localId, limit: "100", offset: "0" });
        const response = await apiFetch(`/api/locales/registros?${params}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `No se pudieron actualizar los ${type}.`);
        }
        const body = (await response.json()) as { records: DataRow[] };
        return [type, body.records] as const;
      }));
      setReferences((current) => ({ ...current, ...Object.fromEntries(refreshed) }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el registro.");
    } finally {
      setSaving(false);
    }
  }

  function fieldOptions(field: FieldConfig) {
    if (field.name === "plantillaVersionId") {
      return templates.map((template) => ({ value: template.id, label: template.label }));
    }
    if (field.name === "estado") {
      const options = module === "separaciones"
        ? STATUS_SEPARATION
        : module === "contratos"
          ? STATUS_CONTRACT
          : module === "adendas"
            ? STATUS_ANNEX
            : [];
      const currentStatus = String(form.estado ?? options[0]?.value ?? "");
      const selected = options.find((option) => option.value === currentStatus) ?? options[0];
      return selected ? [selected] : [];
    }
    if (field.options) return field.options;
    const relationType = (
      Object.entries(config.references) as ["contactos" | "separaciones" | "contratos", string][]
    ).find(([, fieldName]) => fieldName === field.name)?.[0];
    if (!relationType) return [];
    return (references[relationType] ?? []).map((row) => ({
      value: String(row.id),
      label: recordLabel(relationType, row),
    }));
  }

  function cellValue(column: ModuleConfig["columns"][number], row: DataRow) {
    const value = row[column.name];
    if (column.name === "estadoVista") return estadoLabel(String(value ?? ""));
    if (column.format === "reference") {
      const referenceType =
        column.name === "contactId"
          ? "contactos"
          : column.name === "contractId"
            ? "contratos"
            : "separaciones";
      const reference = references[referenceType]?.find((item) => item.id === value);
      return reference ? recordLabel(referenceType, reference) : "—";
    }
    return formatCell(value, column.format);
  }

  async function openWorkflow(record: DataRow, action: "completar" | "extender" = "completar") {
    if (!localId) return;
    if (module === "contactos" || module === "servicios") return;
    const ownerType: LocalDocumentOwner = module;
    const isInitialState =
      (module === "contratos" && record.estado === "BORRADOR") ||
      (module === "adendas" && record.estado === "BORRADOR");
    if (isInitialState) {
      setError(null);
      try {
        const params = new URLSearchParams({ tipo: module, accion: "emitir" });
        const response = await apiFetch(`/api/locales/registros/${record.id}/workflow?${params}`, { method: "POST" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof body === "object" && body !== null && "error" in body ? String(body.error) : "No se pudo emitir el registro.");
        }
        await loadRecords();
      } catch (workflowError) {
        setError(workflowError instanceof Error ? workflowError.message : "No se pudo emitir el registro.");
        return;
      }
    }

    const requiredDocuments = module === "separaciones"
      ? [{
          tipo: action === "extender" ? "VOUCHER_GARANTIA_EXTENDIDA" : "VOUCHER_SEPARACION",
          label: action === "extender" ? "Voucher de garantía extendida" : "Voucher de separación",
        }]
      : module === "contratos"
        ? [
            { tipo: "VOUCHER_GARANTIA", label: "Voucher de pago de garantía" },
            { tipo: "VOUCHER_PRIMERA_MENSUALIDAD", label: "Voucher de primera mensualidad" },
            { tipo: "CONTRATO_FIRMADO", label: "Contrato firmado (PDF o imagen)" },
          ]
        : [{ tipo: "ADENDA_FIRMADA", label: "Adenda firmada (PDF o imagen)" }];
    setWorkflow({ ownerType, ownerId: record.id, action, requiredDocuments });
  }

  async function completeWorkflow() {
    if (!workflow) return;
    const params = new URLSearchParams({ tipo: workflow.ownerType, accion: workflow.action });
    const response = await apiFetch(
      `/api/locales/registros/${workflow.ownerId}/workflow?${params}`,
      { method: "POST" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body === "object" && body !== null && "error" in body ? String(body.error) : "No se pudo completar el flujo.");
    }
    setWorkflow(null);
    await loadRecords();
  }

  return (
    <DashboardShell>
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link href="/locales" aria-label="Volver al catálogo de locales" className="mt-1 rounded-md border p-2 hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">{config.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadRecords()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <button type="button" onClick={() => openEditor(null)} disabled={!localId} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
              <Plus className="h-4 w-4" />
              Nuevo {config.singular}
            </button>
          </div>
        </div>

        <section className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-4 shadow-sm">
          <label htmlFor="local-filter" className="text-sm font-medium">Local</label>
          <select
            id="local-filter"
            value={localId}
            onChange={(event) => {
              setOffset(0);
              setLocalId(event.target.value);
            }}
            className="h-10 min-w-56 rounded-md border bg-background px-3 text-sm"
          >
            {locales.map((item) => (
              <option key={item.id} value={item.id}>{item.codigo} · {item.sede}</option>
            ))}
          </select>
          {local ? <span className="text-sm text-muted-foreground">{local.nombre}</span> : null}
          <span className="ml-auto text-sm text-muted-foreground">{total} registros</span>
        </section>

        {error && !isOpen ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        ) : null}

        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Cargando registros…</p>
        ) : records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">No hay {config.title.toLowerCase()} en este local.</p>
            <p className="mt-1 text-sm text-muted-foreground">Los registros se almacenan aparte de Departamentos y de los módulos generales.</p>
          </div>
        ) : (
          <>
            <TableScroll className="rounded-lg border bg-card">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {config.columns.map((column) => <th key={column.name} className="whitespace-nowrap px-4 py-3 font-medium">{column.label}</th>)}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b last:border-0">
                      {config.columns.map((column) => (
                        <td key={column.name} className="max-w-64 truncate px-4 py-3">
                          {cellValue(column, record)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {module === "separaciones" && record.estado === "PENDIENTE" && separationNotExpired(record) ? (
                            <button type="button" onClick={() => void openWorkflow(record)} className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/5">
                              Voucher y confirmar
                            </button>
                          ) : null}
                          {module === "separaciones" && record.estado !== "CANCELADA" && !record.garantiaExtendida && separationNotExpired(record) ? (
                            <button type="button" onClick={() => void openWorkflow(record, "extender")} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                              Extender garantía
                            </button>
                          ) : null}
                          {module === "contratos" && (record.estado === "BORRADOR" || record.estado === "EMITIDO") ? (
                            <button type="button" onClick={() => void openWorkflow(record)} className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/5">
                              {record.estado === "BORRADOR" ? "Emitir contrato" : "Completar contrato"}
                            </button>
                          ) : null}
                          {module === "adendas" && (record.estado === "BORRADOR" || record.estado === "EMITIDA") ? (
                            <button type="button" onClick={() => void openWorkflow(record)} className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/5">
                              {record.estado === "BORRADOR" ? "Emitir adenda" : "Completar adenda"}
                            </button>
                          ) : null}
                          <button type="button" onClick={() => openEditor(record)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {total > limit ? (
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setOffset((value) => Math.max(0, value - limit))} disabled={offset === 0 || loading} className="rounded-md border p-2 disabled:opacity-40" aria-label="Página anterior">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-muted-foreground">{offset + 1}–{Math.min(offset + limit, total)} de {total}</span>
                <button type="button" onClick={() => setOffset((value) => value + limit)} disabled={offset + limit >= total || loading} className="rounded-md border p-2 disabled:opacity-40" aria-label="Página siguiente">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={(event) => void saveRecord(event)} className="max-h-[95vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{editing ? `Editar ${config.singular}` : `Nuevo ${config.singular}`}</h2>
                <p className="text-sm text-muted-foreground">{local?.codigo} · Este registro pertenece solo a este local.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} disabled={saving} aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {config.fields.map((field) => {
                const value = form[field.name] ?? "";
                const options = fieldOptions(field);
                const missingOptions = field.type === "select" && !field.options && options.length === 0;
                return (
                  <label key={field.name} className={`space-y-1 text-sm ${field.type === "textarea" ? "sm:col-span-2" : ""}`}>
                    <span>{field.label}</span>
                    {field.type === "textarea" ? (
                      <textarea required={field.required} maxLength={field.name === "descripcion" ? 4000 : 2000} rows={3} value={String(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" />
                    ) : field.type === "select" ? (
                      <select required={field.required && !(editing && field.name === "plantillaVersionId")} value={String(value)} disabled={missingOptions || (field.name === "estado" && Boolean(editing))} onChange={(event) => setForm((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                        ...(field.name === "tipoSeparacion" && event.target.value !== "FLUCTUANTE"
                          ? { monto: event.target.value === "TOTAL" ? local?.precioAlquiler ?? "0" : "500" }
                          : {}),
                      }))} className="h-10 w-full rounded-md border bg-background px-3 disabled:opacity-50">
                        {!field.required ? <option value="">Ninguno</option> : null}
                        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : field.type === "checkbox" ? (
                      <input type="checkbox" checked={Boolean(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.checked }))} className="ml-2 h-4 w-4 align-middle" />
                    ) : (
                      <input required={field.required} type={field.type} min={field.type === "number" ? field.name === "diasTiempo" ? "1" : "0" : undefined} step={field.type === "number" ? field.name === "diasTiempo" ? "1" : "0.01" : undefined} value={String(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3" />
                    )}
                    {field.name === "estado" && editing ? <span className="block text-xs text-muted-foreground">Estado actual: {estadoLabel(String(value))}. Usa las acciones del flujo para cambiarlo.</span> : null}
                    {missingOptions ? <span className="block text-xs text-muted-foreground">Primero registra elementos relacionados en su sección.</span> : null}
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={() => setIsOpen(false)} disabled={saving} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={saving || !localId} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {workflow && localId ? (
        <LocalDocumentsModal
          localId={localId}
          ownerId={workflow.ownerId}
          ownerType={workflow.ownerType}
          requiredDocuments={workflow.requiredDocuments}
          onClose={() => setWorkflow(null)}
          onComplete={completeWorkflow}
        />
      ) : null}
    </DashboardShell>
  );
}
