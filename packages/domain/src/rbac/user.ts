import type { AuditableEntity, UUID } from "../common/index";
import type { UserRole } from "./role";

export interface User extends AuditableEntity {
  id: UUID;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export type CreateUserInput = Pick<User, "email" | "name" | "role"> &
  Partial<Pick<User, "active">>;
export type UpdateUserInput = Partial<Pick<User, "email" | "name" | "role" | "active">>;