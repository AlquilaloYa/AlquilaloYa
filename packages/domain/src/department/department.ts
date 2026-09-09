import type { AuditableEntity, UUID } from "../common/index";

export interface Department extends AuditableEntity {
  id: UUID;
  codigo: string;
  nombre: string;
  numero: string;
  tipo: string;
  personaPago: string;
  piso: number;
  precio: string;
  mantenimiento: string;
  servicios: string;
  activo: boolean;
}

export type CreateDepartmentInput = Omit<Department, "id" | "createdAt" | "updatedAt">;
