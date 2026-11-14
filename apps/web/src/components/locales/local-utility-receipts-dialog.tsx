"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { calcularMontoPorcentual } from "@/lib/local-utility-billing";

type LocalUtilityConfiguration = {
  id: string;
  codigo: string;
  pagoLuzPorcentaje: string;
  pagoAguaPorcentaje: string;
};

type ExistingReceipts = {
  reciboLuzMonto?: string;
  reciboAguaMonto?: string;
};

const moneda = (value: number) =>
  value.toLocaleString("es-PE", { style: "currency", currency: "PEN" });

export function LocalUtilityReceiptsDialog({
  local,
  periodo,
  existing,
  onClose,
  onSaved,
}: {
  local: LocalUtilityConfiguration;
  periodo: string;
  existing: ExistingReceipts | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reciboLuzMonto, setReciboLuzMonto] = useState(existing?.reciboLuzMonto ?? "");
  const [reciboAguaMonto, setReciboAguaMonto] = useState(existing?.reciboAguaMonto ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const luzPorcentaje = Number(local.pagoLuzPorcentaje);
  const aguaPorcentaje = Number(local.pagoAguaPorcentaje);
  const montoLuz = calcularMontoPorcentual(Number(reciboLuzMonto) || 0, luzPorcentaje);
  const montoAgua = calcularMontoPorcentual(Number(reciboAguaMonto) || 0, aguaPorcentaje);
  const periodoDate = new Date(`${periodo}T12:00:00.000Z`);

  async function save() {
    const luz = Number(reciboLuzMonto) || 0;
    const agua = Number(reciboAguaMonto) || 0;
    if (luz <= 0 && agua <= 0) {
      setError("Ingresa el monto de al menos un recibo.");
      return;
    }
    if (!Number.isFinite(luz) || !Number.isFinite(agua) || luz < 0 || agua < 0) {
      setError("Ingresa montos válidos para los recibos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch("/api/locales/cobranza/recibos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: local.id,
          periodo,
          reciboLuzMonto: luz,
          reciboAguaMonto: agua,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron registrar los recibos.");
      }
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudieron registrar los recibos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-utility-receipts-title"
        className="w-full max-w-lg space-y-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-xl"
      >
        <div>
          <h2 id="local-utility-receipts-title" className="font-headline-md text-on-surface">
            Recibos de luz y agua
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {local.codigo} · {Number.isNaN(periodoDate.valueOf()) ? periodo : periodoDate.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Importe total del recibo de luz (S/)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={reciboLuzMonto}
              onChange={(event) => setReciboLuzMonto(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3"
            />
            <span className="block text-xs text-muted-foreground">
              Porcentaje del recibo: {local.pagoLuzPorcentaje}% · Cargo: {moneda(montoLuz)}
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span>Importe total del recibo de agua (S/)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={reciboAguaMonto}
              onChange={(event) => setReciboAguaMonto(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3"
            />
            <span className="block text-xs text-muted-foreground">
              Porcentaje del recibo: {local.pagoAguaPorcentaje}% · Cargo: {moneda(montoAgua)}
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-4 py-2 text-sm">
            Cancelar
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50">
            {saving ? "Guardando…" : existing ? "Actualizar recibos" : "Registrar recibos"}
          </button>
        </div>
      </section>
    </div>
  );
}
