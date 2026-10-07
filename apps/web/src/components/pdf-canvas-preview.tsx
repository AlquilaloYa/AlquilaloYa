"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";

export function PdfCanvasPreview({ src, title }: { src: string; title: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasesRef = useRef<Array<HTMLCanvasElement | null>>([]);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setPageCount(0);
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`No se pudo cargar el PDF (HTTP ${response.status}).`);
        }
        const data = new Uint8Array(await response.arrayBuffer());
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-worker.mjs";
        loadingTask = pdfjs.getDocument({ data });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        documentRef.current = pdf;
        setPageCount(pdf.numPages);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "No se pudo abrir el PDF.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      documentRef.current = null;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [src]);

  useEffect(() => {
    const pdf = documentRef.current;
    if (!pdf || pageCount === 0) return;
    let cancelled = false;
    const renderTasks: RenderTask[] = [];

    void (async () => {
      try {
        const availableWidth = Math.max(
          320,
          (containerRef.current?.clientWidth ?? 900) - 40,
        );
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          if (cancelled) return;
          const canvas = canvasesRef.current[pageNumber - 1];
          if (!canvas) continue;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(availableWidth / baseViewport.width, 1.5),
          });
          const context = canvas.getContext("2d");
          if (!context) throw new Error("No se pudo preparar el visor del PDF.");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const renderTask = page.render({ canvasContext: context, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }
        if (!cancelled) setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "No se pudo renderizar el PDF.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel());
    };
  }, [pageCount]);

  return (
    <div
      ref={containerRef}
      className="min-h-[60vh] flex-1 overflow-auto rounded-lg bg-muted/50 p-4"
      aria-label={`Vista previa: ${title}`}
    >
      {error ? (
        <p role="alert" className="m-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <>
          {loading ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Cargando PDF…</p>
          ) : null}
          {pageCount > 0 ? (
            <div className="flex flex-col items-center gap-4">
              {Array.from({ length: pageCount }, (_, index) => (
                <canvas
                  key={index}
                  ref={(canvas) => {
                    canvasesRef.current[index] = canvas;
                  }}
                  aria-label={`Página ${index + 1} de ${pageCount}`}
                  className="max-w-full bg-white shadow"
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
