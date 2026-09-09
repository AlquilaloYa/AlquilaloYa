export interface SeparacionRecord {
  departamentoId: string;
  contactoId: string;
  montoSeparacion: number;
  tipoSeparacion: "500" | "TOTAL" | "FLUCTUANTE";
  garantiaExtendida: boolean;
  baucherGarantiaExtendida?: string | null;
  fechaGarantiaExtendida?: string | null;
  fechaSeparacion: string;
  diasTiempo?: number;
  fechaLimiteManual?: string;
  fechaLimite48h: string;
  fechaLimite120h: string;
  fechaLimite168h: string;
  baucherSeparacion: string;
  estado: "SEPARADO" | "GARANTIA_COMPLETADA" | "INACTIVO_48H" | "INACTIVO_168H" | "PERDER_TODO" | "CONTRATO_PREVIO" | "CONTRATO_REAL";
}

export const SEPARACION_STORAGE_KEY = "sc_separaciones_flow_v1";

export function getTipoSeparacion(sep: SeparacionRecord): "500" | "TOTAL" | "FLUCTUANTE" {
  if (sep.tipoSeparacion) return sep.tipoSeparacion;
  return sep.montoSeparacion === 500 ? "500" : "TOTAL";
}

export function getFechaLimiteActiva(sep: SeparacionRecord): string {
  if (sep.fechaLimiteManual) return sep.fechaLimiteManual;
  if (sep.diasTiempo && sep.fechaSeparacion) {
    return new Date(new Date(sep.fechaSeparacion).getTime() + sep.diasTiempo * 86400000).toISOString();
  }
  if (getTipoSeparacion(sep) === "TOTAL") {
    return sep.fechaLimite168h;
  }
  if (sep.garantiaExtendida) {
    return sep.fechaLimite168h;
  }
  return sep.fechaLimite48h;
}

export function getEstadoSeparacion(sep: SeparacionRecord): string {
  const ahora = Date.now();
  if (sep.estado === "PERDER_TODO" || sep.estado === "CONTRATO_REAL") return sep.estado;
  if (sep.estado === "CONTRATO_PREVIO") return "CONTRATO_PREVIO";
  if (sep.estado === "GARANTIA_COMPLETADA") return "GARANTIA_COMPLETADA";
  const fechaLimite = new Date(getFechaLimiteActiva(sep)).getTime();
  if (ahora > fechaLimite) {
    if (["500", "FLUCTUANTE"].includes(getTipoSeparacion(sep)) && !sep.garantiaExtendida) return "PERDER_TODO";
    return "INACTIVO_168H";
  }
  return "SEPARADO";
}

export function obtenerTiempoRestante(sep: SeparacionRecord): { texto: string; color: string } {
  if (sep.estado === "PERDER_TODO") return { texto: "DINERO PERDIDO", color: "text-red-600" };
  if (sep.estado === "CONTRATO_REAL") return { texto: "CONTRATO ACTIVO", color: "text-green-600" };

  const fechaLimite = getFechaLimiteActiva(sep);
  const diff = new Date(fechaLimite).getTime() - Date.now();
  if (diff <= 0) return { texto: "VENCIDO", color: "text-red-600" };

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const urgent = d < 1;
  return {
    texto: `${d}d ${h}h ${m}m`,
    color: urgent ? "text-red-600" : "text-amber-600",
  };
}

export function leerSeparaciones(): SeparacionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEPARACION_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SeparacionRecord[];
  } catch {
    return [];
  }
}
