import { localNumberForCode, localSiteForCode } from "@contract/domain/locales";

export type LocalInput = {
  codigo?: unknown;
  nombre?: unknown;
  areaM2?: unknown;
  precioAlquiler?: unknown;
  garantia?: unknown;
  mantenimiento?: unknown;
  servicios?: unknown;
  pagoLuzPorcentaje?: unknown;
  pagoAguaPorcentaje?: unknown;
  montoJardineria?: unknown;
  impuestoRentaPorcentaje?: unknown;
  letreroAltoCm?: unknown;
  letreroAnchoCm?: unknown;
  letreroProfundidadCm?: unknown;
};

export function parseLocal(input: LocalInput) {
  if (!input || typeof input !== "object") {
    return { error: "Los datos del local no son válidos." } as const;
  }
  const codigo = typeof input.codigo === "string" ? input.codigo.trim() : "";
  const nombre = typeof input.nombre === "string" ? input.nombre.trim() : "";
  const sede = localSiteForCode(codigo);
  const numero = localNumberForCode(codigo);
  if (!sede || !numero) return { error: "Selecciona un código válido de local." } as const;
  if (nombre.length < 2 || nombre.length > 255) {
    return { error: "El nombre debe tener entre 2 y 255 caracteres." } as const;
  }

  const numberFields = [
    ["areaM2", "Área", 10_000_000],
    ["precioAlquiler", "Precio de alquiler", 1_000_000_000_000],
    ["garantia", "Garantía", 1_000_000_000_000],
    ["mantenimiento", "Mantenimiento", 1_000_000_000_000],
    ["pagoLuzPorcentaje", "Pago luz %", 100],
  ] as const;
  const numbers: {
    areaM2: string;
    precioAlquiler: string;
    garantia: string;
    mantenimiento: string;
    pagoLuzPorcentaje: string;
  } = {
    areaM2: "",
    precioAlquiler: "",
    garantia: "",
    mantenimiento: "",
    pagoLuzPorcentaje: "",
  };
  for (const [key, label, max] of numberFields) {
    const raw = input[key];
    if (
      raw === null ||
      raw === undefined ||
      (typeof raw === "string" && raw.trim() === "") ||
      (typeof raw !== "number" && typeof raw !== "string")
    ) {
      return { error: `${label} es obligatorio y debe ser numérico.` } as const;
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > max) {
      return { error: `${label} debe ser un número entre 0 y ${max}.` } as const;
    }
    numbers[key] = value.toFixed(2);
  }
  const optionalNumberFields = [
    ["pagoAguaPorcentaje", "Pago agua %", 100, 0],
    ["montoJardineria", "Jardinería", 1_000_000_000_000, 0],
    ["impuestoRentaPorcentaje", "Impuesto a la renta %", 100, 5],
    ["letreroAltoCm", "Alto del letrero", 10_000_000, 0],
    ["letreroAnchoCm", "Ancho del letrero", 10_000_000, 0],
    ["letreroProfundidadCm", "Profundidad del letrero", 10_000_000, 0],
  ] as const;
  const optionalNumbers: Record<(typeof optionalNumberFields)[number][0], string> = {
    pagoAguaPorcentaje: "0.00",
    montoJardineria: "0.00",
    impuestoRentaPorcentaje: "5.00",
    letreroAltoCm: "0.00",
    letreroAnchoCm: "0.00",
    letreroProfundidadCm: "0.00",
  };
  for (const [key, label, max, fallback] of optionalNumberFields) {
    const raw = input[key];
    if (
      raw === null ||
      raw === undefined ||
      (typeof raw === "string" && raw.trim() === "")
    ) {
      optionalNumbers[key] = fallback.toFixed(2);
      continue;
    }
    if (typeof raw !== "number" && typeof raw !== "string") {
      return { error: `${label} debe ser numérico.` } as const;
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > max) {
      return { error: `${label} debe ser un número entre 0 y ${max}.` } as const;
    }
    optionalNumbers[key] = value.toFixed(2);
  }
  const servicios =
    typeof input.servicios === "string" ? input.servicios.trim() : "";
  if (servicios.length > 2000) {
    return { error: "Servicios no puede superar 2000 caracteres." } as const;
  }
  return {
    value: {
      codigo,
      numero,
      sede,
      nombre,
      areaM2: numbers.areaM2,
      precioAlquiler: numbers.precioAlquiler,
      garantia: numbers.garantia,
      mantenimiento: numbers.mantenimiento,
      servicios,
      pagoLuzPorcentaje: numbers.pagoLuzPorcentaje,
      ...optionalNumbers,
    },
  } as const;
}
