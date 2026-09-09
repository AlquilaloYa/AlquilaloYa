import { UserRole } from "@contract/domain/rbac";

export interface AppUserSeed {
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Directorio de usuarios de la aplicación. Fuente única para:
 *  - la tabla `users` (roles, ver seed y create-app-users)
 *  - Supabase Auth (create-app-users)
 * Requiere que email coincida en ambas capas para que el login funcione.
 */
export const APP_USERS: AppUserSeed[] = [
  { email: "admin@sistema.com", name: "Andrea Admin", role: UserRole.ADMIN },
  { email: "operador@sistema.com", name: "Juan Operador", role: UserRole.OPERADOR },
  { email: "supervisor@sistema.com", name: "Sofia Supervisora", role: UserRole.SUPERVISOR },
  { email: "auditor@sistema.com", name: "Alicia Auditora", role: UserRole.AUDITOR },
  { email: "firmante@sistema.com", name: "Felipe Firmante", role: UserRole.FIRMANTE },
  { email: "maria.gomez@sistema.com", name: "Maria Gomez", role: UserRole.OPERADOR },
  { email: "carlos.rojas@sistema.com", name: "Carlos Rojas", role: UserRole.OPERADOR },
  { email: "lucia.mendez@sistema.com", name: "Lucia Mendez", role: UserRole.SUPERVISOR },
  { email: "pedro.sanchez@sistema.com", name: "Pedro Sanchez", role: UserRole.AUDITOR },
  { email: "ana.torres@sistema.com", name: "Ana Torres", role: UserRole.FIRMANTE },
];
