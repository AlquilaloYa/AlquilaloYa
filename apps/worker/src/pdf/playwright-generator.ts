import { createHash } from "node:crypto";
import type {
  DocumentGenerator,
  DocumentGenerationInput,
  GeneratedDocument,
} from "@contract/domain/document";
import { renderContractHtml } from "./render-contract-html";

/**
 * Generador de documentos usando Playwright + Chromium.
 * - Usa el Chrome del sistema (`channel: "chrome"`) para evitar descargar Chromium.
 * - El PDF se renderiza a partir del snapshot (datos congelados).
 * - Calcula SHA-256 sobre los bytes exactos generados (integridad, no firma).
 */
export class PlaywrightDocumentGenerator implements DocumentGenerator {
  constructor(private readonly channel: "chrome" = "chrome") {}

  async generate(input: DocumentGenerationInput): Promise<GeneratedDocument> {
    const { chromium } = await import("playwright");

    const html = renderContractHtml(input.snapshot);
    const browser = await chromium.launch({ channel: this.channel });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const bytes = await page.pdf({ format: "A4", printBackground: true });

      const sha256 = createHash("sha256").update(bytes).digest("hex");
      return {
        bytes,
        mimeType: "application/pdf",
        filename: `${input.snapshot.codigoContrato || "contrato"}.pdf`,
        sha256,
      };
    } finally {
      await browser.close();
    }
  }
}