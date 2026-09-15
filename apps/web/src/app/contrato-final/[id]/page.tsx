"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, CalendarPlus, Download, File, FileText, ShieldCheck, Upload } from "lucide-react";
import { AdendaModal, ExtensionModal } from "@/components/adenda-modals";

type ContractDetail = {
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
  separacion?: boolean;
  muebleriaItems?: string[];
  mascotasItems?: string[];
  cliente: {
    id: string;
    nombres: string;
    apellidos: string | null;
    documentoIdentidad: string | null;
    ruc: string | null;
    tipoPersona: string | null;
    email: string | null;
    telefono: string | null;
  };
  departamento: { id: string; nombre: string; codigo?: string | null };
  plantillaVersion: { id: string; version: number };
  snapshot: {
    id: string;
    codigoContrato: string;
    datosCliente: Record<string, unknown>;
    datosDepartamento: Record<string, unknown>;
    datosContrato: Record<string, unknown>;
    clausulas: Array<{ versionId: string; contenido: string }>;
    anexos: Array<{ versionId: string; contenido: string }>;
    inmutable: boolean;
    emitidoEn: string | null;
  } | null;
};

type Document = {
  id: string;
  tipo: string;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  estadoGeneracion: string;
  error: string | null;
  snapshotId: string | null;
  storageKey: string | null;
  createdAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  FIRMADO: "Firmado",
  NOTARIADO: "Notariado",
  EMITIDO: "Emitido",
};

const UPLOAD_SLOTS = [
  ["VOUCHER_MENSUALIDAD", "Boleta 1ra mensualidad"] as const,
  ["VOUCHER_GARANTIA", "Boleta garantía y mantenimiento"] as const,
  ["CONTRATO_NOTARIADO", "Contrato notariado"] as const,
];

