import { ActivityAction, type ActivityEvent, type ActivityModule } from "./events";

/** Filtros para consultar la actividad global (Fase 5). */
export interface ActivityFilter {
  userId?: string;
  action?: string;
  module?: ActivityModule | string;
  entityType?: string;
  entityId?: string;
  result?: string;
  /** ISO desde / hasta (filtro de fecha). */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Item de actividad con la identidad del usuario resuelta (nombre). */
export type ActivityListItem = ActivityEvent & {
  userName?: string | null;
};

/** Puerto de lectura de actividad. El dominio no depende de la infraestructura. */
export interface ActivityRepository {
  find(filter: ActivityFilter): Promise<ActivityListItem[]>;
  count(filter: ActivityFilter): Promise<number>;
  findRecent(limit?: number): Promise<ActivityListItem[]>;
}

/** Devuelve las acciones predefinidas soportadas por el filtro (para la UI). */
export function activityActionCatalog(): string[] {
  return Object.values(ActivityAction);
}

/** Etiquetas en español para la UI de actividad y auditoría. */
export function activityActionLabels(): Record<string, string> {
  return {
    LOGIN: "Inicio de sesión",
    LOGOUT: "Cierre de sesión",
    USER_CREATED: "Usuario creado",
    USER_UPDATED: "Usuario actualizado",
    CLIENT_CREATED: "Cliente creado",
    CLIENT_UPDATED: "Cliente actualizado",
    DEPARTMENT_CREATED: "Departamento creado",
    DEPARTMENT_UPDATED: "Departamento actualizado",
    PERMISSION_DENIED: "Permiso denegado",
    TEMPLATE_CREATED: "Plantilla creada",
    TEMPLATE_VERSION_PUBLISHED: "Versión de plantilla publicada",
    CLAUSE_CREATED: "Cláusula creada",
    CLAUSE_VERSION_PUBLISHED: "Versión de cláusula publicada",
    ANNEX_CREATED: "Anexo creado",
    ANNEX_VERSION_PUBLISHED: "Versión de anexo publicada",
    DOCUMENT_GENERATION_REQUESTED: "Generación de documento solicitada",
    DOCUMENT_GENERATED: "Documento generado",
    DOCUMENT_GENERATION_FAILED: "Fallo al generar documento",
    DOCUMENT_DOWNLOADED: "Documento descargado",
    CONTRACT_CREATED: "Contrato creado",
    CONTRACT_UPDATED: "Contrato actualizado",
    CONTRACT_EMISSION_REQUESTED: "Emisión solicitada",
    CONTRACT_EMITTED: "Contrato emitido",
    CONTRACT_CANCELLED: "Contrato cancelado",
    CONTRACT_RESOLVED: "Contrato resuelto",
    CONTRACT_RENEWED: "Contrato renovado",
    CONTRACT_SIGNATURE_REQUESTED: "Firma solicitada",
    CONTRACT_SIGNED: "Contrato firmado",
    SNAPSHOT_CREATED: "Instantánea generada",
  };
}

export class ActivityService {
  constructor(private readonly repo: ActivityRepository) {}

  async list(filter: ActivityFilter): Promise<ActivityListItem[]> {
    return this.repo.find(filter);
  }

  async count(filter: ActivityFilter): Promise<number> {
    return this.repo.count(filter);
  }

  async recent(limit?: number): Promise<ActivityListItem[]> {
    return this.repo.findRecent(limit ?? 20);
  }
}