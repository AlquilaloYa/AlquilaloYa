import type { AuditEvent } from "./events";

/** Filtros para consultar la auditoría (Fase 5). */
export interface AuditFilter {
  usuario?: string;
  accion?: string;
  entidad?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Puerto de lectura de auditoría. Append-only: no hay escritura aquí. */
export interface AuditRepository {
  find(filter: AuditFilter): Promise<AuditEvent[]>;
  count(filter: AuditFilter): Promise<number>;
}

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async list(filter: AuditFilter): Promise<AuditEvent[]> {
    return this.repo.find(filter);
  }

  async count(filter: AuditFilter): Promise<number> {
    return this.repo.count(filter);
  }
}