export default function ContratoFinalDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [registeringClient, setRegisteringClient] = useState(false);
  const [clientMessage, setClientMessage] = useState<string | null>(null);
  const [notariando, setNotariando] = useState(false);
  const [notaryMessage, setNotaryMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"ficha" | "adendas">("ficha");
  const [showAdenda, setShowAdenda] = useState(false);
  const [showExtension, setShowExtension] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cr, dr] = await Promise.all([
        apiFetch(`/api/contracts/${id}`),
        apiFetch(`/api/documents?contractId=${id}`),
      ]);
      if (!cr.ok) {
        const body = await cr.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${cr.status}`);
      }
      setContract((await cr.json()) as ContractDetail);
      if (dr.ok) setDocuments(((await dr.json()) as { items: Document[] }).items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const adendas = useMemo(
    () => documents.filter((d) => ["ADENDA", "ADENDA_EXTENSION"].includes(d.tipo)),
    [documents]
  );

  async function subirDocumento(tipo: string, file: File) {
    setUploading(tipo);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", tipo);
      const res = await fetch(`/api/contracts/${id}/documents`, {
        method: "POST",
        headers: { "x-user-email": "admin@sistema.com" },
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo subir el documento");
      }
      await load();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  async function registrarComoCliente() {
    if (!contract) return;
    setRegisteringClient(true);
    setClientMessage(null);
    try {
      const res = await apiFetch(`/api/contracts/${id}/client`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo registrar como cliente");
      setClientMessage("Registrado como cliente. Ya aparece en la pestaña Clientes.");
    } catch (e) {
      setClientMessage((e as Error).message);
    } finally {
      setRegisteringClient(false);
    }
  }

  async function notariarContrato() {
    setNotariando(true);
    setNotaryMessage(null);
    try {
      const res = await apiFetch(`/api/contracts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notariar" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo notariar el contrato");
      setNotaryMessage("Contrato notariado correctamente.");
      await load();
    } catch (e) {
      setNotaryMessage((e as Error).message);
    } finally {
      setNotariando(false);
    }
  }

  function abrirSelector(tipo: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) subirDocumento(tipo, file);
    };
    input.click();
  }

  async function descargarDocumento(d: Document) {
    try {
      const url =
        d.tipo === "CONTRATO_PDF"
          ? `/api/documents/notarial?contractId=${encodeURIComponent(id)}`
          : d.storageKey
            ? `/api/documents/pdf?documentId=${encodeURIComponent(d.id)}`
            : `/api/documents/pdf?snapshotId=${encodeURIComponent(d.snapshotId ?? "")}`;
      const res = await fetch(url, { headers: { "x-user-email": "admin@sistema.com" } });
      if (!res.ok) throw new Error("Error al descargar");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = d.filename || "documento.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setUploadError((e as Error).message);
    }
  }

  async function verificarDocumento(documentId: string) {
    try {
      const res = await apiFetch(`/api/documents/${documentId}/verify`, { method: "POST" });
      if (!res.ok) throw new Error("No se pudo verificar el documento");
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function fmtCurrency(val: string): string {
    return Number(val).toLocaleString("es-PE", { style: "currency", currency: "PEN" });
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/contrato-final"
          className="inline-flex items-center gap-2 font-label-md text-primary hover:text-primary-container"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a contratos finales
        </Link>

        {error ? (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            Error: {error}
          </div>
        ) : loading ? (
          <p className="py-16 text-center text-on-surface-variant">Cargando contrato…</p>
        ) : !contract ? (
          <p className="py-16 text-center text-on-surface-variant">Contrato no encontrado.</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
              <div>
                <h2 className="font-headline-lg text-primary mb-1">{contract.codigoContrato}</h2>
                <p className="font-body-sm text-on-surface-variant">
                  {[contract.cliente.nombres, contract.cliente.apellidos].filter(Boolean).join(" ")} · {contract.departamento.nombre}
                </p>
              </div>
              <span className="rounded-full bg-primary-container px-3 py-1 font-mono-label text-primary-container-foreground">
                {STATUS_LABEL[contract.estado] ?? contract.estado}
              </span>
              {contract.snapshot ? (
                <a
                  href={`/api/documents/notarial?contractId=${encodeURIComponent(id)}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded border border-primary bg-primary/10 px-3 py-2 font-label-md text-primary hover:bg-primary/20"
                >
                  <Download className="h-4 w-4" />
                  Descargar PDF (contrato + copia DNI)
                </a>
              ) : null}
            </div>

            {/* ── Tab bar ── */}
            <div className="flex gap-1 rounded-lg bg-surface-container p-1">
              <button
                onClick={() => setActiveTab("ficha")}
                className={`flex-1 rounded-md px-4 py-2 font-label-md transition-colors ${activeTab === "ficha" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"}`}
              >
                Ficha del contrato
              </button>
              <button
                onClick={() => setActiveTab("adendas")}
                className={`flex-1 rounded-md px-4 py-2 font-label-md transition-colors ${activeTab === "adendas" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"}`}
              >
                Adendas
                {adendas.length > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-container px-1.5 text-xs font-mono-label text-primary-container-foreground">
                    {adendas.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "ficha" ? (
              <>
                {/* ── Ficha del contrato final ── */}
                <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
                  <h3 className="mb-4 font-headline-md text-primary">Ficha del contrato final</h3>

                  {/* Documentos adjuntos — arriba */}
                  <div className="mb-6">
                    <div className="mb-4 flex flex-col justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
                      <div>
                        <h4 className="font-label-md text-on-surface">Cliente del contrato</h4>
                        <p className="mt-1 font-body-sm text-on-surface-variant">
                          Registra al firmante para que aparezca en Clientes.
                        </p>
                      </div>
                      <button
                        onClick={registrarComoCliente}
                        disabled={registeringClient}
                        className="rounded bg-primary px-3 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {registeringClient ? "Registrando…" : "Registrar como cliente"}
                      </button>
                    </div>
                    {clientMessage ? (
                      <p className="mb-3 rounded-md bg-surface-container px-3 py-2 font-body-sm text-on-surface-variant">
                        {clientMessage}
                      </p>
                    ) : null}
                    {contract.estado === "FIRMADO" ? (
                      <div className="mb-4 flex flex-col justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
                        <div>
                          <h4 className="font-label-md text-on-surface">Notariar contrato</h4>
                          <p className="mt-1 font-body-sm text-on-surface-variant">
                            Adjunta el voucher de pago y el contrato notariado antes de continuar.
                          </p>
                        </div>
                        <button
                          onClick={notariarContrato}
                          disabled={notariando}
                          className="rounded bg-primary px-3 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {notariando ? "Notariando…" : "Notariar contrato"}
                        </button>
                      </div>
                    ) : null}
                    {notaryMessage ? (
                      <p className="mb-3 rounded-md bg-surface-container px-3 py-2 font-body-sm text-on-surface-variant">
                        {notaryMessage}
                      </p>
                    ) : null}
                    <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
                      Documentos adjuntos
                    </h4>
                    {uploadError ? (
                      <p className="mb-3 rounded-md bg-error-container px-3 py-2 font-body-sm text-error-container-foreground">
                        {uploadError}
                      </p>
                    ) : null}
                    <div className="grid gap-4 sm:grid-cols-3">
                      {UPLOAD_SLOTS.map(([tipo, label]) => {
                        const doc = documents.find((d) => d.tipo === tipo);
                        const isUploading = uploading === tipo;
                        return (
                          <div
                            key={tipo}
                            className="rounded-lg border border-outline-variant bg-surface-container-low/30 p-4 dark:border-transparent"
                          >
                            <p className="mb-2 font-label-md text-on-surface">{label}</p>
                            {doc ? (
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0 text-primary" />
                                <span className="flex-1 truncate font-body-sm text-on-surface">
                                  {doc.filename}
                                </span>
                                <span className="font-mono-label text-on-surface-variant">
                                  {(doc.sizeBytes / 1024).toFixed(0)} KB
                                </span>
                                <button
                                  onClick={() => descargarDocumento(doc)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded border border-outline-variant px-2 py-1 font-label-md text-primary hover:bg-surface-container dark:border-transparent"
                                >
                                  <Download className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => abrirSelector(tipo)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded border border-outline-variant px-2 py-1 font-label-md text-on-surface-variant hover:bg-surface-container dark:border-transparent"
                                >
                                  Reemplazar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => abrirSelector(tipo)}
                                disabled={isUploading}
                                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant bg-transparent px-4 py-3 font-label-md text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-transparent"
                              >
                                <Upload className="h-4 w-4" />
                                {isUploading ? "Subiendo…" : "Subir archivo"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tabla de datos — abajo */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Datos del contrato */}
                    <div>
                      <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
                        Datos del contrato
                      </h4>
                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="font-label-md text-on-surface-variant">ID Departamento</dt>
                          <dd className="font-mono-label text-on-surface">{contract.departamento.id.slice(0, 8)}…</dd>
                        </div>
                        <div>
                          <dt className="font-label-md text-on-surface-variant">N. Departamento</dt>
                          <dd className="font-body-md text-on-surface">
                            {String(
                              contract.snapshot?.datosDepartamento?.codigo ??
                              contract.departamento.codigo ??
                              contract.departamento.nombre ?? "—"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-label-md text-on-surface-variant">Lugar</dt>
                          <dd className="font-body-md text-on-surface">
                            {String(contract.snapshot?.datosDepartamento?.personaPago ?? "—")}
                            {contract.snapshot?.datosDepartamento?.piso
                              ? ` · Piso ${contract.snapshot.datosDepartamento.piso}`
                              : ""}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-label-md text-on-surface-variant">Arrendatario</dt>
                          <dd className="font-body-md text-on-surface">
                            {[contract.cliente.nombres, contract.cliente.apellidos].filter(Boolean).join(" ") || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-label-md text-on-surface-variant">Teléfono</dt>
                          <dd className="font-body-md text-on-surface">{contract.cliente.telefono ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="font-label-md text-on-surface-variant">DNI / RUC</dt>
                          <dd className="font-body-md text-on-surface">
                            {contract.cliente.documentoIdentidad ?? "—"}
                            {contract.cliente.ruc ? ` / ${contract.cliente.ruc}` : ""}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Montos */}
                    <div>
                      <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
                        Montos
                      </h4>
                      <dl className="grid grid-cols-1 gap-3">
                        <div className="flex items-center justify-between rounded-md bg-surface-container-high px-4 py-3">
                          <dt className="font-label-md text-on-surface-variant">Mensualidad</dt>
                          <dd className="font-body-lg font-semibold text-on-surface">
                            {fmtCurrency(contract.montoCanonMensual)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-surface-container-high px-4 py-3">
                          <dt className="font-label-md text-on-surface-variant">Garantía</dt>
                          <dd className="font-body-lg font-semibold text-on-surface">
                            {fmtCurrency(contract.depositoGarantia)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-surface-container-high px-4 py-3">
                          <dt className="font-label-md text-on-surface-variant">Mantenimiento (mensual)</dt>
                          <dd className="font-body-lg font-semibold text-on-surface">
                            {fmtCurrency(contract.mantenimiento ?? "0")}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-surface-container-high px-4 py-3">
                          <dt className="font-label-md text-on-surface-variant">Período</dt>
                          <dd className="font-body-md text-on-surface">
                            {contract.fechaInicio} → {contract.fechaFin}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>

                {/* Vista previa del contrato */}
                {contract.snapshot ? (
                  <div className="overflow-hidden rounded-lg border border-outline-variant bg-white shadow-sm">
                    <div className="border-b border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface-variant sm:px-6">
                      <span className="font-label-md uppercase tracking-wider">Vista previa del contrato</span>
                    </div>
                    <div className="space-y-6 px-4 py-8 text-black sm:px-6">
                      <div className="border-b border-neutral-300 pb-4 text-center">
                        <h2 className="text-lg font-extrabold tracking-wide">CONTRATO DE ARRENDAMIENTO</h2>
                        <p className="mt-1 font-mono-label text-neutral-500">{contract.snapshot.codigoContrato}</p>
                      </div>

                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                          <h3 className="mb-2 font-label-md uppercase tracking-wider text-neutral-500">EL ARRENDATARIO</h3>
                          <p className="font-semibold">
                            {[contract.snapshot.datosCliente.nombres, contract.snapshot.datosCliente.apellidos].filter(Boolean).join(" ") || "—"}
                          </p>
                          <p className="text-sm text-neutral-600">
                            {contract.snapshot.datosCliente.tipoPersona as string} · DNI {(contract.snapshot.datosCliente.documentoIdentidad as string) ?? "—"}
                          </p>
                        </div>
                        <div>
                          <h3 className="mb-2 font-label-md uppercase tracking-wider text-neutral-500">EL INMUEBLE</h3>
                          <p className="font-semibold">
                            {(contract.snapshot.datosDepartamento.nombre as string) ?? ""} · {(contract.snapshot.datosDepartamento.codigo as string) ?? ""}
                          </p>
                        </div>
                      </div>

                      <section>
                        <h3 className="mb-3 border-b border-neutral-300 pb-1 font-label-md uppercase tracking-wider text-neutral-500">
                          CLÁUSULAS
                        </h3>
                        {contract.snapshot.clausulas.map((c, i) => (
                          <div key={c.versionId} className="mb-3">
                            <p className="mb-0.5 text-sm font-bold text-neutral-700">Cláusula {i + 1}.</p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{c.contenido}</p>
                          </div>
                        ))}
                      </section>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              /*── Pestaña Adendas ── */
              <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-headline-md text-primary">Adendas</h3>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setShowAdenda(true)} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-label-md text-on-primary">
                      <File className="h-4 w-4" />
                      Nueva adenda
                    </button>
                    <button onClick={() => setShowExtension(true)} className="inline-flex items-center gap-2 rounded border border-primary bg-primary/10 px-4 py-2 font-label-md text-primary">
                      <CalendarPlus className="h-4 w-4" />
                      Adenda de extensión
                    </button>
                  </div>
                </div>
                {adendas.length === 0 ? (
                  <p className="py-10 text-center font-body-sm text-on-surface-variant">
                    Este contrato aún no tiene adendas.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {adendas.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded border border-outline-variant bg-surface-container-low/30 px-4 py-3 dark:border-transparent"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="h-5 w-5 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <p className="truncate font-label-md text-on-surface">
                              {d.tipo === "ADENDA_EXTENSION" ? "Adenda de extensión" : "Adenda"} · v{d.version}
                            </p>
                            <p className="font-body-xs text-on-surface-variant">
                              {d.filename} · {new Date(d.createdAt ?? Date.now()).toLocaleDateString("es-PE")}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {d.sha256 ? (
                            <button
                              onClick={() => verificarDocumento(d.id)}
                              className="inline-flex items-center gap-1 rounded border border-outline-variant px-2 py-1 font-label-md text-on-surface-variant hover:bg-surface-container dark:border-transparent"
                              title="Verificar"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <a
                            href={`/api/documents/pdf?documentId=${encodeURIComponent(d.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-outline-variant px-2 py-1 font-label-md text-primary hover:bg-surface-container dark:border-transparent"
                            download
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {showAdenda ? (
              <AdendaModal
                contractId={id}
                codigoContrato={contract.codigoContrato}
                onClose={() => setShowAdenda(false)}
                onCreated={async () => {
                  setShowAdenda(false);
                  await load();
                }}
              />
            ) : null}
            {showExtension ? (
              <ExtensionModal
                contractId={id}
                codigoContrato={contract.codigoContrato}
                fechaFin={contract.fechaFin}
                onClose={() => setShowExtension(false)}
                onCreated={async () => {
                  setShowExtension(false);
                  await load();
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
