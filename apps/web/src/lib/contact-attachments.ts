export const MAX_CONTACT_ATTACHMENTS_BYTES = 3 * 1024 * 1024;
export const MAX_CONTACT_IMAGE_BYTES = 1024 * 1024;
export const MAX_CONTACT_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function getAttachmentBytes(dataUrl: string): number | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !ALLOWED_ATTACHMENT_TYPES.has(match[1]!.toLowerCase())) {
    return null;
  }

  const base64 = match[2]!;
  if (base64.length % 4 !== 0) return null;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

export function validateContactAttachments(
  attachments: unknown[],
): string | null {
  let totalBytes = 0;

  for (const attachment of attachments) {
    if (
      !attachment ||
      typeof attachment !== "object" ||
      !("dataUrl" in attachment) ||
      typeof attachment.dataUrl !== "string"
    ) {
      return "Uno de los archivos adjuntos no es válido.";
    }

    const bytes = getAttachmentBytes(attachment.dataUrl);
    if (bytes === null || bytes === 0) {
      return "Los adjuntos deben ser archivos PDF, JPG, PNG o WebP válidos.";
    }
    const mimeType = /^data:([^;,]+)/.exec(attachment.dataUrl)?.[1]?.toLowerCase();
    if (mimeType?.startsWith("image/") && bytes > MAX_CONTACT_IMAGE_BYTES) {
      return "Cada imagen debe pesar como máximo 1 MB.";
    }
    totalBytes += bytes;
    if (totalBytes > MAX_CONTACT_ATTACHMENTS_BYTES) {
      return "El límite total de archivos por contacto es 3 MB. Reduce las imágenes o quita archivos antes de guardar.";
    }
  }

  return null;
}
