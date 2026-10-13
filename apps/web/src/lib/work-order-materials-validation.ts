const MAX_COST_CENTS = 999_999_999_999n;
const MAX_QUANTITY_MILLI = 999_999_999_999n;
const MAX_TOTAL_COST_CENTS = 99_999_999_999_999n;

export type WorkOrderMaterialInput = {
  material: string;
  quantity: string;
  unit: string;
  unitCost: string;
  totalCost: string;
  observations: string;
};

type ParseResult =
  | { data: WorkOrderMaterialInput; error?: never }
  | { data?: never; error: string };

function scaledInteger(value: unknown, scale: number): bigint | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const input = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match || (match[2]?.length ?? 0) > scale) return null;
  const fraction = (match[2] ?? "").padEnd(scale, "0");
  return BigInt(`${match[1]}${fraction}`);
}

function formatScaled(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
}

export function parseWorkOrderMaterial(value: unknown): ParseResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "El cuerpo debe ser un objeto JSON" };
  }

  const body = value as Record<string, unknown>;
  const material =
    typeof body.material === "string" ? body.material.trim() : "";
  const unit = typeof body.unit === "string" ? body.unit.trim() : "";
  const observations =
    body.observations === undefined
      ? ""
      : typeof body.observations === "string"
        ? body.observations.trim()
        : null;
  const quantityMilli = scaledInteger(body.quantity, 3);
  const unitCostCents = scaledInteger(body.unitCost, 2);

  if (
    !material ||
    material.length > 255 ||
    !unit ||
    unit.length > 40 ||
    observations === null ||
    observations.length > 2000 ||
    quantityMilli === null ||
    quantityMilli <= 0n ||
    quantityMilli > MAX_QUANTITY_MILLI ||
    unitCostCents === null ||
    unitCostCents > MAX_COST_CENTS
  ) {
    return {
      error:
        "Material, cantidad positiva, unidad, costo válido y observaciones de hasta 2000 caracteres son obligatorios",
    };
  }

  const totalCostCents = (quantityMilli * unitCostCents + 500n) / 1000n;
  if (totalCostCents > MAX_TOTAL_COST_CENTS) {
    return { error: "El costo total supera el límite permitido" };
  }

  return {
    data: {
      material,
      quantity: formatScaled(quantityMilli, 3),
      unit,
      unitCost: formatScaled(unitCostCents, 2),
      totalCost: formatScaled(totalCostCents, 2),
      observations,
    },
  };
}
