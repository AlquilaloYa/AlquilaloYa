"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { apiFetch } from "@/lib/api";

/**
 * Editor del documento del contrato.
 *
 * - Vista visual (WYSIWYG): el documento se muestra como una hoja A4 y se edita
 *   directamente (contenteditable). Por debajo se sigue guardando/leyendo HTML.
 * - Vista HTML (avanzado): textarea con el código completo.
 * - Borrador (sin snapshot): guarda en `contracts.documento_html` vía PATCH.
 * - Emitido (con snapshot): crea un snapshot nuevo (nueva versión del PDF)
 *   vía `POST /api/contracts/:id { action: "editDocument" }`.
 */

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
  h1 { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 0 0 18pt; }
  h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; margin: 14pt 0 6pt; }
  p { margin: 0 0 8pt; text-align: justify; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 4pt 8pt; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  ul, ol { padding-left: 22pt; margin: 0 0 8pt; }
  .bold { font-weight: bold; }
  [contenteditable="true"]:focus { outline: none; }
`;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function formatCurrency(val: string): string {
  const n = parseFloat(val);
  return (isNaN(n) ? 0 : n).toFixed(2);
}

function parseFecha(iso: string): { dia: string; mes: string; año: string } | null {
  if (!iso) return null;
  const parts = iso.split("T")[0]!.split("-");
  if (parts.length < 3) return null;
  const d = parseInt(parts[2] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  if (isNaN(d) || isNaN(m)) return null;
  return { dia: String(d), mes: MESES[m - 1] ?? "", año: parts[0] ?? "" };
}

function numeroEnLetras(numero: string): string {
  const n = parseFloat(numero);
  const entero = isNaN(n) ? 0 : Math.floor(n);
  const unidades = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  const especiales: Record<number, string> = { 10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince", 20: "veinte" };
  const decenas = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
  if (entero < 10) return unidades[entero] ?? "cero";
  if (especiales[entero]) return especiales[entero];
  if (entero < 100) return `${decenas[Math.floor(entero / 10)]}${entero % 10 ? ` y ${unidades[entero % 10]}` : ""}`;
  if (entero < 1000) {
    if (entero === 100) return "cien";
    const restoC = entero % 100;
    return `${centenas[Math.floor(entero / 100)]}${restoC ? ` ${numeroEnLetras(String(restoC))}` : ""}`.trim();
  }
  if (entero < 1000000) {
    const miles = Math.floor(entero / 1000);
    const resto = entero % 1000;
    const milesTexto = miles === 1 ? "mil" : `${numeroEnLetras(String(miles))} mil`;
    return `${milesTexto}${resto ? ` ${numeroEnLetras(String(resto))}` : ""}`;
  }
  return String(entero);
}

function montoEnLetras(val: string): string {
  const n = parseFloat(val);
  const numero = isNaN(n) ? 0 : n;
  const centimos = Math.round((numero - Math.floor(numero)) * 100).toString().padStart(2, "0");
  return `${numeroEnLetras(val)} con ${centimos}/100 soles`;
}

/** Payload de datos vivos usado para la vista previa/aproximación del borrador. */
export type PreviewData = {
  cliente?: {
    nombres?: string | null;
    apellidos?: string | null;
    documentoIdentidad?: string | null;
    ruc?: string | null;
    nacionalidad?: string | null;
    domicilio?: string | null;
  } | null;
  departamento?: { codigo?: string | null; piso?: string | number | null } | null;
  contrato?: {
    montoCanonMensual?: string | null;
    depositoGarantia?: string | null;
    fechaInicio?: string | null;
    fechaFin?: string | null;
    mascotasItems?: string[] | null;
    muebleriaItems?: string[] | null;
    separacionDetalle?: Record<string, unknown> | null;
  } | null;
};

function capitalizarNombre(value: string): string {
  const lower = value.toLocaleLowerCase("es");
  let out = "";
  let inicio = true;
  for (const ch of lower) {
    const esLetra = ch.toLocaleUpperCase("es") !== ch.toLocaleLowerCase("es");
    if (esLetra) {
      out += inicio ? ch.toLocaleUpperCase("es") : ch;
      inicio = false;
    } else {
      out += ch;
      inicio = ch === " " || ch === "\t" || ch === "-" || ch === "'" || ch === "’";
    }
  }
  return out;
}

function field(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function codigoCorto(codigo: string): string {
  const s = (codigo ?? "").trim();
  const idx = s.lastIndexOf("-");
  return idx < 0 ? s : s.slice(idx + 1).trim() || s;
}

/**
 * Reemplazo LOCAL de marcadores (aproximación para el borrador, sin snapshot).
 * El PDF real se genera en el servidor con el render definitivo.
 */
export function renderPreviewHtml(html: string, data: PreviewData | null): string {
  if (!data) return html;
  const cliente = (data.cliente ?? null) as Record<string, unknown> | null;
  const depto = (data.departamento ?? null) as Record<string, unknown> | null;
  const contrato = (data.contrato ?? null) as Record<string, unknown> | null;
  const sep = (contrato?.separacionDetalle ?? {}) as Record<string, unknown>;

  const nombreCompleto = capitalizarNombre(
    [field(cliente, ["nombres"]), field(cliente, ["apellidos"])].filter(Boolean).join(" ")
  );
  const documento = field(cliente, ["documentoIdentidad", "ruc"]);
  const codigoDepto = codigoCorto(field(depto, ["codigo"]));
  const monto = field(contrato, ["montoCanonMensual"]);
  const garantia = field(contrato, ["depositoGarantia"]);
  const inicioFecha = parseFecha(field(contrato, ["fechaInicio"]));
  const finFecha = parseFecha(field(contrato, ["fechaFin"]));
  const fechaAbono = field(sep, ["fecha"]).split("T")[0];
  const montoFluct = field(sep, ["monto"]);

  const replacements: Record<string, string> = {
    "[NOMBRE DEL ARRENDATARIO]": nombreCompleto || "________________",
    "[NOMBRE COMPLETO]": nombreCompleto || "________________",
    "[NÚMERO DNI]": documento || "________________",
    "[NÚMERO]": documento || "________________",
    "[NACIONALIDAD]": field(cliente, ["nacionalidad"]) || "Peruano(a)",
    "[DOMICILIO]": field(cliente, ["domicilio"]) || "________________",
    "[NÚMERO DE DEPTO]": codigoDepto || "________________",
    "[PISO]": field(depto, ["piso"]),
    "[MONTO RENTA]": formatCurrency(monto),
    "[TOTAL MONTO]": (parseFloat(monto || "0") + 50).toFixed(2),
    "[DÍA DE PAGO]": inicioFecha ? inicioFecha.dia.padStart(2, "0") : "05",
    "[MONTO GARANTÍA]": formatCurrency(garantia),
    "[MONTO TOTAL GARANTÍA NUMEROS]": formatCurrency(garantia),
    "[MONTO TOTAL GARANTÍA LETRAS]": formatCurrency(garantia),
    "[MONTO FLUCTUANTE NUMEROS]": montoFluct || "________",
    "[MONTO FLUCTUANTE LETRAS]": montoFluct || "________",
    "[FECHA DE ABONO]": fechaAbono || "________",
    "[TIPO SEPARACION]": field(sep, ["tipo"]) || "________",
    "[DETALLE GARANTIA]": `${garantia ? `S/ ${formatCurrency(garantia)} (${montoEnLetras(garantia)})` : "________"}`,
    "[ESPECIE]": (Array.isArray(contrato?.mascotasItems) ? contrato!.mascotasItems! : []).map(String).join(", ") || "________________",
    "[DÍA]": inicioFecha?.dia ?? "___",
    "[MES]": inicioFecha?.mes ?? "__________",
    "[AÑO]": inicioFecha?.año ?? "______",
    "[DÍA INICIO]": inicioFecha?.dia ?? "___",
    "[MES INICIO]": inicioFecha?.mes ?? "__________",
    "[AÑO INICIO]": inicioFecha?.año ?? "______",
    "[DÍA FIN]": finFecha?.dia ?? "___",
    "[MES FIN]": finFecha?.mes ?? "__________",
    "[AÑO FIN]": finFecha?.año ?? "______",
  };

  let out = html;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(key).join(value);
  }
  return out;
}

export function EditorDocumentoModal({
  contractId,
  codigoContrato,
  emitido,
  htmlInicial,
  plantillaHtml,
  onClose,
  onSaved,
}: {
  contractId: string;
  codigoContrato: string;
  emitido: boolean;
  htmlInicial: string;
  plantillaHtml: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [html, setHtml] = useState(htmlInicial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const savedSelection = useRef<Range | null>(null);
  const initialized = useRef(false);

  /** Escribe el HTML en el iframe editable (hoja A4) sin perder el caret. */
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
    if (mode !== "visual" || initialized.current) return;
    initialized.current = true;
    paint(html);
  }, [mode, html, paint]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiFetch(`/api/contracts/${contractId}`);
        if (!res.ok) return;
        const d = (await res.json()) as { source?: PreviewData };
        if (active) setPreviewData(d.source ?? null);
      } catch {
        /* la aproximación local es opcional */
      }
    })();
    return () => {
      active = false;
    };
  }, [contractId]);

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

  function insertText(text: string) {
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
    doc.execCommand("insertHTML", false, text);
    setHtml(readEditorHtml());
  }

  function handleEditorFocus() {
    const doc = iframeRef.current?.contentDocument;
    const sel = doc?.getSelection();
    if (sel && sel.rangeCount > 0) savedSelection.current = sel.getRangeAt(0).cloneRange();
  }

  const previewSrcDoc = (() => {
    const rendered = renderPreviewHtml(html, previewData);
    return rendered.includes("<html")
      ? rendered
      : `<!doctype html><html><head><meta charset="utf-8"><style>${EDITOR_STYLES}</style></head><body>${rendered}</body></html>`;
  })();

  async function guardar() {
    const finalHtml = mode === "visual" ? readEditorHtml() : html;
    if (!finalHtml.trim()) {
      setError("El documento no puede estar vacío");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = emitido
        ? await apiFetch(`/api/contracts/${encodeURIComponent(contractId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "editDocument", documentoHtml: finalHtml }),
          })
        : await apiFetch(`/api/contracts/${encodeURIComponent(contractId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentoHtml: finalHtml }),
          });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo guardar el documento");
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const toolBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant px-6 py-4 dark:border-transparent">
          <div>
            <h3 className="font-headline-md text-on-surface">Editar documento</h3>
            <p className="font-body-sm text-on-surface-variant">
              Contrato <span className="font-mono-label">{codigoContrato}</span>
              {emitido
                ? " · emitido: al guardar se crea una nueva versión del PDF (la anterior queda en el historial)."
                : " · borrador: los cambios se congelarán al emitir."}
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
            <button
              onClick={onClose}
              className="rounded p-1 text-on-surface-variant hover:bg-surface-container"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

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
                title="Editor del documento"
                onLoad={() => {
                  paint(html);
                }}
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
                  title="Restaurar el HTML original de la plantilla"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restaurar plantilla
                </button>
              ) : null}
            </div>
            <iframe
              title="Vista previa del documento"
              srcDoc={previewSrcDoc}
              sandbox=""
              className="h-full min-h-[420px] w-full flex-1 bg-white"
            />
          </div>
        </div>

        <details className="border-t border-outline-variant px-4 py-2 dark:border-transparent">
          <summary className="cursor-pointer font-label-md text-on-surface-variant">
            Insertar marcador (se reemplaza automáticamente al generar el PDF)
          </summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {MARCADORES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => (mode === "visual" ? insertText(m) : setHtml(html + m))}
                className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant hover:bg-primary hover:text-on-primary"
              >
                {m}
              </button>
            ))}
          </div>
        </details>

        <div className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-4 dark:border-transparent">
          <p className="font-body-xs text-on-surface-variant">
            Edita el documento como quieras (texto, viñetas, cláusulas). La vista previa es una
            aproximación; el PDF final se genera al guardar.
          </p>
          <div className="flex items-center gap-2">
            {error ? <span className="font-body-sm text-destructive">{error}</span> : null}
            <button
              onClick={onClose}
              className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent"
            >
              Cancelar
            </button>
            <button
              onClick={() => void guardar()}
              disabled={saving}
              className="rounded-lg bg-green-600 px-5 py-2 font-label-md font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving
                ? "Guardando…"
                : emitido
                ? "Guardar y generar nueva versión"
                : "Guardar documento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MARCADORES = [
  "[NOMBRE DEL ARRENDATARIO]",
  "[NOMBRE COMPLETO]",
  "[NÚMERO DNI]",
  "[NACIONALIDAD]",
  "[DOMICILIO]",
  "[NÚMERO DE DEPTO]",
  "[PISO]",
  "[MONTO RENTA]",
  "[TOTAL MONTO]",
  "[DÍA DE PAGO]",
  "[MONTO GARANTÍA]",
  "[MONTO TOTAL GARANTÍA NUMEROS]",
  "[MONTO TOTAL GARANTÍA LETRAS]",
  "[MONTO FLUCTUANTE NUMEROS]",
  "[MONTO FLUCTUANTE LETRAS]",
  "[FECHA DE ABONO]",
  "[TIPO SEPARACION]",
  "[DETALLE GARANTIA]",
  "[ESPECIE]",
  "[DÍA]",
  "[MES]",
  "[AÑO]",
  "[DÍA INICIO]",
  "[MES INICIO]",
  "[AÑO INICIO]",
  "[DÍA FIN]",
  "[MES FIN]",
  "[AÑO FIN]",
  "[HOJA DE DATOS]",
  "[DNI]",
  "[BAUCHER]",
  "[INVENTARIO]",
];
