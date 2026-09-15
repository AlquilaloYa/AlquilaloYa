import type { AuditableEntity, UUID } from "../common/index";
import type { PersonType } from "./person-type";

export interface Client extends AuditableEntity {
  id: UUID;
  nombres: string;
  apellidos?: string | null;
  documentoIdentidad: string;
  ruc?: string | null;
  tipoPersona: PersonType;
  email?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  nacionalidad?: string | null;
  activo: boolean;
}

export type CreateClientInput = Omit<Client, "id" | "createdAt" | "updatedAt">;
export type UpdateClientInput = Partial<CreateClientInput>;