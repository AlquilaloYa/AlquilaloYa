import { z } from "zod";
import { PersonType } from "@contract/domain/client";

export const personTypeSchema = z.nativeEnum(PersonType);

export const rucSchema = z
  .string()
  .regex(/^\d{11}$/, "El RUC debe tener 11 dígitos")
  .optional()
  .nullable();

export const clientSchemaBase = z.object({
  nombres: z
    .string()
    .min(2, "Los nombres deben tener al menos 2 caracteres")
    .max(255),
  apellidos: z
    .string()
    .min(2, "Los apellidos deben tener al menos 2 caracteres")
    .max(255)
    .optional()
    .nullable(),
  documentoIdentidad: z
    .string()
    .min(3, "El documento es obligatorio")
    .max(50),
  ruc: rucSchema,
  tipoPersona: personTypeSchema,
  email: z.string().email("El email no es válido"),
  telefono: z.string().min(7, "El teléfono no es válido"),
  activo: z.boolean().default(true),
});

export const clientSchema = clientSchemaBase.superRefine((data, ctx) => {
  const esJuridica = data.tipoPersona === PersonType.LEGAL;
  const rucVacio = !data.ruc || data.ruc.trim().length === 0;
  if (esJuridica && rucVacio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ruc"],
      message: "El RUC es obligatorio para persona jurídica",
    });
  }
});

export const createClientSchema = clientSchema;
export const updateClientSchema = clientSchemaBase.partial();

export type ClientInput = z.infer<typeof clientSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;