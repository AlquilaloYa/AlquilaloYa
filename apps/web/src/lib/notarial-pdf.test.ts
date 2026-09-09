import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildNotarialPdf } from "./notarial-pdf";

// PNG 1x1 válido (base64)
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function basePdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  const d = await PDFDocument.load(bytes);
  return d.getPageCount();
}

describe("buildNotarialPdf", () => {
  it("mantiene el PDF base intacto cuando no hay DNI", async () => {
    const out = await buildNotarialPdf(await basePdf(3), []);
    expect(await pageCount(out)).toBe(3);
  });

  it("anexa la imagen del DNI como página real (sin pérdida)", async () => {
    const out = await buildNotarialPdf(await basePdf(3), [
      { nombre: "dni.png", tipo: "image/png", dataUrl: PNG_1x1 },
    ]);
    expect(await pageCount(out)).toBe(4); // 3 contrato + 1 DNI
  });

  it("anexa varias copias de DNI", async () => {
    const out = await buildNotarialPdf(await basePdf(2), [
      { nombre: "a.png", tipo: "image/png", dataUrl: PNG_1x1 },
      { nombre: "b.png", tipo: "image/png", dataUrl: PNG_1x1 },
    ]);
    expect(await pageCount(out)).toBe(4);
  });

  it("no pierde un anexo ilegible (lo deja como nota)", async () => {
    const out = await buildNotarialPdf(await basePdf(1), [
      { nombre: "roto.png", tipo: "image/png", dataUrl: "data:image/png;base64,@@@" },
    ]);
    expect(await pageCount(out)).toBe(2);
  });

  it("rechaza base corrupto (PDFDocument.load lanza)", async () => {
    await expect(buildNotarialPdf(new Uint8Array([1, 2, 3]), [])).rejects.toBeTruthy();
  });
});
