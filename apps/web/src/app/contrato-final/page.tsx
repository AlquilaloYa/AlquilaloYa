"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FileCheck, Download, RefreshCw } from "lucide-react";

type FinalContractApi = {
  id: string;
  codigoContrato: string;
  clienteId: string;
  departamentoId: string;
  montoCanonMensual: string;
  depositoGarantia: string;
  mantenimiento?: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  snapshotId: string | null;
  createdAt: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
};

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  FIRMADO: { label: "Firmado", color: "bg-green-500" },
  NOTARIADO: { label: "Notariado", color: "bg-primary" },
  ACTIVO: { label: "Activo", color: "bg-primary" },
  VIGENTE: { label: "Vigente", color: "bg-green-600" },
  RENOVADO: { label: "Renovado", color: "bg-blue-500" },
};

export default function ContratoFinalPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [contracts, setContracts] = useState<FinalContractApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [regenerandoId, setRegenerandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sortKey, setSortKey] = useState<"codigo" | "cliente" | "departamento" | "canon" | "garantia" | "inicio" | "fin" | "estado" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filasTabla = useMemo(() => {
    let filas = filtrarFilas(contracts, busqueda, (c) => [
      c.codigoContrato,
      c.clienteNombre,
      c.apellidoCliente,
      c.departamentoNombre,
      ESTADO_LABELS[c.estado]?.label ?? c.estado,
    ]);
    const valoradores: Record<string, (c: FinalContractApi) => string | number | null | undefined> = {
      codigo: (c) => c.codigoContrato,
      cliente: (c) => [c.clienteNombre, c.apellidoCliente].filter(Boolean).join(" "),
      departamento: (c) => c.departamentoNombre,
      canon: (c) => Number(c.montoCanonMensual),
      garantia: (c) => Number(c.depositoGarantia ?? 0),
      inicio: (c) => c.fechaInicio,
      fin: (c) => c.fechaFin,
      estado: (c) => ESTADO_LABELS[c.estado]?.label ?? c.estado,
    };
    if (sortKey) {
      filas = ordenarColumna(filas, sortKey, sortDir, valoradores[sortKey]!);
    }
    return filas;
  }, [contracts, busqueda, sortKey, sortDir]);

  function cambiarOrden(clave: typeof sortKey) {
    if (sortKey === clave) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(clave);
      setSortDir("asc");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/contracts");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as FinalContractApi[];
      // Filtrar solo contratos finalizados/firmados
      setContracts(data.filter((c) => ["FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE", "RENOVADO"].includes(c.estado)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function fmtFecha(iso: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtPrecio(val: string): string {
    return `S/ ${Number(val).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
  }

  async function descargarContratoNotariado(contract: FinalContractApi) {
    setDownloadingId(contract.id);
    setError(null);
    try {
      const documentsResponse = await apiFetch(`/api/documents?contractId=${encodeURIComponent(contract.id)}`);
      if (!documentsResponse.ok) throw new Error("No se pudieron cargar los documentos del contrato");
      const documents = (await documentsResponse.json()) as Array<{
        id: string;
        tipo: string;
        filename?: string | null;
      }>;
      const notarized = documents.find((document) => document.tipo === "CONTRATO_NOTARIADO");
      if (!notarized) throw new Error("Este contrato aún no tiene un contrato notariado adjunto");

      const fileResponse = await apiFetch(`/api/documents/pdf?documentId=${encodeURIComponent(notarized.id)}`);
      if (!fileResponse.ok) throw new Error("No se pudo descargar el contrato notariado");
      const blob = await fileResponse.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = notarized.filename || `contrato-notariado-${contract.codigoContrato}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function regenerarContrato(contract: FinalContractApi) {
    if (!confirm(`¿Regenerar el contrato "${contract.codigoContrato}" con el formato actual? Se re-renderiza desde el snapshot inmutable y se reemplaza el PDF almacenado.`)) return;
    setRegenerandoId(contract.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/documents/pdf?contractId=${encodeURIComponent(contract.id)}&regenerate=1`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo regenerar el contrato");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrato-${contract.codigoContrato}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerandoId(null);
      await load();
    }
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <FileCheck className="h-6 w-6 text-primary" />
          <h2 className="font-headline-lg text-primary">Contratos Finales</h2>
        </div>

        {error ? (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            Error: {error}
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Cargando contratos finales…</p>
        ) : contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay contratos finalizados aún.</p>
        ) : (
          <div className="flex items-center justify-end gap-3 rounded-md border border-outline-variant/50 p-3">
            <span className="mr-auto text-sm text-muted-foreground">
              {filasTabla.length} de {contracts.length} contratos
            </span>
            <BusquedaInput value={busqueda} onChange={setBusqueda} placeholder="Buscar contrato…" className="w-72" />
          </div>
        )}
        {error ? (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            Error: {error}
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Cargando contratos finales…</p>
        ) : contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay contratos finalizados aún.</p>
        ) : (
          <TableScroll className="w-full rounded-md border">
            <div className="max-h-[40rem] overflow-y-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 z-10 bg-[#151a24] text-left text-xs text-white/80">
                  <tr>
                    <th onClick={() => cambiarOrden("codigo")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "codigo" ? "text-white" : "")}>
                      Código{sortKey === "codigo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th onClick={() => cambiarOrden("cliente")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "cliente" ? "text-white" : "")}>
                      Cliente{sortKey === "cliente" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th onClick={() => cambiarOrden("departamento")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "departamento" ? "text-white" : "")}>
                      Departamento{sortKey === "departamento" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th onClick={() => cambiarOrden("canon")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "canon" ? "text-white" : "")}>
                      Canon{sortKey === "canon" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th onClick={() => cambiarOrden("garantia")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "garantia" ? "text-white" : "")}>
                      Garantía{sortKey === "garantia" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th onClick={() => cambiarOrden("inicio")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "inicio" ? "text-white" : "")}>
                      Inicio{sortKey === "inicio" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th onClick={() => cambiarOrden("fin")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "fin" ? "text-white" : "")}>
                      Fin{sortKey === "fin" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th onClick={() => cambiarOrden("estado")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5 " + (sortKey === "estado" ? "text-white" : "")}>
                      Estado{sortKey === "estado" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                    <th className="px-3 py-2 font-medium">Documento</th>
                    <th className="px-3 py-2 font-medium">Gestión</th>
                  </tr>
                </thead>
                <tbody>
                  {filasTabla.map((c) => {
                    const meta = ESTADO_LABELS[c.estado] ?? { label: c.estado, color: "bg-muted" };
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/50">
                        <td className="px-3 py-2 font-mono-label font-medium">{c.codigoContrato}</td>
                        <td className="px-3 py-2">{[c.clienteNombre, c.apellidoCliente].filter(Boolean).join(" ")}</td>
                        <td className="px-3 py-2">{c.departamentoNombre}</td>
                        <td className="px-3 py-2 font-semibold">{fmtPrecio(c.montoCanonMensual)}</td>
                        <td className="px-3 py-2">{c.depositoGarantia ? fmtPrecio(c.depositoGarantia) : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtFecha(c.fechaInicio)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtFecha(c.fechaFin)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${meta.color}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void descargarContratoNotariado(c)}
                            disabled={downloadingId === c.id}
                            className="inline-flex items-center gap-1 text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {downloadingId === c.id ? "Descargando…" : "Descargar contrato notariado"}
                          </button>
                          {isAdmin && c.snapshotId ? (
                            <button
                              type="button"
                              onClick={() => void regenerarContrato(c)}
                              disabled={regenerandoId === c.id}
                              className="mt-2 inline-flex items-center gap-1 text-on-surface-variant hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                              title="Re-renderizar el contrato con el template actual"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${regenerandoId === c.id ? "animate-spin" : ""}`} />
                              {regenerandoId === c.id ? "Regenerando…" : "Regenerar"}
                            </button>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/contrato-final/${c.id}`}
                            className="inline-flex items-center rounded bg-primary px-3 py-1.5 font-label-md text-on-primary hover:bg-primary/90"
                          >
                            Cliente y documentos
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TableScroll>
        )}
      </div>
    </DashboardShell>
  );
}
