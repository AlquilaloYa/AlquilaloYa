"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eye,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RotateCcw,
  Underline,
  Undo2,
  X,
} from "lucide-react";

export type EditableAdenda = {
  id: string;
  codigoContrato: string;
  filename: string;
  tipo: string;
  datosContrato: Record<string, unknown> | null;
  anexoContenido: string | null;
};

/** Estilos que se inyectan dentro del área editable para aproximar el PDF. */
const EDITOR_STYLES = `
  :root { color-scheme: light; }
  html, body { margin: 0; }
  body {
    background: #ffffff;
    color: #111827;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11.5pt;
    line-height: 1.45;
    padding: 14mm 16mm;
  }
  * { box-sizing: border-box; }
  h1 { text-align: center; font-size: 15px; font-weight: bold; text-transform: uppercase; margin: 0 0 12px; text-decoration: underline; }
  h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 10px 0 4px; }
  p { margin: 0 0 8pt; text-align: justify; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 4pt 8pt; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  ul, ol { padding-left: 22pt; margin: 0 0 8pt; }
  .bold { font-weight: bold; }
  [contenteditable="true"]:focus { outline: none; }
`;

/** Extrae el "contenido" de la adenda quitando la primera línea (el título). */
function extraerContenido(anexo: string | null, titulo: string): string {
  if (!anexo) return "";
  const lineas = anexo.split("\n");
  if (lineas[0] === titulo) lineas.shift();
  return lineas.join("\n").replace(/^\n+/, "").trim();
}

/**
 * Editor de la adenda.
 *
 * - Vista visual (WYSIWYG): el documento se muestra como una hoja A4 y se edita
 *   directamente (contenteditable). Por debajo se guarda HTML.
 * - Vista HTML (avanzado): textarea con el código completo.
 * Al guardar se actualizan título/plazo y el HTML del documento; el PDF se
 * regenera y reemplaza el archivo actual.
 */
