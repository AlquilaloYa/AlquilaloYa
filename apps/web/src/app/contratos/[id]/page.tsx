"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, ArrowLeft, CalendarPlus, Download, FileText, ShieldCheck, Upload, X } from "lucide-react";

type SnapshotCliente = {
  id: string;
  nombres?: string;
  apellidos?: string;
  documentoIdentidad?: string;
  tipoPersona?: string;
  email?: string | null;
  telefono?: string | null;
  ruc?: string | null;
};

type SnapshotDepartamento = {
  id: string;
  codigo?: string;
  nombre?: string;
  personaPago?: string;
  piso?: number;
};

type SnapshotContrato = {
  codigoContrato: string;
  montoCanonMensual?: string;
  depositoGarantia?: string;
  fechaInicio: string;
  fechaFin: string;
};

type Snapshot = {
  id: string;
  codigoContrato: string;
  datosCliente: SnapshotCliente;
  datosDepartamento: SnapshotDepartamento;
  datosContrato: SnapshotContrato;
  clausulas: Array<{ versionId: string; contenido: string }>;
  anexos: Array<{ versionId: string; contenido: string }>;
  inmutable: boolean;
  emitidoEn: string | null;
  createdAt: string;
};

type SnapshotActivityItem = {
  id: string;
  timestamp: string;
  action: string;
  result: string;
};

type ContractDetail = {
  id: string;
  codigoContrato: string;
  clienteId: string;
  departamentoId: string;
  plantillaVersionId: string;
  montoCanonMensual: string;
  depositoGarantia: string;
  mantenimiento?: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  snapshotId: string | null;
  renovadoDe?: string | null;
  separacion?: boolean;
  muebleriaItems?: string[];
  mascotasItems?: string[];
  motivoResolucion?: string | null;
  resueltoEn?: string | null;
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
  departamento: { id: string; nombre: string };
  plantillaVersion: { id: string; version: number };
  snapshot: Snapshot | null;
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
  BORRADOR: "Borrador",
  PENDIENTE_EMISION: "Pendiente emisión",
  EMITIDO: "Emitido",
  PENDIENTE_FIRMA: "Pendiente firma",
  FIRMADO: "Firmado",
  NOTARIADO: "Notariado",
  RESUELTO: "Resuelto",
  CANCELADO: "Cancelado",
};

