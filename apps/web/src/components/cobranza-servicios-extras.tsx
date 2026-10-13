"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas } from "@/components/tabla-busqueda";

type ServicioExtra = {
  id: string;
  contractId: string;
  codigoContrato: string | null;
  tipoServicio: string | null;
  incluyeInternet: boolean;
  incluyeCargaElectrica: boolean;
  montoTotal: string | null;
  fechaOpcion: string;
  fechaPago: string | null;
  clienteNombre: string | null;
  clienteDocumento: string | null;
  estado: string;
  filename: string | null;
};

const OPCION_LABEL: Record<string, string> = {
  AMBOS: "Internet + carga eléctrica",
  INTERNET: "Internet",
  CARGA_ELECTRICA: "Carga eléctrica",
};

function moneda(n: number): string {
  return n.toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

function fechaLegible(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export function CobranzaServiciosExtras() {
  const [servicios, setServicios] = useState<ServicioExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/servicios-extras", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setServicios((await res.json()) as ServicioExtra[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibles = useMemo(
    () =>
      filtrarFilas(servicios, busqueda, (s) => [
        s.clienteNombre,
        s.codigoContrato,
        OPCION_LABEL[s.tipoServicio ?? ""] ?? s.tipoServicio,
      ]),
    [servicios, busqueda],
  );

  const total = useMemo(
    () => visibles.reduce((acc, s) => acc + Number(s.montoTotal ?? 0), 0),
    [visibles],
  );

  async function descargar(id: string, nombre: string) {
    try {
      const res = await fetch(`/api/servicios-extras/${encodeURIComponent(id)}/download`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline-md text-on-surface">Servicios extras</h2>
          <p className="text-sm text-on-surface-variant">
            Internet (S/. 39) y/o recargo por carga eléctrica (S/. 60) contratados por
            opción del cliente.
          </p>
        </div>
        <BusquedaInput
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar servicio extra…"
          className="w-72"
        />
      </div>

      {error ? (
        <p className="rounded-md bg-error-container px-3 py-2 text-sm text-error-container-foreground">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-on-surface-variant">Cargando servicios extras…</p>
      ) : (
        <TableScroll
          className="w-full rounded-lg border border-outline-variant"
          contentClassName="max-h-[32rem]"
        >
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-container-low text-xs text-on-surface-variant">
              <tr>
                <th className="px-3 py-2 font-medium">Contrato</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Opción tomada</th>
                <th className="px-3 py-2 font-medium">Fecha opción</th>
                <th className="px-3 py-2 font-medium">Día de pago</th>
                <th className="px-3 py-2 font-medium">Monto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Documento</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((s) => (
                <tr key={s.id} className="border-t border-outline-variant/50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/contratos/${s.contractId}`}
                      className="font-mono text-primary hover:underline"
                    >
                      {s.codigoContrato ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-on-surface">
                    {s.clienteNombre || "—"}
                    {s.clienteDocumento ? (
                      <span className="block text-xs text-on-surface-variant">
                        {s.clienteDocumento}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">
                    {OPCION_LABEL[s.tipoServicio ?? ""] ?? s.tipoServicio ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-on-surface-variant">
                    {fechaLegible(s.fechaOpcion)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-on-surface-variant">
                    {fechaLegible(s.fechaPago)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-on-surface">
                    {moneda(Number(s.montoTotal ?? 0))}
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{s.estado}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() =>
                        void descargar(
                          s.id,
                          s.filename ?? `servicios-extras-${s.codigoContrato ?? s.id}.pdf`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-primary hover:bg-surface-container dark:border-transparent"
                    >
                      <Download className="h-4 w-4" />
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-on-surface-variant">
                    No hay servicios extras registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {visibles.length > 0 ? (
              <tfoot className="bg-surface-container-low text-sm">
                <tr>
                  <td className="px-3 py-2 font-medium text-on-surface" colSpan={5}>
                    Total ({visibles.length})
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-on-surface">
                    {moneda(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </TableScroll>
      )}
    </div>
  );
}
