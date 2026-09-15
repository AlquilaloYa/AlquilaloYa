"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/adendas", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": "admin@sistema.com" },
        body: JSON.stringify({ contractId, titulo, contenido }),
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
      <div className="w-full max-w-lg rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Nueva adenda</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 font-body-sm text-on-surface-variant">
          La adenda se registra como documento del contrato{" "}
          <span className="font-mono-label">{codigoContrato}</span> y se descarga en PDF. No modifica el contrato emitido.
        </p>
        <div className="space-y-3">
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
            <label className="mb-1 block font-label-md text-on-surface-variant">Contenido</label>
            <textarea
              rows={6}
              className="w-full rounded border border-outline-variant bg-transparent px-2 py-1.5 font-body-sm text-on-surface"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Ej.: Se extiende el plazo del contrato por un período adicional de doce meses a partir de la fecha de término, manteniéndose las demás condiciones pactadas."
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
          <button onClick={handleSubmit} disabled={saving || !contenido.trim()}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40">
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