export default function ContratoDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [snapshotActivity, setSnapshotActivity] = useState<SnapshotActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [showAdenda, setShowAdenda] = useState(false);
  const [showExtension, setShowExtension] = useState(false);
  const [verificacion, setVerificacion] = useState<
    Record<string, boolean | undefined>
  >({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function descargarPdf() {
    setDescargando(true);
    setErrorPdf(null);
    try {
      const res = await fetch(`/api/documents/notarial?contractId=${id}`, {
        headers: { "x-user-email": "admin@sistema.com" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrato-${contract?.codigoContrato ?? id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorPdf((e as Error).message);
    } finally {
      setDescargando(false);
    }
  }

  async function descargarDocumento(d: Document) {
    setErrorPdf(null);
    try {
      const url =
        d.tipo === "CONTRATO_PDF"
          ? `/api/documents/notarial?contractId=${encodeURIComponent(id)}`
          : d.storageKey
            ? `/api/documents/pdf?documentId=${encodeURIComponent(d.id)}`
            : `/api/documents/pdf?snapshotId=${encodeURIComponent(d.snapshotId ?? "")}`;
      const res = await fetch(url, {
        headers: { "x-user-email": "admin@sistema.com" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
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
      setErrorPdf((e as Error).message);
    }
  }

  async function verificarDocumento(d: Document) {
    setErrorPdf(null);
    setVerificacion((v) => ({ ...v, [d.id]: undefined }));
    try {
      const res = await fetch(`/api/documents/${d.id}/verify`, {
        headers: { "x-user-email": "admin@sistema.com" },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setVerificacion((v) => ({ ...v, [d.id]: Boolean(body.ok) }));
    } catch {
      setVerificacion((v) => ({ ...v, [d.id]: false }));
    }
  }

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cr, dr, ar] = await Promise.all([
        apiFetch(`/api/contracts/${id}`),
        apiFetch(`/api/documents?contractId=${id}`),
        apiFetch(`/api/activity?entityId=${id}`),
      ]);
      if (!cr.ok) {
        const body = await cr.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${cr.status}`);
      }
      const c = (await cr.json()) as ContractDetail;
      setContract(c);
      if (dr.ok) setDocuments(((await dr.json()) as { items: Document[] }).items ?? []);
      if (ar.ok) setSnapshotActivity(((await ar.json()) as { items: SnapshotActivityItem[] }).items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const adendas = documents.filter(
    (d) => d.tipo === "ADENDA" || d.tipo === "ADENDA_EXTENSION"
  );
  const documentosGenerados = documents.filter(
    (d) => d.tipo !== "ADENDA" && d.tipo !== "ADENDA_EXTENSION"
  );

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/contratos"
          className="inline-flex items-center gap-2 font-label-md text-primary hover:text-primary-container"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a contratos
        </Link>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando contrato…
          </div>
        ) : !contract ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center font-body-sm text-on-surface-variant">
            Contrato no encontrado.
          </div>
        ) : (
          <>
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
              <div>
                <h2 className="font-headline-lg text-primary mb-1">{contract.codigoContrato}</h2>
                <p className="font-body-sm text-on-surface-variant">
                  {contract.cliente.nombres} {contract.cliente.apellidos} · {contract.departamento.nombre}
                </p>
              </div>
              <span className="rounded-full bg-primary-container px-3 py-1 font-mono-label text-primary-container-foreground">
                {STATUS_LABEL[contract.estado] ?? contract.estado}
              </span>
            </div>

            {contract.estado === "RESUELTO" || contract.motivoResolucion ? (
              <div className="rounded-lg border border-error/40 bg-error-container/40 p-4">
                <p className="font-label-md text-error-container-foreground uppercase tracking-wider">Resolución del contrato</p>
                <p className="mt-1 font-body-md text-on-surface">{contract.motivoResolucion ?? "Sin motivo registrado."}</p>
                {contract.resueltoEn ? (
                  <p className="mt-1 font-body-sm text-on-surface-variant">
                    Resuelto el {new Date(contract.resueltoEn).toLocaleDateString("es-PE")}{" "}
                    a las {new Date(contract.resueltoEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {contract.renovadoDe ? (
              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4 dark:border-transparent">
                <p className="font-body-sm text-on-surface-variant">
                  Este contrato es una <strong className="text-on-surface">renovación</strong> de uno anterior
                  (mismo cliente, departamento y condiciones).
                </p>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
                <h3 className="mb-4 font-headline-md text-primary">Datos del contrato</h3>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="font-label-md text-on-surface-variant uppercase tracking-wider">Mensualidad</dt>
                    <dd className="font-body-md text-on-surface">{contract.montoCanonMensual}</dd>
                  </div>
                  <div>
                    <dt className="font-label-md text-on-surface-variant uppercase tracking-wider">Mantenimiento (mensual)</dt>
                    <dd className="font-body-md text-on-surface">
                      {Number(contract.mantenimiento ?? "0").toLocaleString("es-PE", { style: "currency", currency: "PEN" })}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label-md text-on-surface-variant uppercase tracking-wider">Garantía</dt>
                    <dd className="font-body-md text-on-surface">{contract.depositoGarantia}</dd>
                  </div>
                  <div>
                    <dt className="font-label-md text-on-surface-variant uppercase tracking-wider">Inicio</dt>
                    <dd className="font-body-md text-on-surface">{contract.fechaInicio}</dd>
                  </div>
                  <div>
                    <dt className="font-label-md text-on-surface-variant uppercase tracking-wider">Fin</dt>
                    <dd className="font-body-md text-on-surface">{contract.fechaFin}</dd>
                  </div>
                  <div>
                    <dt className="font-label-md text-on-surface-variant uppercase tracking-wider">Versión plantilla</dt>
                    <dd className="font-body-md text-on-surface">v{contract.plantillaVersion.version}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-headline-md text-primary">
                    <ShieldCheck className="h-5 w-5" />
                    Documentos
                  </h3>
<div className="flex items-center gap-2">
                      {contract.snapshot ? (
                        <button
                          onClick={descargarPdf}
                          disabled={descargando}
                          title="Descargar PDF del contrato con copia de DNI"
                          className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 font-label-md text-on-primary shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Download className="h-4 w-4" />
                          {descargando ? "Generando…" : "Descargar PDF"}
                        </button>
                      ) : null}
                   </div>
                </div>
                {errorPdf ? (
                  <p className="mb-3 rounded-md bg-error-container px-3 py-2 font-body-sm text-error-container-foreground">
                    {errorPdf}
                  </p>
                ) : null}
                {documentosGenerados.length === 0 ? (
                  <p className="font-body-sm text-on-surface-variant">
                    Aún no hay documentos generados para este contrato.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {documentosGenerados.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 rounded-md bg-surface-container-high p-3">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <div className="flex-1">
                          <p className="font-body-sm text-on-surface">{d.filename}</p>
                          <span className="font-mono-label text-on-surface-variant">
                            {d.tipo} · v{d.version} · {d.estadoGeneracion}
                            {d.sizeBytes ? ` · ${(d.sizeBytes / 1024).toFixed(1)} KB` : ""}
                            {d.storageKey ? " · en storage" : ""}
                          </span>
                        </div>
                        {d.estadoGeneracion === "GENERADO" && d.sha256 ? (
                          verificacion[d.id] === undefined ? null : (
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 font-mono-label ${
                                verificacion[d.id] ? "text-primary" : "text-destructive"
                              }`}
                            >
                              {verificacion[d.id] ? "✓ íntegro" : "✗ alterado"}
                            </span>
                          )
                        ) : null}
                        {d.estadoGeneracion === "GENERADO" && d.sha256 && d.storageKey ? (
                          <button
                            onClick={() => verificarDocumento(d)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-on-surface-variant hover:bg-surface-container dark:border-transparent"
                          >
                            <ShieldCheck className="h-4 w-4" />
                            Verificar
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Ficha del contrato final ── */}
            <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
              <h3 className="mb-4 font-headline-md text-primary">Ficha del contrato final</h3>

              {/* Documentos adjuntos — arriba */}
              <div className="mb-6">
                <h4 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">
                  Documentos adjuntos
                </h4>
                {uploadError ? (
                  <p className="mb-3 rounded-md bg-error-container px-3 py-2 font-body-sm text-error-container-foreground">
                    {uploadError}
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      ["VOUCHER_MENSUALIDAD", "Boleta 1ra mensualidad"],
                      ["VOUCHER_GARANTIA", "Boleta garantía y mantenimiento"],
                      ["CONTRATO_NOTARIADO", "Contrato notariado"],
                    ] as const
                  ).map(([tipo, label]) => {
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
                        {contract.snapshot?.datosDepartamento.codigo ?? contract.departamento.nombre}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-label-md text-on-surface-variant">Lugar</dt>
                      <dd className="font-body-md text-on-surface">
                        {contract.snapshot?.datosDepartamento.personaPago ?? "—"}
                        {contract.snapshot?.datosDepartamento.piso
                          ? ` · Piso ${contract.snapshot.datosDepartamento.piso}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-label-md text-on-surface-variant">Arrendatario</dt>
                      <dd className="font-body-md text-on-surface">
                        {[contract.cliente.nombres, contract.cliente.apellidos]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-label-md text-on-surface-variant">Teléfono</dt>
                      <dd className="font-body-md text-on-surface">
                        {contract.cliente.telefono ?? "—"}
                      </dd>
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
                        {Number(contract.montoCanonMensual).toLocaleString("es-PE", {
                          style: "currency",
                          currency: "PEN",
                        })}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-surface-container-high px-4 py-3">
                      <dt className="font-label-md text-on-surface-variant">Garantía</dt>
                      <dd className="font-body-lg font-semibold text-on-surface">
                        {Number(contract.depositoGarantia).toLocaleString("es-PE", {
                          style: "currency",
                          currency: "PEN",
                        })}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-surface-container-high px-4 py-3">
                      <dt className="font-label-md text-on-surface-variant">Mantenimiento (mensual)</dt>
                      <dd className="font-body-lg font-semibold text-on-surface">
                        {Number(contract.mantenimiento ?? "0").toLocaleString("es-PE", {
                          style: "currency",
                          currency: "PEN",
                        })}
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

            {/* ── Adendas ── */}
            <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-headline-md text-primary">
                  <FileText className="h-5 w-5" />
                  Adendas
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowAdenda(true)}
                    className="inline-flex shrink-0 items-center gap-2 rounded border border-outline-variant px-3 py-2 font-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary dark:border-transparent"
                  >
                    <FileText className="h-4 w-4" />
                    Nueva adenda
                  </button>
                  <button
                    onClick={() => setShowExtension(true)}
                    className="inline-flex shrink-0 items-center gap-2 rounded border border-outline-variant px-3 py-2 font-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary dark:border-transparent"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    Adenda de extensión
                  </button>
                </div>
              </div>
              <p className="mb-4 rounded-md bg-surface-container-high px-3 py-2 font-body-sm text-on-surface-variant">
                La adenda de extensión se usa cuando al cliente le quedan 2 meses
                o el contrato está por finalizar: amplía la fecha de término,
                actualiza el contrato y genera las cuotas de los meses
                extendidos.
              </p>
              {adendas.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant">
                  Aún no hay adendas para este contrato.
                </p>
              ) : (
                <ul className="space-y-3">
                  {adendas.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-md bg-surface-container-high p-3">
                      <FileText className="h-5 w-5 shrink-0 text-primary" />
                      <div className="flex-1">
                        <p className="font-body-sm text-on-surface">{d.filename}</p>
                        <span className="font-mono-label text-on-surface-variant">
                          {d.tipo === "ADENDA_EXTENSION" ? "Adenda de extensión" : "Adenda"} · v{d.version} · {d.estadoGeneracion}
                          {d.sizeBytes ? ` · ${(d.sizeBytes / 1024).toFixed(1)} KB` : ""}
                          {d.storageKey ? " · en storage" : ""}
                        </span>
                      </div>
                      {d.estadoGeneracion === "GENERADO" && d.sha256 ? (
                        verificacion[d.id] === undefined ? null : (
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 font-mono-label ${
                              verificacion[d.id] ? "text-primary" : "text-destructive"
                            }`}
                          >
                            {verificacion[d.id] ? "✓ íntegro" : "✗ alterado"}
                          </span>
                        )
                      ) : null}
                      {d.estadoGeneracion === "GENERADO" && d.sha256 && d.storageKey ? (
                        <button
                          onClick={() => verificarDocumento(d)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-on-surface-variant hover:bg-surface-container dark:border-transparent"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Verificar
                        </button>
                      ) : null}
                      <button
                        onClick={() => descargarDocumento(d)}
                        aria-label={`Descargar ${d.filename}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-primary hover:bg-surface-container dark:border-transparent"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {contract.snapshot ? (
              <div className="overflow-hidden rounded-lg border border-outline-variant bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface-variant sm:px-6">
                  <span className="font-label-md uppercase tracking-wider">Vista previa del documento</span>
                  <span className="inline-flex items-center gap-1.5 font-mono-label text-on-surface-variant">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Inmutable
                  </span>
                </div>

                <div className="space-y-6 px-4 py-8 text-black sm:px-6">
                  <div className="border-b border-neutral-300 pb-4 text-center">
                    <h2 className="text-lg font-extrabold tracking-wide">CONTRATO DE ARRENDAMIENTO</h2>
                    <p className="mt-1 font-mono-label text-neutral-500">
                      {contract.snapshot.codigoContrato}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <h3 className="mb-2 font-label-md uppercase tracking-wider text-neutral-500">EL ARRENDATARIO</h3>
                      <p className="font-semibold">
                        {[contract.snapshot.datosCliente.nombres, contract.snapshot.datosCliente.apellidos]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p className="text-sm text-neutral-600">
                        {contract.snapshot.datosCliente.tipoPersona} · DNI {contract.snapshot.datosCliente.documentoIdentidad}
                      </p>
                      {contract.snapshot.datosCliente.ruc ? (
                        <p className="text-sm text-neutral-600">RUC {contract.snapshot.datosCliente.ruc}</p>
                      ) : null}
                      {contract.snapshot.datosCliente.email ? (
                        <p className="text-sm text-neutral-600">{contract.snapshot.datosCliente.email}</p>
                      ) : null}
                      {contract.snapshot.datosCliente.telefono ? (
                        <p className="text-sm text-neutral-600">Tel. {contract.snapshot.datosCliente.telefono}</p>
                      ) : null}
                    </div>
                    <div>
                      <h3 className="mb-2 font-label-md uppercase tracking-wider text-neutral-500">EL INMUEBLE</h3>
                      <p className="font-semibold">
                        {contract.snapshot.datosDepartamento.nombre ?? ""} · {contract.snapshot.datosDepartamento.codigo ?? ""}
                      </p>
                      <p className="text-sm text-neutral-600">
                        {contract.snapshot.datosDepartamento.personaPago ?? ""} · Piso {contract.snapshot.datosDepartamento.piso ?? ""}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-neutral-100 p-4">
                    <h3 className="mb-3 font-label-md uppercase tracking-wider text-neutral-500">CONDICIONES DEL CONTRATO</h3>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-neutral-500">Mensualidad</dt>
                        <dd className="font-semibold">
                          {Number(contract.snapshot.datosContrato.montoCanonMensual).toLocaleString("es-PE", {
                            style: "currency",
                            currency: "PEN",
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-neutral-500">Mantenimiento (mensual)</dt>
                        <dd className="font-semibold">
                          {Number(contract.mantenimiento ?? "0").toLocaleString("es-PE", {
                            style: "currency",
                            currency: "PEN",
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-neutral-500">Depósito garantía</dt>
                        <dd className="font-semibold">
                          {Number(contract.snapshot.datosContrato.depositoGarantia).toLocaleString("es-PE", {
                            style: "currency",
                            currency: "PEN",
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-neutral-500">Inicio</dt>
                        <dd className="font-semibold">{contract.snapshot.datosContrato.fechaInicio}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-neutral-500">Fin</dt>
                        <dd className="font-semibold">{contract.snapshot.datosContrato.fechaFin}</dd>
                      </div>
                    </dl>
                  </div>

                  <section>
                    <h3 className="mb-3 border-b border-neutral-300 pb-1 font-label-md uppercase tracking-wider text-neutral-500">
                      CLÁUSULAS
                    </h3>
                    {contract.snapshot.clausulas.length === 0 ? (
                      <p className="text-sm text-neutral-500">Sin cláusulas.</p>
                    ) : (
                      contract.snapshot.clausulas.map((c, i) => (
                        <div key={c.versionId} className="mb-3">
                          <p className="mb-0.5 text-sm font-bold text-neutral-700">Cláusula {i + 1}.</p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{c.contenido}</p>
                        </div>
                      ))
                    )}
                  </section>

                  {contract.snapshot.anexos.length > 0 ? (
                    <section>
                      <h3 className="mb-3 border-b border-neutral-300 pb-1 font-label-md uppercase tracking-wider text-neutral-500">
                        ANEXOS
                      </h3>
                      {contract.snapshot.anexos.map((a, i) => (
                        <div key={a.versionId} className="mb-3">
                          <p className="mb-0.5 text-sm font-bold text-neutral-700">Anexo {i + 1}.</p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{a.contenido}</p>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  <div className="mt-10 grid grid-cols-1 gap-8 pt-4 sm:grid-cols-2 sm:gap-10">
                    <div>
                      <div className="mb-1 border-t border-neutral-400 pt-2 text-center text-xs text-neutral-500">
                        {contract.snapshot.datosCliente.nombres ?? ""}{" "}
                        {contract.snapshot.datosCliente.apellidos ?? ""}
                      </div>
                      <p className="text-center text-xs uppercase tracking-wider text-neutral-500">Firma del arrendatario</p>
                    </div>
                    <div>
                      <div className="mb-1 border-t border-neutral-400 pt-2 text-center text-xs text-neutral-500">
                        {String(contract.snapshot.datosDepartamento.nombre ?? "")}
                      </div>
                      <p className="text-center text-xs uppercase tracking-wider text-neutral-500">Firma del arrendador(a)</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!contract.snapshot ? (
              <div className="overflow-hidden rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest shadow-sm">
                <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-6 py-3 text-on-surface-variant">
                  <span className="font-label-md uppercase tracking-wider">Vista previa (datos vivos)</span>
                  <span className="font-mono-label text-on-surface-variant">
                    {STATUS_LABEL[contract.estado] ?? contract.estado}
                  </span>
                </div>
                <div className="space-y-6 px-4 py-8 text-on-surface sm:px-6">
                  <div className="border-b border-outline-variant pb-4 text-center">
                    <h2 className="text-lg font-extrabold tracking-wide">CONTRATO DE ARRENDAMIENTO</h2>
                    <p className="mt-1 font-mono-label text-on-surface-variant">{contract.codigoContrato}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <h3 className="mb-2 font-label-md uppercase tracking-wider text-on-surface-variant">EL ARRENDATARIO</h3>
                      <p className="font-semibold">
                        {[contract.cliente.nombres, contract.cliente.apellidos].filter(Boolean).join(" ") || "—"}
                      </p>
                      {contract.cliente.documentoIdentidad ? (
                        <p className="text-sm text-on-surface-variant">
                          {contract.cliente.tipoPersona} · DNI {contract.cliente.documentoIdentidad}
                        </p>
                      ) : null}
                      {contract.cliente.ruc ? (
                        <p className="text-sm text-on-surface-variant">RUC {contract.cliente.ruc}</p>
                      ) : null}
                      {contract.cliente.email ? (
                        <p className="text-sm text-on-surface-variant">{contract.cliente.email}</p>
                      ) : null}
                      {contract.cliente.telefono ? (
                        <p className="text-sm text-on-surface-variant">Tel. {contract.cliente.telefono}</p>
                      ) : null}
                    </div>
                    <div>
                      <h3 className="mb-2 font-label-md uppercase tracking-wider text-on-surface-variant">EL INMUEBLE</h3>
                      <p className="font-semibold">{contract.departamento.nombre}</p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-surface-container-high p-4">
                    <h3 className="mb-3 font-label-md uppercase tracking-wider text-on-surface-variant">CONDICIONES DEL CONTRATO</h3>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Mensualidad</dt>
                        <dd className="font-semibold">
                          {Number(contract.montoCanonMensual).toLocaleString("es-PE", { style: "currency", currency: "PEN" })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Mantenimiento</dt>
                        <dd className="font-semibold">S/ 50.00</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Depósito garantía</dt>
                        <dd className="font-semibold">
                          {Number(contract.depositoGarantia).toLocaleString("es-PE", { style: "currency", currency: "PEN" })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Inicio</dt>
                        <dd className="font-semibold">{contract.fechaInicio}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Fin</dt>
                        <dd className="font-semibold">{contract.fechaFin}</dd>
                      </div>
                    </dl>
                  </div>

                  <p className="rounded-md bg-surface-container-high p-3 font-body-sm text-on-surface-variant">
                    Este contrato aún no ha sido emitido. El documento definitivo (con cláusulas y anexos congelados) se
                    generará al emitir la versión firmada con su instantánea inmutable.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
              <h3 className="mb-3 font-headline-md text-primary">Actividad del contrato</h3>
              {snapshotActivity.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant">Sin eventos registrados.</p>
              ) : (
                <ul className="space-y-2">
                  {snapshotActivity.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-md bg-surface-container-high px-3 py-2">
                      <span className="font-body-sm text-on-surface">{a.action.replace(/_/g, " ")}</span>
                      <span className="font-mono-label text-on-surface-variant">
                        {new Date(a.timestamp).toLocaleString()} · {a.result}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {showAdenda && contract ? (
          <AdendaModal
            contractId={contract.id}
            codigoContrato={contract.codigoContrato}
            onClose={() => setShowAdenda(false)}
            onCreated={async () => {
              setShowAdenda(false);
              await load();
            }}
          />
        ) : null}
        {showExtension && contract ? (
          <ExtensionModal
            contractId={contract.id}
            codigoContrato={contract.codigoContrato}
            fechaFin={contract.fechaFin}
            onClose={() => setShowExtension(false)}
            onCreated={async () => {
              setShowExtension(false);
              await load();
            }}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}

function AdendaModal({
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

function ExtensionModal({
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
    const d = new Date(`${fechaFin}T12:00:00`);
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
              {fechaFin}
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
            disabled={saving || !nuevaFechaFin || nuevaFechaFin <= fechaFin}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Generando…" : "Generar extensión"}
          </button>
        </div>
      </div>
    </div>
  );
}