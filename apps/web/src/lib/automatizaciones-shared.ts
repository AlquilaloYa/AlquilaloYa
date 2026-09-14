export type EventoRegla = "LEAD_VENCE" | "LEAD_INACTIVO" | "CONV_SIN_RESPUESTA";

export const EVENTOS: Record<EventoRegla, { label: string; param: string; paramLabel: string; unidad: "dias" | "horas" }> = {
  LEAD_VENCE: { label: "Lead con vencimiento próximo", param: "dias", paramLabel: "Días de anticipación", unidad: "dias" },
  LEAD_INACTIVO: { label: "Lead inactivo (sin actividad)", param: "dias", paramLabel: "Días sin actividad", unidad: "dias" },
  CONV_SIN_RESPUESTA: { label: "Conversación sin respuesta", param: "horas", paramLabel: "Horas sin responder", unidad: "horas" },
};

export const EVENTO_DESC: Record<EventoRegla, string> = {
  LEAD_VENCE: "Crea tarea cuando un lead está por vencer",
  LEAD_INACTIVO: "Crea tarea cuando un lead lleva N días sin actividad",
  CONV_SIN_RESPUESTA: "Crea tarea si una conversación pasa N horas sin responder",
};

export const PARAM_KEY: Record<EventoRegla, "dias" | "horas"> = {
  LEAD_VENCE: "dias",
  LEAD_INACTIVO: "dias",
  CONV_SIN_RESPUESTA: "horas",
};
