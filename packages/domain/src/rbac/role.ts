export const UserRole = {
  ADMIN: "ADMIN",
  DEVELOPER: "DEVELOPER",
  RRHH: "RRHH",
  ASISTENTE_ADMINISTRATIVO: "ASISTENTE_ADMINISTRATIVO",
  MARKETING: "MARKETING",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES: UserRole[] = Object.values(UserRole);