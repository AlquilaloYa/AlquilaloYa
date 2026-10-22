"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { FileText, ImageIcon, Plus, RefreshCw, Trash2 } from "lucide-react";

interface Gasto {
  id: string;
  dia: string;
  tipo: "SERVICIO" | "PRODUCTO";
  producto: string;
  monto: number;
  tieneComprobante: boolean;
  comprobanteMimeType: string | null;
  nota: string;
  creadoPor: string;
  createdAt: string;
}

interface GastosData {
  gastos: Gasto[];
  total: number;
  totalServicios: number;
  totalProductos: number;
  cantidad: number;
}

const campoClase =
  "h-9 rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none";

function soles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function primerDiaMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtFecha(v: string): string {
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function GastosPage() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyISO());
  const [data, setData] = useState<GastosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fDia, setFDia] = useState(hoyISO());
  const [fTipo, setFTipo] = useState<"SERVICIO" | "PRODUCTO">("PRODUCTO");
  const [fProducto, setFProducto] = useState("");
  const [fMonto, setFMonto] = useState("");
  const [fNota, setFNota] = useState("");
  const [fComprobante, setFComprobante] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ desde, hasta });
      const res = await apiFetch(`/api/gastos?${qs.toString()}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      setData((await res.json()) as GastosData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  async function agregar() {
    const monto = Number(fMonto);
    if (!fProducto.trim() || !Number.isFinite(monto) || monto <= 0) {
      setError("Completa el producto y un monto mayor a 0");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("dia", fDia);
      fd.set("tipo", fTipo);
      fd.set("producto", fProducto.trim());
      fd.set("monto", String(monto));
      fd.set("nota", fNota.trim());
      if (fComprobante) fd.set("comprobante", fComprobante);
      const res = await apiFetch("/api/gastos", { method: "POST", body: fd });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo registrar el gasto");
      }
      setFProducto("");
      setFMonto("");
      setFNota("");
      setFComprobante(null);
      const input = document.getElementById("gasto-comprobante") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id: string) {
    setError(null);
    try {
      const res = await apiFetch(`/api/gastos?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo eliminar el gasto");
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const gastos = useMemo(() => data?.gastos ?? [], [data]);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mb-1 font-headline-lg text-primary">Gastos</h2>
            <p className="max-w-2xl font-body-sm text-on-surface-variant">
              Registra los gastos del negocio con su comprobante (opcional), fecha,
              monto y tipo (servicio o producto).
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value || desde)}
                className={campoClase}
              />
            </div>
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value || hasta)}
                className={campoClase}
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-outline-variant px-3 font-label-md text-on-surface-variant transition-colors hover:bg-surface-container dark:border-transparent"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-surface-container-lowest p-4">
            <p className="font-label-md uppercase-track text-on-surface-variant">Total gastos</p>
            <p className="mt-1 font-headline-md text-on-surface">{soles(data?.total ?? 0)}</p>
            <p className="font-body-xs text-on-surface-variant">{data?.cantidad ?? 0} registros</p>
          </div>
          <div className="rounded-lg bg-surface-container-lowest p-4">
            <p className="font-label-md uppercase-track text-on-surface-variant">Servicios</p>
            <p className="mt-1 font-headline-md text-on-surface">{soles(data?.totalServicios ?? 0)}</p>
          </div>
          <div className="rounded-lg bg-surface-container-lowest p-4">
            <p className="font-label-md uppercase-track text-on-surface-variant">Productos</p>
            <p className="mt-1 font-headline-md text-on-surface">{soles(data?.totalProductos ?? 0)}</p>
          </div>
        </div>

        <div className="rounded-lg bg-surface-container-lowest p-5">
          <h3 className="mb-3 font-headline-md text-on-surface">Registrar gasto</h3>
          <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_8rem]">
            <input
              type="date"
              value={fDia}
              onChange={(e) => setFDia(e.target.value || fDia)}
              className={campoClase}
              aria-label="Día"
            />
            <select
              value={fTipo}
              onChange={(e) => setFTipo(e.target.value as "SERVICIO" | "PRODUCTO")}
              className={campoClase}
              aria-label="Tipo"
            >
              <option value="PRODUCTO">Producto</option>
              <option value="SERVICIO">Servicio</option>
            </select>
            <input
              value={fProducto}
              onChange={(e) => setFProducto(e.target.value)}
              placeholder="Producto o servicio"
              className={campoClase}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={fMonto}
              onChange={(e) => setFMonto(e.target.value)}
              placeholder="Monto"
              className={campoClase}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={fNota}
              onChange={(e) => setFNota(e.target.value)}
              placeholder="Nota (opcional)"
              className={campoClase}
            />
            <input
              id="gasto-comprobante"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFComprobante(e.target.files?.[0] ?? null)}
              className="text-sm text-on-surface-variant"
            />
            <button
              type="button"
              disabled={guardando}
              onClick={() => void agregar()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-label-md text-on-primary disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {guardando ? "Guardando…" : "Registrar"}
            </button>
          </div>
          <p className="mt-2 font-body-xs text-on-surface-variant">
            El comprobante es opcional: JPG, PNG, WebP o PDF, hasta 8 MB.
          </p>
        </div>

        {error ? <p className="font-body-sm text-red-600">{error}</p> : null}

        <div className="rounded-lg bg-surface-container-lowest p-5">
          <h3 className="mb-3 font-headline-md text-on-surface">Gastos registrados</h3>
          {loading ? (
            <div className="flex items-center gap-3 font-body-sm text-on-surface-variant">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
              Cargando…
            </div>
          ) : gastos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant p-6 text-center font-body-sm text-on-surface-variant">
              No hay gastos en el rango seleccionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left font-body-md">
                <thead>
                  <tr className="border-b border-outline-variant font-label-md uppercase-track text-on-surface-variant">
                    <th className="px-3 py-2 font-medium">Día</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Producto / Servicio</th>
                    <th className="px-3 py-2 font-medium">Nota</th>
                    <th className="px-3 py-2 text-center font-medium">Comprobante</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((g) => (
                    <tr key={g.id} className="border-b border-outline-variant/60">
                      <td className="px-3 py-2 text-on-surface-variant">{fmtFecha(g.dia)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            g.tipo === "SERVICIO"
                              ? "bg-primary/10 text-primary"
                              : "bg-surface-container-high text-on-surface-variant"
                          }`}
                        >
                          {g.tipo === "SERVICIO" ? "Servicio" : "Producto"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-on-surface">{g.producto}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{g.nota || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {g.tieneComprobante ? (
                          <a
                            href={`/api/gastos/${g.id}/comprobante`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            title="Ver comprobante"
                          >
                            {g.comprobanteMimeType === "application/pdf" ? (
                              <FileText className="h-4 w-4" />
                            ) : (
                              <ImageIcon className="h-4 w-4" />
                            )}
                            Ver
                          </a>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-label text-on-surface">
                        {soles(g.monto)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void eliminar(g.id)}
                          aria-label={`Eliminar gasto ${g.producto}`}
                          title="Eliminar"
                          className="rounded p-2 text-on-surface-variant transition hover:bg-surface-container-high hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-outline-variant font-semibold text-on-surface">
                    <td className="px-3 py-2" colSpan={5}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-mono-label">{soles(data?.total ?? 0)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
