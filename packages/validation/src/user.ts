import { z } from "zod";
import { UserRole } from "@contract/domain/rbac";

export const userRoleSchema = z.nativeEnum(UserRole);

export const createUserSchema = z.object({
  email: z.string().email("El email no es válido"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  role: userRoleSchema,
  active: z.boolean().default(true),
});

export const updateUserSchema = createUserSchema.partial();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;