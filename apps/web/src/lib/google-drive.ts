import { env } from "@contract/config/env";
import { getValidAccessToken, tieneScopeConcedido } from "@/lib/google-calendar";

const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const CARPETA_ERP = "AlquilaYa ERP";

export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink: string;
}

/** El usuario conectó Google pero sin otorgar el permiso de Google Drive. */
export class DrivePermisoInsuficiente extends Error {}

const MENSAJE_RECONECTAR =
  "Tu cuenta de Google no tiene autorizado Google Drive. " +
  "Vuelve a conectar Google en /agenda para otorgar el permiso de Drive y reintenta la exportación.";

/** Detecta el 403 de Google por scopes insuficientes y lanza un error claro. */
function revisarRespuesta(res: Response, detalle: string, contexto: string): void {
  const sinScope =
    res.status === 403 &&
    /insufficient authentication scopes|insufficient permission|insufficientpermissions/i.test(detalle);
  if (sinScope) throw new DrivePermisoInsuficiente(MENSAJE_RECONECTAR);
  if (!res.ok) {
    throw new Error(`Drive: no se pudo ${contexto} (${res.status}): ${detalle.slice(0, 300)}`);
  }
}

/** Busca (y crea si falta) la carpeta raíz "AlquilaYa ERP" del usuario. */
async function garantizarCarpeta(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${CARPETA_ERP}' and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const search = await fetch(`${DRIVE_API}?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (search.ok) {
    const body = (await search.json()) as { files?: { id: string }[] };
    if (body.files?.[0]?.id) return body.files[0].id;
  }

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ name: CARPETA_ERP, mimeType: FOLDER_MIME })], { type: "application/json" })
  );
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    revisarRespuesta(res, detail, "crear la carpeta");
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error("Drive: la API no devolvió id de carpeta");
  return body.id;
}

/**
 * Sube un archivo a la carpeta "AlquilaYa ERP" del Google Drive del usuario
 * conectado en /agenda. Devuelve id, nombre y enlace, o lanza con error claro.
 */
export async function subirArchivoADrive(input: {
  userEmail: string;
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
}): Promise<DriveUploadResult> {
  const { token, scopes } = await getValidAccessToken(input.userEmail);
  if (!tieneScopeConcedido(scopes, env.GOOGLE_DRIVE_SCOPE)) {
    throw new DrivePermisoInsuficiente(MENSAJE_RECONECTAR);
  }
  const parentId = await garantizarCarpeta(token);

  const form = new FormData();
  form.append(
    "metadata",
    new Blob(
      [JSON.stringify({ name: input.name, mimeType: input.mimeType ?? "application/pdf", parents: [parentId] })],
      { type: "application/json" }
    )
  );
  form.append(
    "file",
    new Blob([input.bytes as BlobPart], { type: input.mimeType ?? "application/pdf" }),
    input.name
  );

  const res = await fetch(
    `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    revisarRespuesta(res, detail, "subir el archivo");
  }
  const body = (await res.json()) as DriveUploadResult;
  if (!body.id) throw new Error("Drive: la API no devolvió id del archivo");
  return { id: body.id, name: body.name, webViewLink: body.webViewLink ?? "" };
}

/** Saca el filename de un storageKey del bucket (último segmento). */
export function nombreDeStorageKey(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] ?? key;
}