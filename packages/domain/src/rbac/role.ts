export const UserRole = {
  ADMIN: "ADMIN",
  OPERADOR: "OPERADOR",
  SUPERVISOR: "SUPERVISOR",
  AUDITOR: "AUDITOR",
  FIRMANTE: "FIRMANTE",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES: UserRole[] = Object.values(UserRole);