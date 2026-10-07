"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { PdfCanvasPreview } from "@/components/pdf-canvas-preview";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { apiFetch } from "@/lib/api";
import { FileCheck, Eye, ExternalLink, HardDrive, LoaderCircle } from "lucide-react";

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
  createdAt: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
};

type NotarizedDocument = {
  id: string;
  tipo: string;
  filename: string | null;
  storageKey: string | null;
};

type DriveExportResult = {
  name: string;
  webViewLink: string | null;
};

type PdfPreview = {
  url: string;
  filename: string;
  contractCode: string;
};

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  FIRMADO: { label: "Firmado", color: "bg-green-500" },
  NOTARIADO: { label: "Notariado", color: "bg-primary" },
  ACTIVO: { label: "Activo", color: "bg-primary" },
  VIGENTE: { label: "Vigente", color: "bg-green-600" },
  RENOVADO: { label: "Renovado", color: "bg-blue-500" },
};

export default function ContratoFinalPage() {
  const [contracts, setContracts] = useState<FinalContractApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentAction, setDocumentAction] = useState<{
    contractId: string;
    action: "view" | "drive";
  } | null>(null);
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [driveResults, setDriveResults] = useState<Record<string, DriveExportResult>>({});
  const [driveProgress, setDriveProgress] = useState<{ done: number; total: number } | null>(null);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
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

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  function fmtFecha(iso: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtPrecio(val: string): string {
    return `S/ ${Number(val).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
  }

  async function obtenerContratoNotariado(contractId: string): Promise<NotarizedDocument> {
    const documentsResponse = await apiFetch(`/api/documents?contractId=${encodeURIComponent(contractId)}`);
    if (!documentsResponse.ok) {
      const body = await documentsResponse.json().catch(() => ({}));
      throw new Error(body.error ?? "No se pudieron cargar los documentos del contrato");
    }
    const result = (await documentsResponse.json()) as {
      items?: NotarizedDocument[];
    };
    const notarized = result.items?.find((document) => document.tipo === "CONTRATO_NOTARIADO");
    if (!notarized) throw new Error("Este contrato aún no tiene un contrato notariado adjunto");
    if (!notarized.storageKey) {
      throw new Error("El contrato notariado no tiene un archivo guardado en el sistema");
    }
    return notarized;
  }

  async function verContratoNotariado(contract: FinalContractApi) {
    setDocumentAction({ contractId: contract.id, action: "view" });
    setError(null);
    try {
      const notarized = await obtenerContratoNotariado(contract.id);
      const fileResponse = await apiFetch(`/api/documents/pdf?documentId=${encodeURIComponent(notarized.id)}`);
      if (!fileResponse.ok) {
        const body = await fileResponse.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo abrir el contrato notariado");
      }
      const blob = await fileResponse.blob();
      if (!blob.size || !(await blob.slice(0, 1024).text()).includes("%PDF-")) {
        throw new Error("El archivo guardado no contiene un PDF válido");
      }
      const url = URL.createObjectURL(blob);
      setPreview({
        url,
        filename: notarized.filename || `contrato-notariado-${contract.codigoContrato}.pdf`,
        contractCode: contract.codigoContrato,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDocumentAction(null);
    }
  }

  async function exportarContratoNotariado(contract: FinalContractApi) {
    setDocumentAction({ contractId: contract.id, action: "drive" });
    setError(null);
    try {
      const result = await subirContratoNotariadoADrive(contract);
      setDriveResults((current) => ({
        ...current,
        [contract.id]: result,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDocumentAction(null);
    }
  }

  async function subirContratoNotariadoADrive(
    contract: FinalContractApi,
  ): Promise<DriveExportResult> {
    const notarized = await obtenerContratoNotariado(contract.id);
    const response = await apiFetch(`/api/documents/${encodeURIComponent(notarized.id)}/drive`, {
      method: "POST",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error ?? "No se pudo exportar el contrato a Google Drive");
    }
    return {
      name: result.name ?? notarized.filename ?? "Contrato notariado",
      webViewLink: result.webViewLink ?? null,
    };
  }

  async function exportarContratosFinalesADrive() {
    setDriveProgress({ done: 0, total: contracts.length });
    setDriveMessage(null);
    setError(null);
    let exported = 0;
    let withoutNotarizedFile = 0;
    const failures: string[] = [];

    for (const [index, contract] of contracts.entries()) {
      try {
        const result = await subirContratoNotariadoADrive(contract);
        setDriveResults((current) => ({ ...current, [contract.id]: result }));
        exported += 1;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Error desconocido";
        if (message === "Este contrato aún no tiene un contrato notariado adjunto") {
          withoutNotarizedFile += 1;
        } else {
          failures.push(`${contract.codigoContrato}: ${message}`);
        }
      } finally {
        setDriveProgress({ done: index + 1, total: contracts.length });
      }
    }

    const erroresVisibles = failures.slice(0, 5).join("; ");
    const erroresRestantes = failures.length - Math.min(failures.length, 5);
    const resumen = [
      `${exported} contrato${exported === 1 ? "" : "s"} exportado${exported === 1 ? "" : "s"}.`,
      withoutNotarizedFile > 0
        ? `${withoutNotarizedFile} sin contrato notariado adjunto.`
        : "",
      failures.length > 0
        ? `${failures.length} con error: ${erroresVisibles}${erroresRestantes > 0 ? `; y ${erroresRestantes} más` : ""}.`
        : "",
    ].filter(Boolean);
    setDriveMessage(resumen.join(" "));
    setDriveProgress(null);
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
            <button
              type="button"
              onClick={() => void exportarContratosFinalesADrive()}
              disabled={driveProgress !== null || documentAction !== null}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {driveProgress ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <HardDrive className="h-4 w-4" />
              )}
              {driveProgress
                ? `Exportando ${driveProgress.done}/${driveProgress.total}…`
                : "Exportar a Drive"}
            </button>
          </div>
        )}
        {driveMessage ? (
          <p role="status" className="rounded-md border border-outline-variant/50 p-3 text-sm text-on-surface-variant">
            {driveMessage}
          </p>
        ) : null}
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
                    const driveResult = driveResults[c.id];
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/50">
                        <td className="px-3 py-2 font-mono-label font-medium">{c.codigoContrato}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/contratos/clientes/${c.clienteId}?contractId=${encodeURIComponent(c.id)}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {[c.clienteNombre, c.apellidoCliente].filter(Boolean).join(" ")}
                          </Link>
                        </td>
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
                            onClick={() => void verContratoNotariado(c)}
                            disabled={documentAction !== null || driveProgress !== null}
                            className="inline-flex items-center gap-1 text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {documentAction?.contractId === c.id && documentAction.action === "view"
                              ? "Abriendo…"
                              : "Ver contrato notariado"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void exportarContratoNotariado(c)}
                            disabled={documentAction !== null || driveProgress !== null}
                            className="mt-2 flex items-center gap-1 text-on-surface-variant hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {documentAction?.contractId === c.id && documentAction.action === "drive"
                              ? "Exportando…"
                              : "Exportar a Google Drive"}
                          </button>
                          {driveResult ? (
                            <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                              Exportado:{" "}
                              {driveResult.webViewLink ? (
                                <a
                                  href={driveResult.webViewLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 underline"
                                >
                                  {driveResult.name}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : driveResult.name}
                            </p>
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
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Contrato notariado ${preview.contractCode}`}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-surface p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-headline-md text-on-surface">
                Contrato notariado · {preview.contractCode}
              </h3>
              <div className="flex items-center gap-3">
                <a
                  href={preview.url}
                  download={preview.filename}
                  className="text-sm text-primary hover:underline"
                >
                  Descargar PDF
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-md px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <PdfCanvasPreview src={preview.url} title={preview.filename} />
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