export function EditAdendaModal({
  adenda,
  onClose,
  onSaved,
}: {
  adenda: EditableAdenda;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dc = adenda.datosContrato ?? {};
  const esExtension = adenda.tipo === "ADENDA_EXTENSION";
  const tituloInicial = String(dc.titulo ?? "ADENDA");

  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [html, setHtml] = useState("");
  const [plantillaHtml, setPlantillaHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [titulo, setTitulo] = useState(tituloInicial);
  const [contenido] = useState(extraerContenido(adenda.anexoContenido, tituloInicial));
  const [numeroAdenda, setNumeroAdenda] = useState(String(dc.numeroAdenda ?? "1"));
  const [fechaInicioAdenda, setFechaInicioAdenda] = useState(
    String(dc.fechaInicioAdenda ?? "").slice(0, 10)
  );
  const [fechaFinAdenda, setFechaFinAdenda] = useState(
    String(dc.fechaFinAdenda ?? "").slice(0, 10)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const savedSelection = useRef<Range | null>(null);
  const initialized = useRef(false);

  const paint = useCallback((nextHtml: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><style>${EDITOR_STYLES}</style></head><body contenteditable="true">${nextHtml}</body></html>`
    );
    doc.close();
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/adendas/${encodeURIComponent(adenda.id)}`);
        const body = (await res.json().catch(() => ({}))) as {
          htmlActual?: string;
          documentoHtml?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? "No se pudo cargar la adenda");
        if (!active) return;
        setPlantillaHtml(body.documentoHtml ? null : body.htmlActual ?? null);
        setHtml(body.htmlActual ?? "");
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adenda.id]);

  useEffect(() => {
    if (mode !== "visual" || initialized.current || loading) return;
    initialized.current = true;
    paint(html);
  }, [mode, html, loading, paint]);

  function readEditorHtml(): string {
    const body = iframeRef.current?.contentDocument?.body;
    return body ? body.innerHTML : html;
  }

  function switchMode(next: "visual" | "html") {
    if (next === mode) return;
    if (mode === "visual") {
      setHtml(readEditorHtml());
    } else {
      paint(html);
    }
    setMode(next);
    setError(null);
  }

  function exec(command: string, value?: string) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.body?.focus();
    if (savedSelection.current) {
      const sel = doc.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelection.current);
      }
    }
    doc.execCommand(command, false, value);
    setHtml(readEditorHtml());
  }

  function handleEditorFocus() {
    const doc = iframeRef.current?.contentDocument;
    const sel = doc?.getSelection();
    if (sel && sel.rangeCount > 0) savedSelection.current = sel.getRangeAt(0).cloneRange();
  }

  async function handleSubmit() {
    const finalHtml = mode === "visual" ? readEditorHtml() : html;
    if (!finalHtml.trim()) {
      setError("El documento no puede estar vacío");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/adendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-email": "admin@sistema.com" },
        body: JSON.stringify({
          documentId: adenda.id,
          titulo,
          contenido,
          numeroAdenda,
          fechaInicioAdenda,
          fechaFinAdenda,
          documentoHtml: finalHtml,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo editar la adenda");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adenda-${adenda.codigoContrato}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const toolBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary";

  const previewSrcDoc = html.includes("<html")
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"><style>${EDITOR_STYLES}</style></head><body>${html}</body></html>`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant px-6 py-4 dark:border-transparent">
          <div>
            <h3 className="font-headline-md text-on-surface">Editar adenda</h3>
            <p className="font-body-sm text-on-surface-variant">
              Adenda <span className="font-mono-label">{adenda.codigoContrato}</span>. Al guardar se
              regenera el PDF y se reemplaza el archivo actual
              {esExtension ? "." : "; si cambia el plazo, se actualiza el contrato y sus cuotas."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-outline-variant p-0.5 dark:border-transparent">
              <button
                type="button"
                onClick={() => switchMode("visual")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-label-md ${
                  mode === "visual" ? "bg-primary text-on-primary" : "text-on-surface-variant"
                }`}
              >
                <Eye className="h-4 w-4" />
                Documento
              </button>
              <button
                type="button"
                onClick={() => switchMode("html")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-label-md ${
                  mode === "html" ? "bg-primary text-on-primary" : "text-on-surface-variant"
                }`}
              >
                <Code2 className="h-4 w-4" />
                HTML
              </button>
            </div>
            <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center p-16 font-body-md text-on-surface-variant">
            Cargando adenda…
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            <div className="flex min-h-0 flex-col border-b border-outline-variant lg:border-b-0 lg:border-r dark:border-transparent">
              {mode === "visual" ? (
                <div className="flex flex-wrap items-center gap-0.5 border-b border-outline-variant px-3 py-2 dark:border-transparent">
                  <button type="button" className={toolBtn} title="Negrita" onClick={() => exec("bold")}>
                    <Bold className="h-4 w-4" />
                  </button>
                  <button type="button" className={toolBtn} title="Cursiva" onClick={() => exec("italic")}>
                    <Italic className="h-4 w-4" />
                  </button>
                  <button type="button" className={toolBtn} title="Subrayado" onClick={() => exec("underline")}>
                    <Underline className="h-4 w-4" />
                  </button>
                  <span className="mx-1 h-5 w-px bg-outline-variant" />
                  <button type="button" className={toolBtn} title="Alinear izquierda" onClick={() => exec("justifyLeft")}>
                    <AlignLeft className="h-4 w-4" />
                  </button>
                  <button type="button" className={toolBtn} title="Centrar" onClick={() => exec("justifyCenter")}>
                    <AlignCenter className="h-4 w-4" />
                  </button>
                  <button type="button" className={toolBtn} title="Alinear derecha" onClick={() => exec("justifyRight")}>
                    <AlignRight className="h-4 w-4" />
                  </button>
                  <button type="button" className={toolBtn} title="Justificar" onClick={() => exec("justifyFull")}>
                    <AlignJustify className="h-4 w-4" />
                  </button>
                  <span className="mx-1 h-5 w-px bg-outline-variant" />
                  <button type="button" className={toolBtn} title="Lista con viñetas" onClick={() => exec("insertUnorderedList")}>
                    <List className="h-4 w-4" />
                  </button>
                  <button type="button" className={toolBtn} title="Lista numerada" onClick={() => exec("insertOrderedList")}>
                    <ListOrdered className="h-4 w-4" />
                  </button>
                  <span className="mx-1 h-5 w-px bg-outline-variant" />
                  <button type="button" className={toolBtn} title="Deshacer" onClick={() => exec("undo")}>
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button type="button" className={toolBtn} title="Rehacer" onClick={() => exec("redo")}>
                    <Redo2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              {mode === "visual" ? (
                <iframe
                  ref={iframeRef}
                  title="Editor de la adenda"
                  onLoad={() => paint(html)}
                  onFocus={handleEditorFocus}
                  className="h-full min-h-[420px] w-full flex-1 bg-white"
                />
              ) : (
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  spellCheck={false}
                  className="min-h-[420px] flex-1 resize-none border-0 bg-surface-container-low p-3 font-mono text-xs leading-relaxed text-on-surface outline-none"
                />
              )}
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-4 py-2 dark:border-transparent">
                <span className="font-label-md text-on-surface-variant">Vista previa (PDF aproximado)</span>
                {plantillaHtml ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHtml(plantillaHtml);
                      if (mode === "visual") paint(plantillaHtml);
                    }}
                    className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-on-surface-variant hover:bg-surface-container dark:border-transparent"
                    title="Restaurar el HTML original de la adenda"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restaurar plantilla
                  </button>
                ) : null}
              </div>
              <iframe
                title="Vista previa de la adenda"
                srcDoc={previewSrcDoc}
                sandbox=""
                className="h-full min-h-[420px] w-full flex-1 bg-white"
              />
            </div>
          </div>
        )}

        <div className="grid gap-3 border-t border-outline-variant px-6 py-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-transparent">
          {!esExtension ? (
            <>
              <div>
                <label className="mb-1 block font-label-md text-on-surface-variant">N° de adenda</label>
                <input
                  className="h-9 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
                  value={numeroAdenda}
                  onChange={(e) => setNumeroAdenda(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface-variant">Título</label>
                <input
                  className="h-9 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="ADENDA"
                />
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface-variant">Inicio del plazo</label>
                <input
                  type="date"
                  className="h-9 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
                  value={fechaInicioAdenda}
                  onChange={(e) => setFechaInicioAdenda(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface-variant">Fin del plazo</label>
                <input
                  type="date"
                  className="h-9 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
                  value={fechaFinAdenda}
                  onChange={(e) => setFechaFinAdenda(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="rounded border border-outline-variant bg-surface-container-low px-3 py-2 font-body-sm text-on-surface-variant dark:border-transparent">
                Adenda de extensión: edita directamente el documento (el plazo se controla desde la
                vista del documento).
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-4 dark:border-transparent">
          <p className="font-body-xs text-on-surface-variant">
            Los datos del snapshot quedan inmutables; la edición registra una versión corregida
            reemplazando el PDF en storage.
          </p>
          <div className="flex items-center gap-2">
            {error ? <span className="font-body-sm text-destructive">{error}</span> : null}
            <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
              Cancelar
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving || loading}
              className="rounded-lg bg-green-600 px-5 py-2 font-label-md font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Guardar y reemplazar PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdendaModal({
  contractId,
  codigoContrato,
  onClose,
  onCreated,
}: {
  contractId: string;
  codigoContrato: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("ADENDA");
  const [contenido, setContenido] = useState("");
  const [numeroAdenda, setNumeroAdenda] = useState("1");
  const [fechaInicioAdenda, setFechaInicioAdenda] = useState("");
  const [fechaFinAdenda, setFechaFinAdenda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/adendas", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": "admin@sistema.com" },
        body: JSON.stringify({
          contractId,
          titulo,
          contenido,
          numeroAdenda,
          fechaInicioAdenda,
          fechaFinAdenda,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo generar la adenda");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adenda-${codigoContrato}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await onCreated();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Nueva adenda</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 font-body-sm text-on-surface-variant">
          Se genera el PDF con la plantilla formal de adenda para el contrato{" "}
          <span className="font-mono-label">{codigoContrato}</span>. Al confirmar, la adenda
          extiende el contrato hasta la fecha de fin indicada y crea las cuotas de cobranza de
          los meses nuevos (el departamento queda ocupado hasta esa fecha).
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">N° de adenda</label>
            <input
              className="h-10 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              value={numeroAdenda}
              onChange={(e) => setNumeroAdenda(e.target.value)}
              placeholder="1"
            />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Fecha de inicio de la adenda</label>
            <input
              type="date"
              className="h-10 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              value={fechaInicioAdenda}
              onChange={(e) => setFechaInicioAdenda(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Día/Mes/Año inicio del nuevo plazo.</p>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Fecha de fin de la adenda</label>
            <input
              type="date"
              className="h-10 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              value={fechaFinAdenda}
              onChange={(e) => setFechaFinAdenda(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Día/Mes/Año fin del nuevo plazo.</p>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Título de la adenda</label>
            <input
              className="h-10 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ADENDA"
            />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Texto adicional (opcional)</label>
            <textarea
              rows={4}
              className="w-full rounded border border-outline-variant bg-transparent px-2 py-1.5 font-body-sm text-on-surface"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Ej.: Se mantienen las demás condiciones pactadas."
            />
          </div>
        </div>
        {error ? (
          <p className="mt-3 font-body-sm text-destructive">{error}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !fechaInicioAdenda || !fechaFinAdenda}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Generando…" : "Generar adenda"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExtensionModal({
  contractId,
  codigoContrato,
  fechaFin,
  onClose,
  onCreated,
}: {
  contractId: string;
  codigoContrato: string;
  fechaFin: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const sugerida = useMemo(() => {
    const d = new Date(`${fechaFin.slice(0, 10)}T12:00:00`);
    d.setMonth(d.getMonth() + 12);
    return d.toISOString().slice(0, 10);
  }, [fechaFin]);
  const [nuevaFechaFin, setNuevaFechaFin] = useState(sugerida);
  const [titulo, setTitulo] = useState("ADENDA DE EXTENSIÓN");
  const [contenido, setContenido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/adendas", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": "admin@sistema.com" },
        body: JSON.stringify({
          contractId,
          tipo: "extension",
          titulo,
          nuevaFechaFin,
          contenido,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo generar la adenda de extensión");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adenda-extension-${codigoContrato}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await onCreated();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Adenda de extensión</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 font-body-sm text-on-surface-variant">
          Extiende el contrato <span className="font-mono-label">{codigoContrato}</span>. Se genera el
          PDF, se actualiza la fecha de término del contrato y se crean las cuotas de los meses
          extendidos.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Fecha de término actual</label>
            <p className="rounded border border-outline-variant bg-surface-container-low px-2 py-2 font-body-md text-on-surface dark:border-transparent">
              {fechaFin.slice(0, 10)}
            </p>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Nueva fecha de término</label>
            <input
              type="date"
              className="h-10 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              value={nuevaFechaFin}
              onChange={(e) => setNuevaFechaFin(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Título de la adenda</label>
            <input
              className="h-10 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ADENDA DE EXTENSIÓN"
            />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Texto adicional (opcional)</label>
            <textarea
              rows={4}
              className="w-full rounded border border-outline-variant bg-transparent px-2 py-1.5 font-body-sm text-on-surface"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Ej.: El canon se mantiene sin variación durante el período extendido."
            />
          </div>
        </div>
        {error ? (
          <p className="mt-3 font-body-sm text-destructive">{error}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !nuevaFechaFin || nuevaFechaFin <= fechaFin.slice(0, 10)}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Generando…" : "Generar extensión"}
          </button>
        </div>
      </div>
    </div>
  );
}