"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { forzarCierreSesion } from "@/lib/sesion-segura";

function tipoVistaPrevia(mimeType: string, filename: string): "pdf" | "image" | null {
  const mime = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "application/pdf" || /\.pdf$/i.test(filename)) return "pdf";
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(filename)) {
    return "image";
  }
  return null;
}

export function LocalAttachmentPreview({
  src,
  filename,
  mimeType,
  onClose,
}: {
  src: string;
  filename: string;
  mimeType: string;
  onClose: () => void;
}) {
  const tipo = tipoVistaPrevia(mimeType, filename);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    src.startsWith("data:") ? src : null,
  );
  const [loading, setLoading] = useState(!src.startsWith("data:"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (src.startsWith("data:")) {
      setPreviewSrc(src);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let objectUrl: string | null = null;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setPreviewSrc(null);
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        if (!tipo) throw new Error("Solo se pueden previsualizar archivos PDF e imágenes.");
        const response = await apiFetch(src, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          forzarCierreSesion();
          throw new Error("La sesión expiró. Vuelve a iniciar sesión.");
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            typeof body === "object" && body !== null && "error" in body
              ? String(body.error)
              : `No se pudo cargar el archivo (${response.status}).`,
          );
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("El archivo está vacío.");
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewSrc(objectUrl);
      } catch (cause) {
        if (!active) return;
        setError(
          controller.signal.aborted
            ? "La carga superó 30 segundos. Inténtalo nuevamente."
            : cause instanceof Error
              ? cause.message
              : "No se pudo abrir el archivo.",
        );
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, tipo]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-attachment-preview-title"
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b p-3 sm:p-4">
          <div className="min-w-0">
            <h2 id="local-attachment-preview-title" className="truncate font-semibold">
              {filename}
            </h2>
            <p className="text-xs text-muted-foreground">
              {tipo === "pdf" ? "Documento PDF" : tipo === "image" ? "Imagen" : "Archivo"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {previewSrc ? (
              <a
                href={previewSrc}
                download={filename}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                Descargar
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="rounded-md p-2 hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/40 p-3 sm:p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando vista previa…</p>
          ) : error ? (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : previewSrc && tipo === "pdf" ? (
            <iframe
              src={previewSrc}
              title={filename}
              loading="lazy"
              className="h-[78vh] w-full rounded-md bg-white"
            />
          ) : previewSrc && tipo === "image" ? (
            <img
              src={previewSrc}
              alt={filename}
              loading="lazy"
              decoding="async"
              className="max-h-[78vh] max-w-full object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo se pueden previsualizar archivos PDF e imágenes.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
