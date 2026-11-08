export const LOCAL_MODULES = [
  "contactos",
  "separaciones",
  "contratos",
  "adendas",
  "servicios",
] as const;

export type LocalModule = (typeof LOCAL_MODULES)[number];

type ContactInput = {
  tipo: "contactos";
  localId: string;
  nombres: string;
  apellidos: string;
  documento: string;
  telefono: string;
  email: string;
};

type SeparationInput = {
  tipo: "separaciones";
  localId: string;
  contactId: string;
  monto: string;
  estado: "PENDIENTE" | "CONFIRMADA" | "CANCELADA";
  fecha: string;
  observaciones: string;
};

type ContractInput = {
  tipo: "contratos";
  localId: string;
  contactId: string;
  separationId: string | null;
  codigo: string;
  montoCanon: string;
  fechaInicio: string;
  fechaFin: string;
  estado: "BORRADOR" | "VIGENTE" | "FINALIZADO" | "ANULADO";
};

type AnnexInput = {
  tipo: "adendas";
  localId: string;
  contractId: string;
  numero: string;
  descripcion: string;
  fecha: string;
  estado: "BORRADOR" | "VIGENTE" | "ANULADA";
};

type ServiceInput = {
  tipo: "servicios";
  localId: string;
  nombre: string;
  descripcion: string;
  monto: string;
  frecuencia: "UNICO" | "MENSUAL" | "ANUAL";
  activo: boolean;
};

export type LocalRecordInput =
  | ContactInput
  | SeparationInput
  | ContractInput
  | AnnexInput
  | ServiceInput;

type ParseResult =
  | { value: LocalRecordInput }
  | { error: string };
type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function stringValue(
  input: Record<string, unknown>,
  key: string,
  label: string,
  maximum: number,
  required = false,
) : FieldResult<string> {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if ((required && value.length === 0) || value.length > maximum) {
    return { ok: false, error: `${label} es obligatorio y no puede superar ${maximum} caracteres.` };
  }
  return { ok: true, value };
}

function uuidValue(input: Record<string, unknown>, key: string, label: string): FieldResult<string> {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  return UUID.test(value)
    ? { ok: true, value }
    : { ok: false, error: `Selecciona un ${label} válido.` };
}

function dateValue(input: Record<string, unknown>, key: string, label: string): FieldResult<string> {
  const value = typeof input[key] === "string" ? input[key] : "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
    ? { ok: true, value }
    : { ok: false, error: `Ingresa una fecha válida para ${label}.` };
}

function amountValue(input: Record<string, unknown>, key: string, label: string): FieldResult<string> {
  const raw = input[key];
  const amount = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000_000
    ? { ok: true, value: amount.toFixed(2) }
    : { ok: false, error: `${label} debe ser un número entre 0 y 1000000000000.` };
}

function enumValue<const T extends readonly string[]>(
  input: Record<string, unknown>,
  key: string,
  allowed: T,
  label: string,
): FieldResult<T[number]> {
  const value = input[key];
  return typeof value === "string" && allowed.includes(value)
    ? { ok: true, value: value as T[number] }
    : { ok: false, error: `Selecciona un valor válido para ${label}.` };
}

