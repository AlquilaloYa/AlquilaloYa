import { Worker, type Job } from "bullmq";
import { env } from "@contract/config/env";
import { DocumentService } from "@contract/domain/document";
import { DrizzleDocumentRepository } from "./db/document-repository.js";
import { DrizzleSnapshotReader } from "./db/snapshot-reader.js";
import { PlaywrightDocumentGenerator } from "./pdf/playwright-generator.js";
import { AppStorageConnector } from "./storage/app-storage.js";

const redisUrl = env.REDIS_URL ?? "redis://localhost:6379";

interface PdfJobData {
  documentId: string;
  contractId: string;
  snapshotId: string;
}

function buildDocumentService(): DocumentService {
  const repository = new DrizzleDocumentRepository();
  const snapshotReader = new DrizzleSnapshotReader();
  const generator = new PlaywrightDocumentGenerator("chrome");
  const storage = new AppStorageConnector();

  // El DrizzleDocumentRepository implementa DocumentRepository y DocumentStoragePort.
  return new DocumentService(
    repository,
    snapshotReader,
    generator,
    storage,
    repository,
    async (event) => {
      console.log(`[document-events] ${event.type} → doc ${event.documentId}`);
    }
  );
}

const documentService = buildDocumentService();

async function processPdfJob(job: Job<PdfJobData>) {
  const { documentId, contractId, snapshotId } = job.data;
  console.log(`[pdf] Generando documento ${documentId} (contrato ${contractId})`);

  // Registro idempotente (clave contract:{contractId}:document:{snapshotId}).
  await documentService.requestGeneration({
    contractId,
    snapshotId,
  });

  await documentService.generate(documentId);
  console.log(`[pdf] Documento ${documentId} completado.`);
}

async function processNotificationJob(job: Job) {
  console.log(`[notifications] Procesando job ${job.id}`, job.data);
}

async function startWorker() {
  const connection = { url: redisUrl };

  const pdfWorker = new Worker("pdf-generation", (job) => {
    // El DocumentService ya marca el documento como FAILED; al propagar el
    // error, BullMQ reintenta el job (reintentos configurados al encolar).
    return processPdfJob(job as Job<PdfJobData>);
  }, {
    connection,
    concurrency: 2,
  });

  const notificationWorker = new Worker("notifications", processNotificationJob, {
    connection,
    concurrency: 5,
  });

  pdfWorker.on("completed", (job) => {
    console.log(`[pdf] Job ${job?.id} completado.`);
  });

  pdfWorker.on("failed", (job, err) => {
    console.error(`[pdf] Job ${job?.id} falló:`, err?.message);
  });

  notificationWorker.on("failed", (job, err) => {
    console.error(`[notifications] Job ${job?.id} falló:`, err?.message);
  });

  console.log("Worker iniciado. Escuchando colas: pdf-generation, notifications");

  const shutdown = () => {
    void pdfWorker.close();
    void notificationWorker.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startWorker().catch((error) => {
  console.error("Error al iniciar el worker:", error);
  process.exit(1);
});