"use client";

import { useMemo, useState } from "react";
import { Eye, RotateCcw, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

/**
 * Editor del documento HTML del contrato.
 *
 * - Borrador (sin snapshot): guarda en `contracts.documento_html` vía PATCH.
 * - Emitido (con snapshot): crea un snapshot nuevo (nueva versión del PDF)
 *   vía `POST /api/contracts/:id { action: "editDocument" }`; la versión
 *   anterior queda como historial.
 */
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
  const [html, setHtml] = useState(htmlInicial);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marcadores = useMemo(
    () => [
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
    ],
    []
  );

  async function verPreview() {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/contracts/${encodeURIComponent(contractId)}/document/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo generar la vista previa");
      setPreview(String(body.html ?? ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function guardar() {
    if (!html.trim()) {
      setError("El documento HTML no puede estar vacío");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = emitido
        ? await apiFetch(`/api/contracts/${encodeURIComponent(contractId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "editDocument", documentoHtml: html }),
          })
        : await apiFetch(`/api/contracts/${encodeURIComponent(contractId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentoHtml: html }),
          });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo guardar el documento");
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-xl">
        <div className="flex items-start justify-between border-b border-outline-variant px-6 py-4 dark:border-transparent">
          <div>
            <h3 className="font-headline-md text-on-surface">Editar documento</h3>
            <p className="font-body-sm text-on-surface-variant">
              Contrato <span className="font-mono-label">{codigoContrato}</span>
              {emitido
                ? " · emitido: al guardar se crea una nueva versión del PDF (la anterior queda en el historial)."
                : " · borrador: los cambios se congelarán al emitir."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-on-surface-variant hover:bg-surface-container"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col border-b border-outline-variant p-4 lg:border-b-0 lg:border-r dark:border-transparent">
            <label className="mb-2 block font-label-md text-on-surface-variant">
              HTML del documento
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              className="min-h-[320px] flex-1 resize-none rounded border border-outline-variant bg-surface-container-low p-3 font-mono text-xs leading-relaxed text-on-surface outline-none focus:border-primary dark:border-transparent"
            />
            <details className="mt-2 rounded border border-outline-variant bg-surface-container-low px-3 py-2 dark:border-transparent">
              <summary className="cursor-pointer font-label-md text-on-surface-variant">
                Marcadores que se reemplazan automáticamente
              </summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {marcadores.map((m) => (
                  <code
                    key={m}
                    className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant"
                  >
                    {m}
                  </code>
                ))}
              </div>
            </details>
          </div>

          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-label-md text-on-surface-variant">Vista previa</span>
              <div className="flex items-center gap-2">
                {plantillaHtml ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHtml(plantillaHtml);
                      setPreview(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-on-surface-variant hover:bg-surface-container dark:border-transparent"
                    title="Restaurar el HTML original de la plantilla"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restaurar plantilla
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void verPreview()}
                  disabled={loadingPreview}
                  className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-primary hover:bg-surface-container disabled:opacity-40 dark:border-transparent"
                >
                  <Eye className="h-4 w-4" />
                  {loadingPreview ? "Generando…" : "Actualizar vista previa"}
                </button>
              </div>
            </div>
            {preview ? (
              <iframe
                title="Vista previa del documento"
                srcDoc={preview}
                sandbox=""
                className="min-h-[320px] flex-1 rounded border border-outline-variant bg-white dark:border-transparent"
              />
            ) : (
              <div className="flex min-h-[320px] flex-1 items-center justify-center rounded border border-dashed border-outline-variant bg-surface-container-low p-6 text-center font-body-sm text-on-surface-variant dark:border-transparent">
                Usa «Actualizar vista previa» para ver el documento con los datos del
                contrato.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-4 dark:border-transparent">
          <p className="font-body-xs text-on-surface-variant">
            Puedes añadir texto, puntos y cláusulas nuevas directamente en el HTML.
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
              className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
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
