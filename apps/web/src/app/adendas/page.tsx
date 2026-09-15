"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";
import { CalendarPlus, Download, FileCheck, Plus, ShieldCheck, X } from "lucide-react";
import { AdendaModal, ExtensionModal } from "@/components/adenda-modals";

type AdendaApi = {
  id: string;
  contractId: string;
  snapshotId: string | null;
  tipo: string;
  version: number;
  storageKey: string | null;
  filename: string;
  sizeBytes: number | null;
  sha256: string | null;
  estadoGeneracion: string;
  error: string | null;
  createdAt: string | null;
  codigoContrato: string;
  estadoContrato: string;
  clienteNombre: string | null;
  clienteApellidos: string | null;
  clienteDocumento: string | null;
  departamentoNombre: string | null;
  departamentoCodigo: string | null;
};

type ContractPick = {
  id: string;
  codigoContrato: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  estado: string;
};

const TIPOS_ELIGIBLES = ["EMITIDO", "PENDIENTE_FIRMA", "FIRMADO", "NOTARIADO"];

export default function AdendasPage() {
  const [adendas, setAdendas] = useState<AdendaApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificacion, setVerificacion] = useState<Record<string, boolean | undefined>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"adenda" | "extension">("adenda");
  const [pickerContracts, setPickerContracts] = useState<ContractPick[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const [selected, setSelected] = useState<ContractPick | null>(null);
  const [showAdenda, setShowAdenda] = useState(false);
  const [showExtension, setShowExtension] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/adendas");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as { items: AdendaApi[] };
      setAdendas(data.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function fmtFecha(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" });
  }

  function estadoVencimiento(c: ContractPick): { orden: number; etiqueta: string; clase: string; fila: string } {
    if (!c.fechaFin) return { orden: 3, etiqueta: "Sin término", clase: "text-on-surface-variant", fila: "" };
    const hoy = new Date().toISOString().slice(0, 10);
    const fin = String(c.fechaFin).slice(0, 10);
    if (fin < hoy) {
      const dias = Math.round((Date.now() - new Date(fin).getTime()) / 86400000);
      return { orden: 0, etiqueta: `Finalizado (venció hace ${dias} d)`, clase: "text-destructive", fila: "border-l-4 border-l-destructive bg-destructive/5" };
    }
    const dias = Math.round((new Date(fin).getTime() - Date.now()) / 86400000);
    if (dias <= 30) return { orden: 1, etiqueta: `Vence en ${dias} d`, clase: "text-tertiary-container-foreground", fila: "border-l-4 border-l-green-600 bg-green-500/5" };
    return { orden: 2, etiqueta: `Vence en ${dias} d`, clase: "text-green-600", fila: "border-l-4 border-l-green-600 bg-green-500/5" };
  }

  async function abrirPicker(mode: "adenda" | "extension") {
    setError(null);
    setPickerMode(mode);
    setPickerOpen(true);
    setPickerLoading(true);
    setPickerContracts([]);
    try {
      const res = await apiFetch("/api/contracts");
      if (!res.ok) throw new Error("No se pudieron cargar los contratos");
      const data = (await res.json()) as ContractPick[];
      const elegibles = data
        .filter((c) => TIPOS_ELIGIBLES.includes(c.estado))
        .sort((a, b) => {
          const oa = estadoVencimiento(a).orden;
          const ob = estadoVencimiento(b).orden;
          if (oa !== ob) return oa - ob;
          const fa = String(a.fechaFin ?? "9999");
          const fb = String(b.fechaFin ?? "9999");
          return fa.localeCompare(fb);
        });
      setPickerContracts(elegibles);
    } catch (e) {
      setError((e as Error).message);
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  }

  function elegirContrato(c: ContractPick) {
    setPickerOpen(false);
    setSelected(c);
    if (pickerMode === "extension") {
      if (!c.fechaFin) {
        alert("Este contrato no tiene fecha de término registrada.");
        return;
      }
      setShowExtension(true);
    } else {
      setShowAdenda(true);
    }
  }

  async function descargarAdenda(d: AdendaApi) {
    setDownloadingId(d.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/documents/pdf?documentId=${encodeURIComponent(d.id)}`);
      if (!res.ok) throw new Error("No se pudo descargar la adenda");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.filename || `adenda-${d.codigoContrato}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function verificarAdenda(d: AdendaApi) {
    setVerificacion((v) => ({ ...v, [d.id]: undefined }));
    try {
      const res = await apiFetch(`/api/documents/${d.id}/verify`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setVerificacion((v) => ({ ...v, [d.id]: Boolean(body.ok) }));
    } catch {
      setVerificacion((v) => ({ ...v, [d.id]: false }));
    }
  }

  const puedeDescargar = (d: AdendaApi) =>
    d.estadoGeneracion === "GENERADO" && (d.sha256 || d.storageKey);

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileCheck className="h-6 w-6 text-primary" />
            <h2 className="font-headline-lg text-primary">Adendas</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void abrirPicker("adenda")}
              className="inline-flex shrink-0 items-center gap-2 rounded bg-primary px-4 py-2 font-label-md text-on-primary"
            >
              <Plus className="h-4 w-4" />
              Nueva adenda
            </button>
            <button
              onClick={() => void abrirPicker("extension")}
              className="inline-flex shrink-0 items-center gap-2 rounded border border-primary bg-primary/10 px-4 py-2 font-label-md text-primary"
            >
              <CalendarPlus className="h-4 w-4" />
              Adenda de extensión
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            Error: {error}
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Cargando adendas…</p>
        ) : adendas.length === 0 ? (
          <p className="rounded-lg bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant">
            Aún no hay adendas generadas. Crea una desde el detalle de un contrato emitido o firmado.
          </p>
        ) : (
          <TableScroll className="w-full rounded-md border">
            <div className="max-h-[40rem] overflow-y-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 z-10 bg-[#151a24] text-left text-xs text-white/80">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código adenda</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Contrato</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Departamento</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {adendas.map((d) => (
                    <tr key={d.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2 font-mono-label font-medium">
                        {d.filename.replace(/\.pdf$/i, "")}
                      </td>
                      <td className="px-3 py-2">
                        {d.tipo === "ADENDA_EXTENSION" ? "Adenda de extensión" : "Adenda"}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/contratos/${d.contractId}`}
                          className="font-mono-label text-primary hover:underline"
                        >
                          {d.codigoContrato}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {[d.clienteNombre, d.clienteApellidos].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {[d.departamentoCodigo, d.departamentoNombre].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtFecha(d.createdAt)}</td>
                      <td className="px-3 py-2">
                        {d.estadoGeneracion === "GENERADO" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            Generado
                          </span>
                        ) : d.estadoGeneracion === "ERROR" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                            Error
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{d.estadoGeneracion}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          {puedeDescargar(d) ? (
                            <button
                              type="button"
                              onClick={() => void descargarAdenda(d)}
                              disabled={downloadingId === d.id}
                              className="inline-flex items-center gap-1 text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {downloadingId === d.id ? "…" : "Descargar"}
                            </button>
                          ) : null}
                          {d.sha256 && d.estadoGeneracion === "GENERADO" ? (
                            verificacion[d.id] === undefined ? (
                              <button
                                type="button"
                                onClick={() => void verificarAdenda(d)}
                                className="inline-flex items-center gap-1 text-on-surface-variant hover:text-primary"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Verificar
                              </button>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 font-mono-label ${
                                  verificacion[d.id] ? "text-primary" : "text-destructive"
                                }`}
                              >
                                {verificacion[d.id] ? "✓ íntegro" : "✗ alterado"}
                              </span>
                            )
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableScroll>
        )}
      </div>

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline-md text-on-surface">
                {pickerMode === "extension" ? "Elegir contrato para extender" : "Elegir contrato para adenda"}
              </h3>
              <button onClick={() => setPickerOpen(false)} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {pickerLoading ? (
              <p className="py-8 text-center font-body-sm text-on-surface-variant">Cargando contratos…</p>
            ) : pickerContracts.length === 0 ? (
              <p className="rounded-md bg-surface-container-high p-4 text-center font-body-sm text-on-surface-variant">
                No hay contratos emitidos, firmados o notariados para agregarles una adenda.
              </p>
            ) : (
              <ul className="space-y-2">
                {pickerContracts.map((c) => {
                  const v = estadoVencimiento(c);
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => elegirContrato(c)}
                        className={`flex w-full flex-col gap-0.5 rounded-lg border border-outline-variant px-3 py-2.5 text-left transition-colors hover:bg-surface-container dark:border-transparent ${v.fila}`}
                      >
                        <span className="font-mono-label font-medium text-on-surface">{c.codigoContrato}</span>
                        <span className="font-body-sm text-on-surface-variant">
                          {[c.clienteNombre, c.apellidoCliente].filter(Boolean).join(" ")} · {c.departamentoNombre}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 font-body-xs text-on-surface-variant">
                          <span>{c.estado}</span>
                          {c.fechaFin ? <span>· {c.fechaFin}</span> : null}
                          <span className={`font-medium ${v.clase}`}>{v.etiqueta}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {showAdenda && selected ? (
        <AdendaModal
          contractId={selected.id}
          codigoContrato={selected.codigoContrato}
          onClose={() => {
            setShowAdenda(false);
            setSelected(null);
          }}
          onCreated={async () => {
            setShowAdenda(false);
            setSelected(null);
            await load();
          }}
        />
      ) : null}

      {showExtension && selected?.fechaFin ? (
        <ExtensionModal
          contractId={selected.id}
          codigoContrato={selected.codigoContrato}
          fechaFin={selected.fechaFin}
          onClose={() => {
            setShowExtension(false);
            setSelected(null);
          }}
          onCreated={async () => {
            setShowExtension(false);
            setSelected(null);
            await load();
          }}
        />
      ) : null}
    </DashboardShell>
  );
}