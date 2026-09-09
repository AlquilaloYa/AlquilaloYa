import type { ContractSnapshot } from "@contract/domain/snapshot";
import { renderContractHtml } from "./render-contract-html";
import { renderAdendaHtml } from "./render-adenda-html";

export interface PdfResult {
  bytes: Buffer;
  mimeType: "application/pdf";
  filename: string;
}

async function pdfFromHtml(html: string, filename: string): Promise<PdfResult> {
  const puppeteer = (await import("puppeteer-core")).default;
  const isVercel = process.env.VERCEL === "1";

  let browser;
  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const remote =
      process.env.CHROMIUM_REMOTE_EXEC_PATH ??
      "https://github.com/Sparticuz/chromium/releases/download/v152.0.0/chromium-v152.0.0-pack.x64.tar";
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(remote),
      args: chromium.args,
      headless: true,
    });
  } else {
    browser = await puppeteer.launch({ channel: "chrome", headless: true });
  }
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "24mm", bottom: "24mm", left: "20mm", right: "20mm" },
    });
    return {
      bytes: Buffer.from(bytes),
      mimeType: "application/pdf",
      filename,
    };
  } finally {
    await browser.close();
  }
}

export async function generateHtmlPdf(html: string, filename: string): Promise<PdfResult> {
  return pdfFromHtml(html, filename);
}

/**
 * Genera el PDF del contrato usando puppeteer-core:
 * - en Vercel, Chromium serverless de @sparticuz/chromium;
 * - en local/servidor, Chrome del sistema (channel: "chrome").
 * Si se provee templateHtml, lo usa como base; de lo contrario formato genérico.
 */
export async function generateContractPdf(
  snapshot: ContractSnapshot,
  templateHtml?: string | null
): Promise<PdfResult> {
  return pdfFromHtml(
    renderContractHtml(snapshot, templateHtml),
    `${snapshot.codigoContrato || "contrato"}.pdf`
  );
}

/** Genera el PDF de una adenda a partir de su snapshot. */
export async function generateAdendaPdf(
  snapshot: ContractSnapshot
): Promise<PdfResult> {
  return pdfFromHtml(
    renderAdendaHtml(snapshot),
    `${snapshot.codigoContrato || "adenda"}.pdf`
  );
}