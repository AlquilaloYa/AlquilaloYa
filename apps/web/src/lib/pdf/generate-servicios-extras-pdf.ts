import { generateHtmlPdf } from "./generate-pdf";
import { renderServiciosExtrasHtml } from "./render-servicios-extras-html";
import { sha256Hex } from "@/lib/hash";
import { isStorageConfigured, uploadObject } from "@/lib/storage";

export interface ServiciosExtrasPdfResult {
  bytes: Uint8Array;
  filename: string;
  storageKey: string | null;
  sha256: string;
}

type Registro = Record<string, unknown>;

function asRegistro(value: unknown): Registro {
  return value && typeof value === "object" ? (value as Registro) : {};
}

/**
 * Genera el PDF de "PAGOS EXTRAS POR CONEXIÓN Y MEDIO DE CARGA" y lo sube al
 * bucket privado (si el storage está configurado). Reutiliza el pipeline de
 * puppeteer de `generateHtmlPdf`, el mismo de contratos y adendas.
 */
export async function generateServiciosExtrasPdf(
  servicio: unknown,
  contract?: unknown,
  cliente?: unknown,
  departamento?: unknown,
): Promise<ServiciosExtrasPdfResult> {
  const s = asRegistro(servicio);
  const c = asRegistro(contract);
  const html = await renderServiciosExtrasHtml(
    s,
    c,
    asRegistro(cliente),
    asRegistro(departamento),
  );

  const codigo = String(s.codigoContrato ?? c.codigoContrato ?? "servicios-extras");
  const filename = `servicios-extras-${codigo}-${Date.now()}.pdf`;
  const pdf = await generateHtmlPdf(html, filename);
  const bytes = new Uint8Array(pdf.bytes);
  const sha256 = sha256Hex(bytes);

  let storageKey: string | null = null;
  if (isStorageConfigured()) {
    try {
      const key = `contratos/${codigo}/SERVICIOS_EXTRAS/${filename}`;
      const stored = await uploadObject(key, bytes);
      storageKey = stored.key;
    } catch (error) {
      console.error("No se pudo subir el PDF de servicios extras", error);
    }
  }

  return { bytes, filename, storageKey, sha256 };
}
