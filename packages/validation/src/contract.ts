import { z } from "zod";
import { ContractModality, TemplateType } from "@contract/domain/contract";

export const templateTypeSchema = z.nativeEnum(TemplateType);
export const modalitySchema = z.nativeEnum(ContractModality);

/** Monto en formato NUMERIC(15,2): número decimal hasta 13 enteros y 2 decimales. */
export const moneySchema = z
  .string()
  .regex(/^\d{1,13}(\.\d{1,2})?$/, "Monto inválido (máx. 13 enteros, 2 decimales)");

export const contractSchema = z
  .object({
    codigoContrato: z.string().min(3, "El código es obligatorio"),
    clienteId: z.string().uuid("El cliente es obligatorio"),
    departamentoId: z.string().uuid("El departamento es obligatorio"),
    plantillaVersionId: z.string().uuid("Debe seleccionar una versión de plantilla"),
    montoCanonMensual: moneySchema,
    depositoGarantia: moneySchema.optional(),
    fechaInicio: z.string().date("Fecha de inicio inválida"),
    fechaFin: z.string().date("Fecha de fin inválida"),
  })
  .refine((data) => data.fechaFin > data.fechaInicio, {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["fechaFin"],
  });

export type ContractInput = z.infer<typeof contractSchema>;

export const transitionSchema = z.object({
  contratoId: z.string().uuid(),
  estadoDestino: z.string(),
});