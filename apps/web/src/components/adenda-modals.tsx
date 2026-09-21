"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

export type EditableAdenda = {
  id: string;
  codigoContrato: string;
  filename: string;
  tipo: string;
  datosContrato: Record<string, unknown> | null;
  anexoContenido: string | null;
};

/** Extrae el "contenido" de la adenda quitando la primera línea (el título). */
function extraerContenido(anexo: string | null, titulo: string): string {
  if (!anexo) return "";
  const lineas = anexo.split("\n");
  if (lineas[0] === titulo) lineas.shift();
  return lineas.join("\n").replace(/^\n+/, "").trim();
}

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
  const [titulo, setTitulo] = useState(tituloInicial);
  const [contenido, setContenido] = useState(extraerContenido(adenda.anexoContenido, tituloInicial));
  const [numeroAdenda, setNumeroAdenda] = useState(String(dc.numeroAdenda ?? "1"));
  const [fechaInicioAdenda, setFechaInicioAdenda] = useState(
    String(dc.fechaInicioAdenda ?? "").slice(0, 10)
  );
  const [fechaFinAdenda, setFechaFinAdenda] = useState(
    String(dc.fechaFinAdenda ?? "").slice(0, 10)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Editar adenda</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 font-body-sm text-on-surface-variant">
          Edita la adenda <span className="font-mono-label">{adenda.codigoContrato}</span>. Al
          guardar se regenera el PDF y se reemplaza el archivo actual; si cambia la fecha de fin
          también se actualizan la fecha de término del contrato y las cuotas del plazo.
        </p>
        <div className="space-y-3">
          {!esExtension ? (
            <>
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
            </>
          ) : (
            <p className="rounded border border-outline-variant bg-surface-container-low px-3 py-2 font-body-sm text-on-surface-variant dark:border-transparent">
              Adenda de extensión: solo se pueden editar el título y el texto adicional.
            </p>
          )}
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Título de la adenda</label>
            <input
              className="h-10 w-full rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ADENDA"
            />
          </div>
          {!esExtension ? (
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Texto adicional</label>
              <textarea
                rows={6}
                className="w-full rounded border border-outline-variant bg-transparent px-2 py-1.5 font-body-sm text-on-surface"
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                placeholder="Ej.: Se mantienen las demás condiciones pactadas."
              />
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="mt-3 font-body-sm text-destructive">{error}</p>
        ) : null}
        <p className="mt-3 font-body-xs text-on-surface-variant">
          Los datos del snapshot original quedan inmutables; la edición registra una versión
          corregida reemplazando el PDF en storage.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar y reemplazar PDF"}
          </button>
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