export function parseLocalRecord(input: unknown): ParseResult {
  if (!isObject(input)) return { error: "Los datos del registro no son válidos." };
  const local = uuidValue(input, "localId", "local");
  if (!local.ok) return { error: local.error };
  const tipo = input.tipo;

  if (tipo === "contactos") {
    const nombres = stringValue(input, "nombres", "Nombres", 255, true);
    const apellidos = stringValue(input, "apellidos", "Apellidos", 255);
    const documento = stringValue(input, "documento", "Documento", 50);
    const telefono = stringValue(input, "telefono", "Teléfono", 30);
    const email = stringValue(input, "email", "Correo", 255);
    if (!nombres.ok) return { error: nombres.error };
    if (!apellidos.ok) return { error: apellidos.error };
    if (!documento.ok) return { error: documento.error };
    if (!telefono.ok) return { error: telefono.error };
    if (!email.ok) return { error: email.error };
    if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      return { error: "Ingresa un correo válido." };
    }
    return {
      value: {
        tipo,
        localId: local.value,
        nombres: nombres.value,
        apellidos: apellidos.value,
        documento: documento.value,
        telefono: telefono.value,
        email: email.value,
      },
    };
  }

  if (tipo === "separaciones") {
    const contactId = uuidValue(input, "contactId", "contacto");
    const monto = amountValue(input, "monto", "El monto");
    const estado = enumValue(input, "estado", ["PENDIENTE", "CONFIRMADA", "CANCELADA"], "estado");
    const fecha = dateValue(input, "fecha", "la separación");
    const observaciones = stringValue(input, "observaciones", "Observaciones", 2000);
    if (!contactId.ok) return { error: contactId.error };
    if (!monto.ok) return { error: monto.error };
    if (!estado.ok) return { error: estado.error };
    if (!fecha.ok) return { error: fecha.error };
    if (!observaciones.ok) return { error: observaciones.error };
    return {
      value: {
        tipo,
        localId: local.value,
        contactId: contactId.value,
        monto: monto.value,
        estado: estado.value,
        fecha: fecha.value,
        observaciones: observaciones.value,
      },
    };
  }

  if (tipo === "contratos") {
    const contactId = uuidValue(input, "contactId", "contacto");
    const separationRaw = input.separationId;
    const separationId =
      typeof separationRaw === "string" && separationRaw.trim() !== ""
        ? separationRaw.trim()
        : null;
    if (separationId && !UUID.test(separationId)) {
      return { error: "Selecciona una separación válida." };
    }
    const codigo = stringValue(input, "codigo", "Código de contrato", 50, true);
    const montoCanon = amountValue(input, "montoCanon", "El canon");
    const fechaInicio = dateValue(input, "fechaInicio", "inicio");
    const fechaFin = dateValue(input, "fechaFin", "fin");
    const estado = enumValue(
      input,
      "estado",
      ["BORRADOR", "VIGENTE", "FINALIZADO", "ANULADO"],
      "estado",
    );
    if (!contactId.ok) return { error: contactId.error };
    if (!codigo.ok) return { error: codigo.error };
    if (!montoCanon.ok) return { error: montoCanon.error };
    if (!fechaInicio.ok) return { error: fechaInicio.error };
    if (!fechaFin.ok) return { error: fechaFin.error };
    if (!estado.ok) return { error: estado.error };
    if (fechaFin.value < fechaInicio.value) {
      return { error: "La fecha de fin no puede ser anterior a la fecha de inicio." };
    }
    return {
      value: {
        tipo,
        localId: local.value,
        contactId: contactId.value,
        separationId,
        codigo: codigo.value,
        montoCanon: montoCanon.value,
        fechaInicio: fechaInicio.value,
        fechaFin: fechaFin.value,
        estado: estado.value,
      },
    };
  }

  if (tipo === "adendas") {
    const contractId = uuidValue(input, "contractId", "contrato");
    const numero = stringValue(input, "numero", "Número de adenda", 50, true);
    const descripcion = stringValue(input, "descripcion", "Descripción", 4000, true);
    const fecha = dateValue(input, "fecha", "la adenda");
    const estado = enumValue(input, "estado", ["BORRADOR", "VIGENTE", "ANULADA"], "estado");
    if (!contractId.ok) return { error: contractId.error };
    if (!numero.ok) return { error: numero.error };
    if (!descripcion.ok) return { error: descripcion.error };
    if (!fecha.ok) return { error: fecha.error };
    if (!estado.ok) return { error: estado.error };
    return {
      value: {
        tipo,
        localId: local.value,
        contractId: contractId.value,
        numero: numero.value,
        descripcion: descripcion.value,
        fecha: fecha.value,
        estado: estado.value,
      },
    };
  }

  if (tipo === "servicios") {
    const nombre = stringValue(input, "nombre", "Nombre", 255, true);
    const descripcion = stringValue(input, "descripcion", "Descripción", 2000);
    const monto = amountValue(input, "monto", "El monto");
    const frecuencia = enumValue(input, "frecuencia", ["UNICO", "MENSUAL", "ANUAL"], "frecuencia");
    if (typeof input.activo !== "boolean") {
      return { error: "Indica si el servicio está activo." };
    }
    if (!nombre.ok) return { error: nombre.error };
    if (!descripcion.ok) return { error: descripcion.error };
    if (!monto.ok) return { error: monto.error };
    if (!frecuencia.ok) return { error: frecuencia.error };
    return {
      value: {
        tipo,
        localId: local.value,
        nombre: nombre.value,
        descripcion: descripcion.value,
        monto: monto.value,
        frecuencia: frecuencia.value,
        activo: input.activo,
      },
    };
  }

  return { error: "Selecciona una sección válida de Locales." };
}

export function isLocalModule(value: string | null): value is LocalModule {
  return LOCAL_MODULES.some((module) => module === value);
}

export function withoutRecordType<T extends { tipo: string }>(
  record: T,
): Omit<T, "tipo"> {
  const { tipo, ...values } = record;
  void tipo;
  return values;
}
