export const ActivityAction = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  CLIENT_CREATED: "CLIENT_CREATED",
  CLIENT_UPDATED: "CLIENT_UPDATED",
  DEPARTMENT_CREATED: "DEPARTMENT_CREATED",
  DEPARTMENT_UPDATED: "DEPARTMENT_UPDATED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  TEMPLATE_CREATED: "TEMPLATE_CREATED",
  TEMPLATE_VERSION_PUBLISHED: "TEMPLATE_VERSION_PUBLISHED",
  CLAUSE_CREATED: "CLAUSE_CREATED",
  CLAUSE_VERSION_PUBLISHED: "CLAUSE_VERSION_PUBLISHED",
  ANNEX_CREATED: "ANNEX_CREATED",
  ANNEX_VERSION_PUBLISHED: "ANNEX_VERSION_PUBLISHED",
  DOCUMENT_GENERATION_REQUESTED: "DOCUMENT_GENERATION_REQUESTED",
  DOCUMENT_GENERATED: "DOCUMENT_GENERATED",
  DOCUMENT_GENERATION_FAILED: "DOCUMENT_GENERATION_FAILED",
  DOCUMENT_DOWNLOADED: "DOCUMENT_DOWNLOADED",
  CONTRACT_CREATED: "CONTRACT_CREATED",
  CONTRACT_UPDATED: "CONTRACT_UPDATED",
  CONTRACT_EMISSION_REQUESTED: "CONTRACT_EMISSION_REQUESTED",
  CONTRACT_EMITTED: "CONTRACT_EMITTED",
  CONTRACT_CANCELLED: "CONTRACT_CANCELLED",
  CONTRACT_RESOLVED: "CONTRACT_RESOLVED",
  CONTRACT_RENEWED: "CONTRACT_RENEWED",
  CONTRACT_SIGNATURE_REQUESTED: "CONTRACT_SIGNATURE_REQUESTED",
  CONTRACT_SIGNED: "CONTRACT_SIGNED",
  SNAPSHOT_CREATED: "SNAPSHOT_CREATED",
} as const;

export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

export const ActivityModule = {
  AUTH: "AUTH",
  USERS: "USERS",
  CLIENTS: "CLIENTS",
  DEPARTMENTS: "DEPARTMENTS",
  TEMPLATES: "TEMPLATES",
  CLAUSES: "CLAUSES",
  ANNEXES: "ANNEXES",
  CONTRACTS: "CONTRACTS",
  DOCUMENTS: "DOCUMENTS",
} as const;

export type ActivityModule = (typeof ActivityModule)[keyof typeof ActivityModule];

export const ActivityResult = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  DENIED: "DENIED",
} as const;

export type ActivityResult = (typeof ActivityResult)[keyof typeof ActivityResult];

export interface ActivityEvent {
  id: string;
  timestamp: Date;
  userId?: string | null;
  actorType: string;
  action: ActivityAction | string;
  module: ActivityModule | string;
  entityType: string;
  entityId?: string | null;
  result?: ActivityResult | string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEvent {
  id: string;
  usuario: string;
  fecha: Date;
  accion: ActivityAction | string;
  entidad: string;
  estadoAnterior?: Record<string, unknown> | null;
  estadoNuevo?: Record<string, unknown> | null;
  resultado?: ActivityResult | string;
  metadataSegura?: Record<string, unknown> | null;
}