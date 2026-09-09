/** Definición declarativa de un mapeo de campo externo → campo interno. */
export interface FieldMapping {
  source: string;
  target: string;
  transform?: (raw: unknown) => unknown;
}

export interface MappingRule {
  /** Expresión de entrada, p.ej. "data.empleado.nombre". */
  inputPath: string;
  /** Nombre del campo interno resultante. */
  outputName: string;
  /** Función opcional de transformación/normalización. */
  transform?: (raw: unknown) => unknown;
}

export interface MappingConfig {
  rules: MappingRule[];
}

/**
 * Normalización + mapeo de un payload externo a un input interno.
 *
 * - Los datos inválidos nunca se traducen silenciosamente a un contrato emitido:
 *   si una ruta requerida no existe o una validación falla, se devuelve `errors`.
 * - Cambios simples del formulario/proveedor se resuelven en el mapping, sin
 *   tocar el dominio.
 */
export function mapFields(
  payload: Record<string, unknown>,
  config: MappingConfig,
  requiredOutputs: string[] = []
): { mapped: Record<string, unknown>; errors: string[] } {
  const mapped: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const rule of config.rules) {
    const raw = readPath(payload, rule.inputPath);
    if (raw === undefined || raw === null) {
      if (requiredOutputs.includes(rule.outputName)) {
        errors.push(`Campo requerido ausente: ${rule.inputPath}`);
      }
      continue;
    }
    mapped[rule.outputName] = rule.transform
      ? runTransform(rule.transform, raw, rule.outputName, errors)
      : raw;
  }

  return { mapped, errors };
}

function readPath(payload: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

function runTransform(
  transform: (raw: unknown) => unknown,
  raw: unknown,
  field: string,
  errors: string[]
): unknown {
  try {
    const result = transform(raw);
    if (Array.isArray(result)) throw new Error("transform inválida");
    return result;
  } catch {
    errors.push(`Transformación falló en: ${field}`);
    return raw;
  }
}

/** Valida que el Input normalizado cumpla contratos básicos de negocio. */
export function validateInput(
  input: Record<string, unknown>,
  requiredFields: string[],
  formatNumber: string[] = []
): string[] {
  const errors: string[] = [];
  for (const f of requiredFields) {
    if (input[f] === undefined || input[f] === null || String(input[f]).trim() === "") {
      errors.push(`Campo requerido: ${f}`);
    }
  }
  for (const f of formatNumber) {
    const v = input[f];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !/^\d{1,13}(\.\d{1,2})?$/.test(v)) {
      errors.push(`Monto inválido en: ${f}`);
    }
  }
  return errors;
}

/**
 * Convierte un payload externo en un input normalizado de contrato, aplicando
 * mapeo + validación. Retorna `{ input, errors }`. Si `errors.length > 0` el
 * llamador NO debe emitir; el resultado va a revisión/corrección.
 */
export function normalizeInbound(
  payload: Record<string, unknown>,
  mapping: MappingConfig,
  requiredOutputs: string[]
): { input: Record<string, unknown>; errors: string[] } {
  const { mapped, errors } = mapFields(payload, mapping, requiredOutputs);
  return { input: mapped, errors };
}