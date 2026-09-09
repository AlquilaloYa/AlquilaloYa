import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface NotarialAttachment {
  nombre: string;
  tipo?: string;
  dataUrl: string;
}

const A4: [number, number] = [595.28, 841.89];

function dataUrlToParts(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)(?:;base64)?,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  const mime = (m[1] ?? "").toLowerCase();
  try {
    const bytes = new Uint8Array(Buffer.from(m[2] ?? "", "base64"));
    if (bytes.byteLength === 0) return null;
    return { mime, bytes };
  } catch {
    return null;
  }
}

async function addImagePage(
  doc: PDFDocument,
  bytes: Uint8Array,
  mime: string,
  nombre: string
): Promise<void> {
  const page = doc.addPage(A4);
  let img;
  try {
    img = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    await addNotePage(doc, `Anexo no incrustable (${mime}): ${nombre}`);
    return;
  }
  const margin = 40;
  const maxW = A4[0] - margin * 2;
  const maxH = A4[1] - margin * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
}

async function addNotePage(doc: PDFDocument, text: string): Promise<void> {
  const page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text.slice(0, 120), {
    x: 48,
    y: A4[1] - 60,
    size: 11,
    font,
    color: rgb(0, 0, 0),
  });
}

/**
 * Compone el PDF de notaría: partes del PDF del contrato CONGELADO (bytes
 * verbatim) + anexa cada copia de DNI como página real (imagen → A4; PDF → sus
 * páginas). No modifica el archivo base.
 */
export async function buildNotarialPdf(
  contractPdfBytes: Uint8Array,
  attachments: NotarialAttachment[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(contractPdfBytes);
  for (const att of attachments) {
    const parts = att?.dataUrl ? dataUrlToParts(att.dataUrl) : null;
    if (!parts) {
      await addNotePage(doc, `Anexo de DNI ilegible: ${att?.nombre ?? ""}`);
      continue;
    }
    if (parts.mime === "application/pdf") {
      try {
        const sub = await PDFDocument.load(parts.bytes);
        const copied = await doc.copyPages(sub, sub.getPageIndices());
        copied.forEach((p) => doc.addPage(p));
      } catch {
        await addNotePage(doc, `No se pudo anexar PDF: ${att.nombre}`);
      }
    } else if (parts.mime === "image/png" || parts.mime === "image/jpeg") {
      await addImagePage(doc, parts.bytes, parts.mime, att.nombre);
    } else {
      await addNotePage(doc, `Anexo no soportado (${parts.mime}): ${att.nombre}`);
    }
  }
  return doc.save();
}
