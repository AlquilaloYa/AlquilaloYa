import { createHash } from "node:crypto";

/** Calcula el sha256 hex de unos bytes (integridad de documentos, Fase 4). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const sha256FromFile = sha256Hex;
