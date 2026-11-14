"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";
import { PersonType } from "@contract/domain/client";
import type { LocalModule } from "@/lib/locales-records";
import { compressImageFile, fileToDataUrl } from "@/lib/image-compression";
import {
  getAttachmentBytes,
  MAX_CONTACT_ATTACHMENTS_BYTES,
  MAX_CONTACT_IMAGE_BYTES,
  MAX_CONTACT_SOURCE_IMAGE_BYTES,
  validateContactAttachments,
} from "@/lib/contact-attachments";
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

type DataRow = Record<string, string | number | boolean | null | string[] | LocalContactAttachment[]> & {
  id: string;
  localId: string;
};

type FieldType = "text" | "email" | "tel" | "date" | "number" | "textarea" | "select" | "checkbox" | "file";
type LocalContactAttachment = { id: string; nombre: string; tipo: string; dataUrl: string };
type ContactDocumentGroup = {
  label: string;
  attachments: LocalContactAttachment[];
};
type ContactDocumentPreview = {
  title: string;
  groups: ContactDocumentGroup[];
};
const CONTACT_ATTACHMENT_FIELDS = ["copiaDni", "copiaBoletas", "copiaAntecedentes"] as const;

function parseContactAttachments(value: string): LocalContactAttachment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    throw new Error("La lista de archivos adjuntos no es válida.");
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof item.id === "string" &&
      "nombre" in item &&
      typeof item.nombre === "string" &&
      "tipo" in item &&
      typeof item.tipo === "string" &&
      "dataUrl" in item &&
      typeof item.dataUrl === "string",
    )
  ) {
    throw new Error("La lista de archivos adjuntos no es válida.");
  }
  return parsed;
}
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
  { value: "GARANTIA", label: "Pago de la garantía" },
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
    description: "Contactos registrados en esta sección, asociados al local indicado.",
    singular: "contacto",
    fields: [
      { name: "localId", label: "Local", type: "select", required: true },
      { name: "tipoPersona", label: "Tipo de persona", type: "select", required: true, options: [
        { value: PersonType.NATURAL, label: "Persona natural" },
        { value: PersonType.LEGAL, label: "Persona jurídica" },
      ] },
      { name: "nombres", label: "Nombres", type: "text", required: true },
      { name: "apellidos", label: "Apellidos", type: "text" },
      { name: "documento", label: "DNI/CE", type: "text", required: true },
      { name: "ruc", label: "RUC", type: "text" },
      { name: "domicilio", label: "Domicilio", type: "text" },
      { name: "nacionalidad", label: "Nacionalidad", type: "text" },
      { name: "codigoPais", label: "Código de país", type: "text", required: true },
      { name: "telefono", label: "Teléfono", type: "tel" },
      { name: "contactoEmergenciaNombre", label: "Contacto de emergencia", type: "text" },
      { name: "contactoEmergenciaParentesco", label: "Parentesco", type: "text" },
      { name: "contactoEmergenciaTelefono", label: "Teléfono de emergencia", type: "tel" },
      { name: "mascotas", label: "Tiene mascotas", type: "checkbox" },
      { name: "mascotasItems", label: "Detalle de mascotas", type: "text" },
      { name: "copiaDni", label: "Copias de DNI/CE", type: "file" },
      { name: "copiaBoletas", label: "Boletas de pago", type: "file" },
      { name: "copiaAntecedentes", label: "Antecedentes penales", type: "file" },
    ],
    columns: [
      { name: "localCodigo", label: "Local" },
      { name: "nombres", label: "Nombres" },
      { name: "apellidos", label: "Apellidos" },
      { name: "tipoPersona", label: "Tipo" },
      { name: "documento", label: "DNI/CE" },
      { name: "ruc", label: "RUC" },
      { name: "telefono", label: "Teléfono" },
      { name: "domicilio", label: "Domicilio" },
      { name: "nacionalidad", label: "Nacionalidad" },
      { name: "mascotas", label: "Mascotas" },
    ],
    references: {},
  },
  separaciones: {
    title: "Separaciones de Locales",
    description: "Registra y consulta separaciones de contactos de Locales para cualquier local.",
    singular: "separación",
    fields: [
      { name: "localId", label: "Local solicitado", type: "select", required: true },
      { name: "contactId", label: "Contacto", type: "select", required: true },
      { name: "tipoSeparacion", label: "Tipo de separación", type: "select", required: true, options: TYPE_SEPARATION },
      { name: "monto", label: "Monto (S/)", type: "number", required: true },
      { name: "diasTiempo", label: "Tiempo restante (días)", type: "number", required: true },
      { name: "estado", label: "Estado", type: "select", required: true, options: STATUS_SEPARATION },
      { name: "fecha", label: "Fecha", type: "date", required: true },
      { name: "observaciones", label: "Observaciones", type: "textarea" },
    ],
    columns: [
      { name: "localCodigo", label: "Local" },
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
    description: "Consulta contratos de todos los locales y emite nuevos para el local que elijas.",
    singular: "contrato",
    fields: [
      { name: "localId", label: "Local", type: "select", required: true },
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
      { name: "localCodigo", label: "Local" },
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
    return [row.nombres, row.apellidos, row.documento, row.localCodigo]
      .filter(Boolean)
      .join(" · ");
  }
  if (type === "contratos") return String(row.codigo ?? "");
  return `${row.fecha ?? ""} · ${row.estado ?? ""}`;
}

async function loadReferenceRecords(
  type: "contactos" | "separaciones" | "contratos",
  localId?: string,
) {
  const limit = 100;
  const loadPage = async (offset: number) => {
    const params = new URLSearchParams({ tipo: type, limit: String(limit), offset: String(offset) });
    if (localId) params.set("localId", localId);
    const response = await apiFetch(`/api/locales/registros?${params}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `No se pudieron cargar los ${type}.`);
    }
    return (await response.json()) as { records: DataRow[]; total: number };
  };

  const firstPage = await loadPage(0);
  const records = [...firstPage.records];
  for (let offset = records.length; offset < firstPage.total; offset += limit) {
    const page = await loadPage(offset);
    if (page.records.length === 0) {
      throw new Error(`No se pudieron cargar todos los ${type}.`);
    }
    records.push(...page.records);
  }
  return records;
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
  const [availableContractLocalIds, setAvailableContractLocalIds] = useState<string[] | null>(null);
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
  const [contactDocuments, setContactDocuments] = useState<ContactDocumentPreview | null>(null);
  const [loadingContactDocuments, setLoadingContactDocuments] = useState(false);
  const [workflow, setWorkflow] = useState<{
    ownerType: LocalDocumentOwner;
    ownerId: string;
    localId: string;
    action: "completar" | "extender";
    requiredDocuments: { tipo: string; label: string }[];
  } | null>(null);
  const limit = 50;

  const local = useMemo(() => locales.find((item) => item.id === localId), [localId, locales]);
  const contactFormLocal = useMemo(
    () => locales.find((item) => item.id === String(form.localId ?? "")),
    [form.localId, locales],
  );
  const canCreateContract = module !== "contratos" ||
    (availableContractLocalIds !== null && availableContractLocalIds.length > 0);

  const loadAvailableContractLocals = useCallback(async () => {
    const response = await apiFetch("/api/locales?availableForContract=1");
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        typeof body === "object" && body !== null && "error" in body
          ? String(body.error)
          : "No se pudo cargar la disponibilidad de los locales.",
      );
    }
    if (
      !Array.isArray(body) ||
      !body.every((item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        typeof item.id === "string",
      )
    ) {
      throw new Error("La respuesta de locales disponibles no es válida.");
    }
    return body as LocalRecord[];
  }, []);

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
        const requestedLocalId = new URLSearchParams(window.location.search).get("localId");
        setLocalId((current) =>
          module === "contactos"
            ? ""
            : items.some((item) => item.id === current)
              ? current
              : items.find((item) => item.id === requestedLocalId)?.id ?? items[0]?.id ?? "",
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
  }, [module]);

  useEffect(() => {
    if (module !== "contratos") {
      setAvailableContractLocalIds(null);
      return;
    }
    let active = true;
    void loadAvailableContractLocals()
      .then((items) => {
        if (active) setAvailableContractLocalIds(items.map((item) => item.id));
      })
      .catch((loadError: unknown) => {
        if (active) {
          setAvailableContractLocalIds([]);
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la disponibilidad de los locales.");
        }
      });
    return () => {
      active = false;
    };
  }, [loadAvailableContractLocals, module]);

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
    const allRecords = ["contactos", "separaciones", "contratos"].includes(module);
    if (!localId && !allRecords) {
      setRecords([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ tipo: module, limit: String(limit), offset: String(offset) });
      if (!allRecords) params.set("localId", localId);
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
    const referenceLocalId = module === "contratos" && isOpen
      ? String(form.localId ?? "")
      : localId;
    const allContacts = module === "separaciones" || module === "contratos";
    const needsLocalId = dependencyTypes.some((type) => !(allContacts && type === "contactos"));
    if (dependencyTypes.length === 0 || (needsLocalId && !referenceLocalId)) {
      setReferences({});
      return;
    }
    void Promise.all(
      dependencyTypes.map(async (type) => {
        const typeLocalId = allContacts && type === "contactos" ? undefined : referenceLocalId;
        return [type, await loadReferenceRecords(type, typeLocalId)] as const;
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
  }, [config.references, form.localId, isOpen, localId, module]);

  function openEditor(record: DataRow | null) {
    setEditing(record);
    const initialForm = record
      ? Object.fromEntries(config.fields.map((field) => {
          const value = record[field.name];
          return [
            field.name,
            Array.isArray(value)
              ? value.length > 0 && typeof value[0] === "object"
                ? JSON.stringify(value)
                : value.join(", ")
              : typeof value === "boolean" || typeof value === "string"
              ? value
              : value === null || value === undefined
                ? ""
                : String(value),
          ];
        }))
      : emptyForm(config);
    if (module === "contactos") {
      const emergency = record?.contactoEmergencia;
      const parsedEmergency = typeof emergency === "object" && emergency !== null && !Array.isArray(emergency)
        ? emergency as { nombre?: string; parentesco?: string; telefono?: string }
        : {};
      Object.assign(initialForm, {
        contactoEmergenciaNombre: parsedEmergency.nombre ?? "",
        contactoEmergenciaParentesco: parsedEmergency.parentesco ?? "",
        contactoEmergenciaTelefono: parsedEmergency.telefono ?? "",
        mascotasItems: Array.isArray(record?.mascotasItems) ? record.mascotasItems.join(", ") : "",
        copiaDni: JSON.stringify(record?.copiaDni ?? []),
        copiaBoletas: JSON.stringify(record?.copiaBoletas ?? []),
        copiaAntecedentes: JSON.stringify(record?.copiaAntecedentes ?? []),
      });
    }
    if (!record) {
      if (module === "separaciones") {
        Object.assign(initialForm, {
          localId,
          tipoSeparacion: "GARANTIA",
          monto: locales.find((item) => item.id === localId)?.garantia ?? "0",
          diasTiempo: "1",
          garantiaExtendida: false,
          fecha: new Date().toISOString().slice(0, 10),
        });
      } else if (module === "contratos") {
        const defaultContractLocalId = availableContractLocalIds?.includes(localId)
          ? localId
          : availableContractLocalIds?.[0] ?? "";
        const defaultContractLocal = locales.find((item) => item.id === defaultContractLocalId);
        Object.assign(initialForm, {
          localId: defaultContractLocalId,
          codigo: defaultContractLocal?.codigo ?? "",
          montoCanon: defaultContractLocal?.precioAlquiler ?? "0",
          depositoGarantia: defaultContractLocal?.garantia ?? "0",
          mantenimiento: defaultContractLocal?.mantenimiento ?? "0",
          fechaInicio: new Date().toISOString().slice(0, 10),
          fechaFin: "",
        });
      } else if (module === "contactos") {
        Object.assign(initialForm, {
          tipoPersona: PersonType.NATURAL,
          codigoPais: "51",
          mascotas: false,
          mascotasItems: "",
          copiaDni: "[]",
          copiaBoletas: "[]",
          copiaAntecedentes: "[]",
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

  async function editRecord(record: DataRow) {
    if (module !== "contactos") {
      openEditor(record);
      return;
    }
    try {
      const response = await apiFetch(`/api/locales/registros/${record.id}?tipo=contactos`);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof body !== "object" || body === null || !("id" in body)) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String(body.error)
            : "No se pudieron cargar los datos del contacto.",
        );
      }
      openEditor(body as DataRow);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos del contacto.");
    }
  }

  async function viewContactDocuments(record: DataRow) {
    setLoadingContactDocuments(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/locales/registros/${record.id}?tipo=contactos`);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof body !== "object" || body === null || !("id" in body)) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String(body.error)
            : "No se pudieron cargar los documentos del contacto.",
        );
      }
      const contact = body as Record<string, unknown>;
      setContactDocuments({
        title: [contact.nombres, contact.apellidos].filter(Boolean).join(" ") || recordLabel("contactos", record),
        groups: [
          {
            label: "DNI/CE",
            attachments: parseContactAttachments(JSON.stringify(contact.copiaDni ?? [])),
          },
          {
            label: "Boletas de pago",
            attachments: parseContactAttachments(JSON.stringify(contact.copiaBoletas ?? [])),
          },
          {
            label: "Antecedentes penales",
            attachments: parseContactAttachments(JSON.stringify(contact.copiaAntecedentes ?? [])),
          },
        ],
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los documentos del contacto.");
    } finally {
      setLoadingContactDocuments(false);
    }
  }

  async function addContactFiles(fieldName: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const current = parseContactAttachments(String(form[fieldName] ?? "[]"));
      const allCurrent = CONTACT_ATTACHMENT_FIELDS.flatMap((name) =>
        name === fieldName ? current : parseContactAttachments(String(form[name] ?? "[]")),
      );
      const usedBytes = allCurrent.reduce(
        (totalBytes, attachment) => totalBytes + (getAttachmentBytes(attachment.dataUrl) ?? 0),
        0,
      );
      let totalBytes = usedBytes;
      const additions: LocalContactAttachment[] = [];
      const mimeByExtension: Record<string, string> = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };

      for (const original of Array.from(files)) {
        const extension = original.name.split(".").pop()?.toLowerCase() ?? "";
        const mimeType = original.type || mimeByExtension[extension] || "";
        if (!Object.values(mimeByExtension).includes(mimeType)) {
          throw new Error(`"${original.name}" no es PDF, JPG, PNG o WebP.`);
        }
        let file = original.type === mimeType
          ? original
          : new File([original], original.name, { type: mimeType, lastModified: original.lastModified });
        if (file.type.startsWith("image/")) {
          if (file.size > MAX_CONTACT_SOURCE_IMAGE_BYTES) {
            throw new Error(`"${file.name}" supera el límite de 10 MB antes de optimizar.`);
          }
          file = await compressImageFile(file, "contactDocument");
          if (file.size > MAX_CONTACT_IMAGE_BYTES) {
            throw new Error(`No se pudo reducir "${file.name}" a 1 MB.`);
          }
        }
        const dataUrl = await fileToDataUrl(file);
        const bytes = getAttachmentBytes(dataUrl);
        if (bytes === null || totalBytes + bytes > MAX_CONTACT_ATTACHMENTS_BYTES) {
          throw new Error("El límite total de archivos por contacto es 3 MB.");
        }
        totalBytes += bytes;
        additions.push({
          id: crypto.randomUUID(),
          nombre: original.name,
          tipo: file.type,
          dataUrl,
        });
      }

      const next = [...current, ...additions];
      const allNext = CONTACT_ATTACHMENT_FIELDS.flatMap((name) =>
        name === fieldName ? next : parseContactAttachments(String(form[name] ?? "[]")),
      );
      const validationError = validateContactAttachments(allNext);
      if (validationError) throw new Error(validationError);
      setForm((currentForm) => ({ ...currentForm, [fieldName]: JSON.stringify(next) }));
      setError(null);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "No se pudieron leer los archivos.");
    }
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recordLocalId = ["contactos", "separaciones", "contratos"].includes(module)
      ? String(form.localId ?? "")
      : localId;
    if (!recordLocalId) {
      setError("Selecciona un local.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...form, tipo: module, localId: recordLocalId };
      if (module === "contactos") {
        payload.email = editing ? String(editing.email ?? "") : "";
        payload.contactoEmergencia = {
          nombre: String(form.contactoEmergenciaNombre ?? ""),
          parentesco: String(form.contactoEmergenciaParentesco ?? ""),
          telefono: String(form.contactoEmergenciaTelefono ?? ""),
        };
        delete payload.contactoEmergenciaNombre;
        delete payload.contactoEmergenciaParentesco;
        delete payload.contactoEmergenciaTelefono;
        for (const fieldName of CONTACT_ATTACHMENT_FIELDS) {
          payload[fieldName] = parseContactAttachments(String(form[fieldName] ?? "[]"));
        }
        payload.mascotasItems = Array.isArray(form.mascotasItems)
          ? form.mascotasItems
          : String(form.mascotasItems ?? "").split(",").map((item) => item.trim()).filter(Boolean);
      }
      const response = await apiFetch(
        editing
          ? `/api/locales/registros/${editing.id}?tipo=${module}`
          : "/api/locales/registros",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar el registro.");
      }
      setIsOpen(false);
      setEditing(null);
      await loadRecords();
      if (module === "contratos") {
        const available = await loadAvailableContractLocals();
        setAvailableContractLocalIds(available.map((item) => item.id));
      }
      const dependencyTypes = Object.keys(config.references) as ("contactos" | "separaciones" | "contratos")[];
      const refreshed = await Promise.all(dependencyTypes.map(async (type) => {
        const typeLocalId = (module === "separaciones" || module === "contratos") && type === "contactos"
          ? undefined
          : recordLocalId;
        return [type, await loadReferenceRecords(type, typeLocalId)] as const;
      }));
      setReferences((current) => ({ ...current, ...Object.fromEntries(refreshed) }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el registro.");
    } finally {
      setSaving(false);
    }
  }

  function fieldOptions(field: FieldConfig) {
    if (field.name === "localId") {
      const availableContractLocals = module === "contratos" && !editing && availableContractLocalIds !== null
        ? locales.filter((item) => availableContractLocalIds.includes(item.id))
        : locales;
      return availableContractLocals.map((item) => ({
        value: item.id,
        label: `${item.codigo} · ${item.sede}`,
      }));
    }
    if (field.name === "codigo") {
      if (editing) {
        const codigo = String(editing.codigo ?? "");
        return codigo ? [{ value: codigo, label: codigo }] : [];
      }
      return contactFormLocal && availableContractLocalIds?.includes(contactFormLocal.id)
        ? [{ value: contactFormLocal.codigo, label: contactFormLocal.codigo }]
        : [];
    }
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
    if (field.options) {
      if (field.name === "tipoSeparacion") {
        const current = String(form.tipoSeparacion ?? "");
        const currentIsLegacy = ["500", "TOTAL"].includes(current);
        if (currentIsLegacy && !field.options.some((option) => option.value === current)) {
          return [
            {
              value: current,
              label: current === "500" ? "S/ 500 (registro anterior)" : "Total del alquiler (registro anterior)",
            },
            ...field.options,
          ];
        }
      }
      return field.options;
    }
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
    const rawValue = row[column.name];
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    if (column.name === "estadoVista") return estadoLabel(String(value ?? ""));
    if (column.name === "tipoSeparacion") {
      return ({
        GARANTIA: "Pago de la garantía",
        FLUCTUANTE: "Monto personalizado",
        "500": "S/ 500 (registro anterior)",
        TOTAL: "Total del alquiler (registro anterior)",
      } as Record<string, string>)[String(value ?? "")] ?? String(value ?? "—");
    }
    if (column.name === "tipoPersona") {
      return value === PersonType.LEGAL ? "Jurídica" : "Natural";
    }
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
    if (module === "contactos" || module === "servicios") return;
    const recordLocalId = String(record.localId ?? "");
    if (!recordLocalId) {
      setError("No se pudo identificar el local del registro.");
      return;
    }
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
    setWorkflow({ ownerType, ownerId: record.id, localId: recordLocalId, action, requiredDocuments });
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
            {["separaciones", "contratos"].includes(module) ? (
              <span className="inline-flex h-10 items-center text-sm text-muted-foreground">{total} registros</span>
            ) : null}
            <button type="button" onClick={() => openEditor(null)} disabled={(module === "contactos" ? locales.length === 0 : !localId) || !canCreateContract} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
              <Plus className="h-4 w-4" />
              Nuevo {config.singular}
            </button>
          </div>
        </div>
        {module === "contratos" && availableContractLocalIds !== null && !canCreateContract ? (
          <p className="text-sm text-muted-foreground">No hay locales disponibles para crear un nuevo contrato.</p>
        ) : null}

        {!["contactos", "separaciones", "contratos"].includes(module) ? (
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
        ) : null}

        {error && !isOpen ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        ) : null}

        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Cargando registros…</p>
        ) : records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">
              {module === "contactos"
                ? "No hay contactos registrados desde esta sección."
                : ["separaciones", "contratos"].includes(module)
                  ? `No hay ${config.title.toLowerCase()} registrados.`
                  : `No hay ${config.title.toLowerCase()} en este local.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Los registros se almacenan aparte de Departamentos y de los módulos generales.</p>
          </div>
        ) : (
          <>
            <TableScroll className="rounded-lg border bg-card">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {config.columns.map((column) => <th key={column.name} className="whitespace-nowrap px-4 py-3 font-medium">{column.label}</th>)}
                    {module === "contactos" ? <th className="whitespace-nowrap px-4 py-3 font-medium">Documentación</th> : null}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const documentCount = Number(record.copiaDniCount ?? 0) +
                      Number(record.copiaBoletasCount ?? 0) +
                      Number(record.copiaAntecedentesCount ?? 0);
                    return (
                      <tr key={record.id} className="border-b last:border-0">
                        {config.columns.map((column) => (
                          <td key={column.name} className="max-w-64 truncate px-4 py-3">
                            {cellValue(column, record)}
                          </td>
                        ))}
                        {module === "contactos" ? (
                          <td className="whitespace-nowrap px-4 py-3">
                            <button
                              type="button"
                              onClick={() => void viewContactDocuments(record)}
                              disabled={documentCount === 0 || loadingContactDocuments}
                              className="rounded-md border px-3 py-1.5 text-sm text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {loadingContactDocuments
                                ? "Cargando…"
                                : documentCount === 0
                                  ? "Sin documentos"
                                  : `Ver documentos (${documentCount})`}
                            </button>
                          </td>
                        ) : null}
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
                            <button type="button" onClick={() => void editRecord(record)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                              Editar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                <p className="text-sm text-muted-foreground">
                  {module === "contactos"
                    ? `${contactFormLocal?.codigo ?? "Selecciona un local"} · Contacto asociado al local indicado.`
                    : module === "separaciones"
                      ? `${contactFormLocal?.codigo ?? "Selecciona un local"} · La separación se registra en este local.`
                      : module === "contratos"
                        ? `${contactFormLocal?.codigo ?? "Selecciona un local"} · El contrato se registra en este local.`
                        : `${local?.codigo} · Este registro pertenece solo a este local.`}
                </p>
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
                const required = field.required || (field.name === "ruc" && form.tipoPersona === PersonType.LEGAL);
                const hasSelectedOption = options.some((option) => option.value === String(value));
                const selectPlaceholder = field.name === "localId"
                  ? "Selecciona un local"
                  : field.name === "contactId"
                    ? "Selecciona un contacto"
                    : field.name === "contractId"
                      ? "Selecciona un contrato"
                      : "Selecciona una opción";
                const fieldLabel =
                  module === "separaciones" &&
                  field.name === "monto" &&
                  form.tipoSeparacion === "GARANTIA"
                    ? "Pago de garantía (S/)"
                    : field.label;
                const Wrapper = field.type === "file" ? "div" : "label";
                return (
                  <Wrapper key={field.name} className={`space-y-1 text-sm ${field.type === "textarea" || field.type === "file" ? "sm:col-span-2" : ""}`}>
                    <span>{fieldLabel}</span>
                    {field.type === "file" ? (
                      <div className="space-y-2">
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                          onChange={(event) => {
                            void addContactFiles(field.name, event.currentTarget.files);
                            event.currentTarget.value = "";
                          }}
                          className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
                        />
                        <ul className="space-y-1">
                          {parseContactAttachments(String(value)).map((attachment) => (
                            <li key={attachment.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs">
                              <a href={attachment.dataUrl} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                                {attachment.nombre}
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = parseContactAttachments(String(form[field.name] ?? "[]"))
                                    .filter((item) => item.id !== attachment.id);
                                  setForm((current) => ({ ...current, [field.name]: JSON.stringify(next) }));
                                }}
                                className="shrink-0 text-destructive hover:underline"
                              >
                                Quitar
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : field.type === "textarea" ? (
                      <textarea required={required} maxLength={field.name === "descripcion" ? 4000 : 2000} rows={3} value={String(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" />
                    ) : field.type === "select" ? (
                      <select required={required && !(editing && field.name === "plantillaVersionId")} value={String(value)} disabled={missingOptions || (field.name === "estado" && Boolean(editing)) || (field.name === "codigo" && Boolean(editing)) || (field.name === "localId" && Boolean(editing))} onChange={(event) => setForm((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                        ...(field.name === "localId" && module === "contratos"
                          ? (() => {
                              const selectedLocal = locales.find((item) => item.id === event.target.value);
                              return {
                                codigo: selectedLocal?.codigo ?? "",
                                montoCanon: selectedLocal?.precioAlquiler ?? "0",
                                depositoGarantia: selectedLocal?.garantia ?? "0",
                                mantenimiento: selectedLocal?.mantenimiento ?? "0",
                                separationId: "",
                              };
                            })()
                          : {}),
                        ...(field.name === "localId" && module === "separaciones"
                          ? {
                              monto: form.tipoSeparacion === "GARANTIA"
                                ? locales.find((item) => item.id === event.target.value)?.garantia ?? "0"
                                : form.tipoSeparacion === "TOTAL"
                                  ? locales.find((item) => item.id === event.target.value)?.precioAlquiler ?? "0"
                                  : form.tipoSeparacion === "500"
                                    ? "500"
                                    : form.monto,
                            }
                          : {}),
                        ...(field.name === "tipoSeparacion" && event.target.value !== "FLUCTUANTE"
                          ? {
                              monto: event.target.value === "GARANTIA"
                                ? contactFormLocal?.garantia ?? "0"
                                : event.target.value === "TOTAL"
                                  ? contactFormLocal?.precioAlquiler ?? "0"
                                  : "500",
                            }
                          : {}),
                      }))} className="h-10 w-full rounded-md border bg-background px-3 disabled:opacity-50">
                        {required && !hasSelectedOption ? <option value="">{selectPlaceholder}</option> : null}
                        {!field.required ? <option value="">Ninguno</option> : null}
                        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : field.type === "checkbox" ? (
                      <input type="checkbox" checked={Boolean(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.checked }))} className="ml-2 h-4 w-4 align-middle" />
                    ) : (
                      <input required={required} type={field.type} min={field.type === "number" ? field.name === "diasTiempo" ? "1" : "0" : undefined} step={field.type === "number" ? field.name === "diasTiempo" ? "1" : "0.01" : undefined} readOnly={module === "separaciones" && field.name === "monto" && form.tipoSeparacion === "GARANTIA"} value={String(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 read-only:bg-muted" />
                    )}
                    {module === "separaciones" && field.name === "monto" && form.tipoSeparacion === "GARANTIA" ? (
                      <span className="block text-xs text-muted-foreground">Se toma del monto de garantía configurado para el local.</span>
                    ) : null}
                    {field.name === "estado" && editing ? <span className="block text-xs text-muted-foreground">Estado actual: {estadoLabel(String(value))}. Usa las acciones del flujo para cambiarlo.</span> : null}
                    {missingOptions ? <span className="block text-xs text-muted-foreground">Primero registra elementos relacionados en su sección.</span> : null}
                  </Wrapper>
                );
              })}
            </div>
            {module === "contactos" && !locales.length ? (
              <p className="text-xs text-muted-foreground">Primero registra un local en el catálogo.</p>
            ) : null}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={() => setIsOpen(false)} disabled={saving} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={saving || (["contactos", "separaciones", "contratos"].includes(module) ? !String(form.localId ?? "") : !localId)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {workflow ? (
        <LocalDocumentsModal
          localId={workflow.localId}
          ownerId={workflow.ownerId}
          ownerType={workflow.ownerType}
          requiredDocuments={workflow.requiredDocuments}
          onClose={() => setWorkflow(null)}
          onComplete={completeWorkflow}
        />
      ) : null}
      {contactDocuments ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-documents-title"
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="contact-documents-title" className="text-xl font-semibold">Documentación adjunta</h2>
                <p className="mt-1 text-sm text-muted-foreground">{contactDocuments.title}</p>
              </div>
              <button type="button" onClick={() => setContactDocuments(null)} aria-label="Cerrar" className="rounded p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            {loadingContactDocuments ? <p className="text-sm text-muted-foreground">Cargando documentos…</p> : null}
            {contactDocuments.groups.map((group) => (
              <section key={group.label} className="rounded-lg border p-3">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                {group.attachments.length ? (
                  <ul className="mt-2 space-y-2">
                    {group.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <a
                          href={attachment.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm text-primary underline"
                        >
                          {attachment.nombre}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Sin documentos adjuntos.</p>
                )}
              </section>
            ))}
            <div className="flex justify-end border-t pt-4">
              <button type="button" onClick={() => setContactDocuments(null)} className="rounded-md border px-4 py-2 text-sm">
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
