"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";

type CargoDiasExtras = {
  id: string;
  contractId: string;
  codigoContrato: string;
  clienteId: string;
  clienteNombre: string;
  clienteApellidos: string;
  dias: number;
  monto: string;
  fechaFinPeriodo: string;
  estado: string;
};

const moneda = (value: number) =>
  value.toLocaleString("es-PE", { style: "currency", currency: "PEN" });

export function CobranzaDiasExtras() {
  const [cargos, setCargos] = useState<CargoDiasExtras[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/dias-extras");
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "No se pudieron cargar los cobros por días extras.";
        throw new Error(message);
      }
      if (!Array.isArray(body)) {
        throw new Error("La respuesta de cobros por días extras no es válida.");
      }
      setCargos(body as CargoDiasExtras[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error al cargar los días extras.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function actualizarEstado(cargo: CargoDiasExtras) {
    setActualizandoId(cargo.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/dias-extras/${cargo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: cargo.estado === "PAGADO" ? "PENDIENTE" : "PAGADO",
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "No se pudo actualizar el cobro.";
        throw new Error(message);
      }
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Error al actualizar el cobro.");
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-outline-variant p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-headline-md text-on-surface">Cobros por días extras</h2>
        <div className="flex items-center gap-3">
          <Link href="/dias-extras" className="text-sm font-medium text-primary hover:underline">
            Administrar
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Actualizar cobros por días extras"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-on-surface-variant">Cargando cobros…</p>
      ) : cargos.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No hay cargos por días extras.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-container-low text-xs text-on-surface-variant">
              <tr>
                <th className="px-3 py-2">Contrato</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Fin del período</th>
                <th className="px-3 py-2">Días</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {cargos.map((cargo) => (
                <tr key={cargo.id}>
                  <td className="px-3 py-2">
                    <Link href={`/contratos/${cargo.contractId}`} className="text-primary hover:underline">
                      {cargo.codigoContrato}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/contratos/clientes/${cargo.clienteId}`} className="text-primary hover:underline">
                      {[cargo.clienteNombre, cargo.clienteApellidos].filter(Boolean).join(" ")}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{cargo.fechaFinPeriodo}</td>
                  <td className="px-3 py-2">{cargo.dias}</td>
                  <td className="px-3 py-2 font-semibold">{moneda(Number(cargo.monto))}</td>
                  <td className="px-3 py-2">{cargo.estado}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void actualizarEstado(cargo)}
                      disabled={actualizandoId === cargo.id}
                      className="rounded border border-outline-variant px-2 py-1 text-xs text-primary hover:bg-surface-container disabled:opacity-50"
                    >
                      {cargo.estado === "PAGADO" ? "Marcar pendiente" : "Marcar pagado"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
