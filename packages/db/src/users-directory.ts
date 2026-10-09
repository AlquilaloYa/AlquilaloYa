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
  { email: "admin@sistema.com", name: "Harrison Developer", role: UserRole.DEVELOPER },
  { email: "operador@sistema.com", name: "Juan Asistente", role: UserRole.ASISTENTE_ADMINISTRATIVO },
  { email: "supervisor@sistema.com", name: "Sofia Marketing", role: UserRole.MARKETING },
  { email: "auditor@sistema.com", name: "Alicia Marketing", role: UserRole.MARKETING },
  { email: "firmante@sistema.com", name: "Felipe Asistente", role: UserRole.ASISTENTE_ADMINISTRATIVO },
  { email: "rrhh@sistema.com", name: "Rosa Recursos Humanos", role: UserRole.RRHH },
  { email: "maria.gomez@sistema.com", name: "Maria Gomez", role: UserRole.ASISTENTE_ADMINISTRATIVO },
  { email: "carlos.rojas@sistema.com", name: "Carlos Rojas", role: UserRole.ASISTENTE_ADMINISTRATIVO },
  { email: "lucia.mendez@sistema.com", name: "Lucia Marketing", role: UserRole.MARKETING },
  { email: "pedro.sanchez@sistema.com", name: "Pedro RRHH", role: UserRole.RRHH },
  { email: "ana.torres@sistema.com", name: "Ana Asistente", role: UserRole.ASISTENTE_ADMINISTRATIVO },
];
