import { z } from "zod";

export const departmentSchema = z.object({
  codigo: z.string().min(1, "El código es obligatorio"),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  numero: z.string().min(1, "El número es obligatorio"),
  tipo: z.string().default("Departamento"),
  personaPago: z.string().min(2, "La persona de pago es obligatoria"),
  piso: z.number().min(1).max(20),
  precio: z.string().regex(/^\d+(\.\d{1,2})?$/, "Precio inválido"),
  mantenimiento: z.string().regex(/^\d+(\.\d{1,2})?$/, "Mantenimiento inválido"),
  servicios: z.string().min(2, "Los servicios son obligatorios"),
  activo: z.boolean().default(true),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;
