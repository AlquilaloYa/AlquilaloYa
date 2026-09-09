export const ContractStatus = {
  BORRADOR: "BORRADOR",
  PENDIENTE_EMISION: "PENDIENTE_EMISION",
  EMITIDO: "EMITIDO",
  PENDIENTE_FIRMA: "PENDIENTE_FIRMA",
  FIRMADO: "FIRMADO",
  NOTARIADO: "NOTARIADO",
  RESUELTO: "RESUELTO",
  CANCELADO: "CANCELADO",
} as const;

export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const TemplateType = {
  PN_LARGO: "PN_LARGO",
  PN_CORTO: "PN_CORTO",
  PJ_LARGO: "PJ_LARGO",
  PJ_CORTO: "PJ_CORTO",
} as const;

export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];

export const ContractModality = {
  ARRENDAMIENTO: "ARRENDAMIENTO",
  COMPRAVENTA: "COMPRAVENTA",
} as const;

export type ContractModality = (typeof ContractModality)[keyof typeof ContractModality];