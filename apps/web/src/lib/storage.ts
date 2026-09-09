/**
 * Adaptador de Supabase Storage (REST) para documentos PDF del sistema.
 * Fase 4: los PDFs se persisten en un bucket privado; el server usa la
 * clave service_role y el bucket NO es público (sin policies de anon).
 *
 * Storage key: "{contratoId}/{tipo}/{filename}" (p. ej.
 *   "6f4d.../CONTRATO_PDF/ANG156-L1.pdf", "6f4d.../ADENDA/ANG156-L1-ADD-1.pdf").
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "contracts";

export class StorageError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

/** Indica si el storage está configurado (URL + service key). */
export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

async function storageFetch(path: string, init: RequestInit): Promise<Response> {
  if (!isStorageConfigured()) {
    throw new StorageError(
      "Storage no configurado: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
      500
    );
  }
  const res = await fetch(`${SUPABASE_URL}/storage/v1${path}`, {
    ...init,
    // Crítico en Next.js: sin esto, el Data Cache de la app cachea las
    // descargas GET y serviría bytes obsoletos tras un reemplazo del objeto.
    cache: "no-store",
    headers: {
      // Con las claves nuevas (sb_secret_/sb_publishable_) Storage exige el
      // header apikey además del Bearer; con JWT legacy es redundante pero válido.
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  return res;
}

export interface StoredObject {
  key: string;
  sizeBytes: number;
  sha256: string;
}

/** Sube (upsert) un objeto al bucket privado. */
export async function uploadObject(
  key: string,
  bytes: Uint8Array,
  contentType = "application/pdf"
): Promise<StoredObject> {
  const res = await storageFetch(`/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "x-upsert": "true",
      // Sin caché CDN: la integridad (sha256) se verifica contra los bytes
      // vivos; un objeto cacheado haría la verificación no confiable.
      "cache-control": "no-store",
    },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new StorageError(
      `Storage upload falló (${res.status}): ${detail.slice(0, 300)}`,
      res.status
    );
  }
  const { sha256FromFile } = await import("./hash");
  return { key, sizeBytes: bytes.byteLength, sha256: sha256FromFile(bytes) };
}

/** Descarga un objeto del bucket privado. Lanza StorageError si no existe. */
export async function downloadObject(key: string): Promise<Uint8Array> {
  const res = await storageFetch(`/object/${BUCKET}/${key}`, {
    method: "GET",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new StorageError(
      `Storage download falló (${res.status}): ${detail.slice(0, 300)}`,
      res.status
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}
