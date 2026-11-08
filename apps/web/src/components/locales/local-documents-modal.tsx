"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { compressLocalUpload, maxLocalUploadBytes } from "@/lib/locales-files";
import { X } from "lucide-react";

export type LocalDocumentOwner = "separaciones" | "contratos" | "adendas";
type RequiredDocument = { tipo: string; label: string };
type LocalDocument = {
  id: string;
  tipo: string;
  nombre: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

const OWNER_LABEL: Record<LocalDocumentOwner, string> = {
  separaciones: "separación",
  contratos: "contrato",
  adendas: "adenda",
};

export function LocalDocumentsModal({
  localId,
  ownerId,
  ownerType,
  requiredDocuments,
  onClose,
  onComplete,
}: {
  localId: string;
  ownerId: string;
  ownerType: LocalDocumentOwner;
  requiredDocuments: RequiredDocument[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    const params = new URLSearchParams({ localId, ownerId, ownerType });
    const response = await apiFetch(`/api/locales/documentos?${params}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof body === "object" && body !== null && "error" in body
          ? String(body.error)
          : "No se pudieron cargar los documentos.",
      );
    }
    setDocuments(body as LocalDocument[]);
  }, [localId, ownerId, ownerType]);

  useEffect(() => {
    let active = true;
    void loadDocuments()
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los documentos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadDocuments]);

  async function upload(tipo: string, file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(tipo);
    try {
      const optimized = await compressLocalUpload(file);
      const maxBytes = maxLocalUploadBytes(optimized.type);
      if (maxBytes === null || optimized.size > maxBytes) {
        throw new Error(`El archivo optimizado supera el límite de ${maxBytes ? `${Math.round(maxBytes / 1024 / 1024)} MB` : "tamaño permitido"}.`);
      }
      const form = new FormData();
      form.set("file", optimized);
      form.set("localId", localId);
      form.set("ownerId", ownerId);
      form.set("ownerType", ownerType);
      form.set("tipo", tipo);
      const response = await apiFetch("/api/locales/documentos", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String(body.error)
            : "No se pudo guardar el documento.",
        );
      }
      await loadDocuments();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo guardar el documento.");
    } finally {
      setUploading(null);
    }
  }

  async function complete() {
    setError(null);
    setCompleting(true);
    try {
      await onComplete();
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "No se pudo completar el flujo.");
    } finally {
      setCompleting(false);
    }
  }

  const missing = requiredDocuments.filter(
    (required) => !documents.some((document) => document.tipo === required.tipo),
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-documents-title"
        className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="local-documents-title" className="text-xl font-semibold">Documentos del {OWNER_LABEL[ownerType]}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjunta los documentos requeridos para completar este paso.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
        {loading ? <p className="text-sm text-muted-foreground">Cargando documentos…</p> : null}

        <div className="space-y-3">
          {requiredDocuments.map((required) => {
            const existing = documents.filter((document) => document.tipo === required.tipo);
            return (
              <div key={required.tipo} className="rounded-lg border p-3">
                <label className="block text-sm font-medium">
                  {required.label}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    disabled={uploading !== null || loading}
                    onChange={(event) => {
                      void upload(required.tipo, event.currentTarget.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    className="mt-2 block w-full text-sm"
                  />
                </label>
                {uploading === required.tipo ? <p className="mt-2 text-xs text-muted-foreground">Optimizando y guardando…</p> : null}
                {existing.map((document) => (
                  <a
                    key={document.id}
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block truncate text-sm text-primary underline"
                  >
                    {document.nombre}
                  </a>
                ))}
              </div>
            );
          })}
        </div>
        {documents.some((document) => !requiredDocuments.some((required) => required.tipo === document.tipo)) ? (
          <div className="rounded-lg border p-3">
            <h3 className="text-sm font-medium">Documentos emitidos</h3>
            {documents
              .filter((document) => !requiredDocuments.some((required) => required.tipo === document.tipo))
              .map((document) => (
                <a
                  key={document.id}
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate text-sm text-primary underline"
                >
                  {document.nombre}
                </a>
              ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {missing.length ? `Falta adjuntar ${missing.length} documento(s).` : "Todos los documentos requeridos están adjuntos."}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={uploading !== null || completing} className="rounded-md border px-4 py-2 text-sm">
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => void complete()}
              disabled={missing.length > 0 || loading || uploading !== null || completing}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {completing ? "Completando…" : "Completar"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
