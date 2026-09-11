"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";
import {
  leerSeparaciones,
  getTipoSeparacion,
  type SeparacionRecord,
} from "@/lib/separaciones";
import { obtenerContactos, type ContactSeed, type ArchivoAdjunto } from "@/lib/contactos-seed";
import { MASCOTAS, etiquetasDeIds } from "@/lib/catalogos";
import { inventarioDepartamento, cargarInventarios } from "@/lib/inventarios-departamento";
import { migrarDatosLocales } from "@/lib/migracion-local";
import { Download, Plus, X } from "lucide-react";

type ContractApi = {
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
  copiaDni?: ArchivoAdjunto[];
  motivoResolucion?: string | null;
  resueltoEn?: string | null;
  createdAt: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
};

type ClientApi = {
  id: string;
  nombres: string;
  apellidos: string | null;
  codigoDepartamento?: string | null;
  documentoIdentidad?: string;
  ruc?: string | null;
  tipoPersona?: string;
  email?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
};

type DepartmentApi = { id: string; nombre: string; codigo?: string | null; numero?: string | null; precio?: string | null; garantia?: string | null; mantenimiento?: string | null };
type TemplateApi = { id: string; clave: string; nombre: string };

type Depositante = ClientApi & {
  departamentoId?: string;
  mensualidad?: string;
  garantia?: string;
  separacion?: SeparacionRecord;
  /** Mascotas del contacto (etiquetas del catálogo). */
  mascotas?: boolean;
  mascotasItems?: string[];
  copiaDni?: ArchivoAdjunto[];
};
type TemplateVersionApi = {
  id: string;
  version: number;
  publicada: boolean;
  contenido: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_META: Record<string, { label: string; dot: string; pill: string }> = {
  BORRADOR: {
    label: "Borrador",
    dot: "bg-outline",
    pill: "bg-surface-variant text-on-surface-variant",
  },
  PENDIENTE_EMISION: {
    label: "Pendiente emisión",
    dot: "bg-tertiary",
    pill: "bg-tertiary-container/40 text-tertiary-container-foreground",
  },
  EMITIDO: {
    label: "Emitido",
    dot: "bg-secondary",
    pill: "bg-secondary-container/30 text-secondary-container-foreground",
  },
  PENDIENTE_FIRMA: {
    label: "Pendiente firma",
    dot: "bg-tertiary",
    pill: "bg-tertiary-container/40 text-tertiary-container-foreground",
  },
  FIRMADO: {
    label: "Firmado",
    dot: "bg-primary",
    pill: "bg-surface-container-highest text-primary",
  },
  NOTARIADO: {
    label: "Notariado",
    dot: "bg-primary",
    pill: "bg-primary-container/40 text-primary-container-foreground",
  },
  RESUELTO: {
    label: "Resuelto",
    dot: "bg-error",
    pill: "bg-error-container/60 text-error-container-foreground",
  },
  CANCELADO: {
    label: "Cancelado",
    dot: "bg-error",
    pill: "bg-error-container/50 text-error-container-foreground",
  },
};

const NEXT_TRANSITIONS: Record<
  string,
  Array<{ action: string; label: string; allowed: boolean }>
> = {
  BORRADOR: [
    { action: "editar", label: "Editar", allowed: true },
    { action: "requestEmission", label: "Solicitar emisión", allowed: true },
    { action: "cancelar", label: "Cancelar", allowed: true },
  ],
  PENDIENTE_EMISION: [
    { action: "emit", label: "Emitir contrato", allowed: true },
    { action: "cancelar", label: "Cancelar", allowed: true },
  ],
  EMITIDO: [
    { action: "requestFirma", label: "Solicitar firma", allowed: true },
    { action: "cancelar", label: "Cancelar", allowed: true },
  ],
  PENDIENTE_FIRMA: [
    { action: "firmar", label: "Firmar contrato", allowed: true },
    { action: "resolver", label: "Resolver", allowed: true },
    { action: "cancelar", label: "Cancelar", allowed: true },
  ],
  FIRMADO: [
    { action: "notariar", label: "Notariar", allowed: true },
    { action: "resolver", label: "Resolver", allowed: true },
  ],
  NOTARIADO: [
    { action: "resolver", label: "Resolver", allowed: true },
    { action: "cancelar", label: "Cancelar", allowed: true },
  ],
};

export default function ContratosPage() {
  const [contracts, setContracts] = useState<ContractApi[]>([]);
  const [departments, setDepartments] = useState<DepartmentApi[]>([]);
  const [templates, setTemplates] = useState<TemplateApi[]>([]);
  const [versions, setVersions] = useState<Record<string, TemplateVersionApi | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ContractApi | null>(null);
  const [resolving, setResolving] = useState<ContractApi | null>(null);
  const [renewing, setRenewing] = useState<ContractApi | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [separaciones, setSeparaciones] = useState<SeparacionRecord[]>([]);
  const [contactos, setContactos] = useState<ContactSeed[]>([]);
  const [, setTick] = useState(0);

  const [status, setStatus] = useState("all");
  const [department, setDepartment] = useState("all");

  const router = useRouter();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/contracts");
      if (!res.ok) throw new Error("No se pudieron cargar los contratos");
      const data = (await res.json()) as ContractApi[];
      setContracts(data);
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
    void (async () => {
      await migrarDatosLocales();
      const [seps, ctos] = await Promise.all([leerSeparaciones(), obtenerContactos()]);
      await cargarInventarios(true);
      setSeparaciones(seps);
      setContactos(ctos);
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    apiFetch("/api/departamentos").then((r) => r.json())
      .then((d) => {
        const loadedDepartments = d as DepartmentApi[];
        setDepartments(loadedDepartments);
      })
      .catch(() => undefined);
    apiFetch("/api/templates").then((r) => r.json())
      .then(async (d: TemplateApi[]) => {
        setTemplates(d);
        const vmap: Record<string, TemplateVersionApi | null> = {};
        await Promise.all(
          d.map(async (t) => {
            try {
              const vr = await apiFetch(`/api/templates/${t.id}/versions`);
              const versions = (await vr.json()) as TemplateVersionApi[];
              vmap[t.id] = versions.filter((v) => v.publicada).sort((a, b) => b.version - a.version)[0] ?? null;
            } catch {
              vmap[t.id] = null;
            }
          })
        );
        setVersions(vmap);
      })
      .catch(() => undefined);
  }, []);

  async function runAction(id: string, action: string) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/contracts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error al ejecutar la acción");
      } else {
        const updated = (await res.json().catch(() => null)) as
          | { estado?: string }
          | null;
        await load();
        if (action === "firmar" && updated?.estado === "FIRMADO") {
          router.push(`/contratos/${id}`);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function downloadContractPdf(contract: ContractApi) {
    setDownloadingId(contract.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/documents/pdf?contractId=${encodeURIComponent(contract.id)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo descargar el contrato");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `contrato-${contract.codigoContrato}.pdf`;
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

  function handleAction(row: ContractApi, action: string) {
    if (action === "editar") {
      setEditing(row);
      return;
    }
    if (action === "resolver") {
      setResolving(row);
      return;
    }
    if (action === "renovar") {
      setRenewing(row);
      return;
    }
    void runAction(row.id, action);
  }

  const filtered = contracts.filter((c) => {
    const matchesStatus = status === "all" || c.estado === status;
    const matchesDept = department === "all" || c.departamentoNombre === department;
    return matchesStatus && matchesDept;
  });

  const separacionesActivas = separaciones.filter((s) => {
    return ["SEPARADO", "GARANTIA_COMPLETADA", "CONTRATO_PREVIO"].includes(s.estado);
  });

  const depositantes = useMemo<Depositante[]>(() => {
    const res: Depositante[] = [];
    for (const sep of separacionesActivas) {
      const contacto = contactos.find((c) => c.id === sep.contactoId);
      if (!contacto) continue;
      const dept = departments.find((d) => d.id === sep.departamentoId);
      if (!dept) continue;
      const mensualidad = dept?.precio && Number(dept.precio) > 0 ? Number(dept.precio).toFixed(2) : "";
      const garantia = dept?.garantia && Number(dept.garantia) > 0
        ? Number(dept.garantia).toFixed(2)
        : mensualidad;
res.push({
        id: `dep-${contacto.id}-${dept.id}`,
        nombres: contacto.nombre,
        apellidos: contacto.apellido,
        documentoIdentidad: contacto.dni,
        tipoPersona: contacto.tipoPersona,
        email: contacto.email ?? null,
        telefono: contacto.telefono ?? null,
        domicilio: contacto.domicilio ?? null,
        codigoDepartamento: dept?.codigo ?? null,
        departamentoId: sep.departamentoId,
        mensualidad,
        garantia,
        separacion: sep,
        mascotas: contacto.mascotas ?? false,
        mascotasItems: etiquetasDeIds(MASCOTAS, contacto.mascotasItems),
        copiaDni: contacto.copiaDni ?? [],
      });
    }
    return res;
  }, [separacionesActivas, contactos, departments]);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-headline-lg text-on-surface">Pre contratos</h2>
            <p className="font-body-md text-on-surface-variant">
              Separaciones, garantías y acuerdos en curso.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-10 shrink-0 items-center gap-2 rounded bg-primary px-4 font-label-md text-on-primary shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo contrato
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 font-body-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block font-label-md text-on-surface-variant">Estado</label>
              <select
                className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface focus:ring-2 focus:ring-primary dark:border-transparent"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block font-label-md text-on-surface-variant">Departamento</label>
              <select
                className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface focus:ring-2 focus:ring-primary dark:border-transparent"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="all">Todos los departamentos</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.nombre}>{d.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="flex items-center justify-between bg-surface p-4">
            <span className="font-body-md text-on-surface-variant">
              {loading
                ? "Cargando contratos…"
                : `Mostrando ${filtered.length} de ${contracts.length} contratos`}
            </span>
            <button className="flex h-8 items-center gap-1 rounded border border-outline-variant px-3 text-on-surface hover:bg-surface-container-low dark:border-transparent">
              <Download className="h-4 w-4" />
              Exportar
            </button>
          </div>

          <TableScroll className="w-full rounded-lg border border-outline-variant dark:border-transparent">
            <table className="w-full min-w-[1150px] border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low/50 dark:border-transparent">
                  <th className="whitespace-nowrap p-4 font-label-md text-on-surface-variant">ID Contrato</th>
                  <th className="p-4 font-label-md text-on-surface-variant">Cliente / Contraparte</th>
                  <th className="p-4 font-label-md text-on-surface-variant">Departamento</th>
                  <th className="p-4 font-label-md text-on-surface-variant">Mensualidad</th>
                  <th className="whitespace-nowrap p-4 font-label-md text-on-surface-variant">Mantenimiento</th>
                  <th className="p-4 font-label-md text-on-surface-variant">Estado</th>
                  <th className="whitespace-nowrap p-4 font-label-md text-on-surface-variant">Creado</th>
                  <th className="whitespace-nowrap p-4 font-label-md text-on-surface-variant">Fecha fin</th>
                  <th className="p-4 text-right font-label-md text-on-surface-variant">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.estado] ?? { label: r.estado, dot: "bg-outline", pill: "bg-surface-variant" };
                  const transitions = NEXT_TRANSITIONS[r.estado] ?? [];
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-surface-container-low/30">
                      <td className="p-4 font-mono-label">
                        <Link href={`/contratos/${r.id}`} className="text-primary hover:underline">
                          {r.codigoContrato}
                        </Link>
                      </td>
                      <td className="p-4">
                        {['FIRMADO', 'NOTARIADO'].includes(r.estado) ? (
                          <Link
                            href={`/contratos/clientes/${r.clienteId}`}
                            className="font-body-md font-semibold text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                            title="Ver ficha del cliente"
                          >
                            {[r.clienteNombre, r.apellidoCliente].filter(Boolean).join(" ")}
                          </Link>
                        ) : (
                          <span className="font-body-md font-semibold text-on-surface">
                            {[r.clienteNombre, r.apellidoCliente].filter(Boolean).join(" ")}
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-body-sm text-on-surface-variant">{r.departamentoNombre}</td>
                      <td className="whitespace-nowrap p-4 font-body-md text-on-surface">
                        {Number(r.montoCanonMensual).toLocaleString("es-PE", { style: "currency", currency: "PEN" })}
                      </td>
                      <td className="whitespace-nowrap p-4 font-body-md text-on-surface">
                        {Number(r.mantenimiento ?? "0").toLocaleString("es-PE", { style: "currency", currency: "PEN" })}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-md ${meta.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-4 font-body-sm text-on-surface-variant">
                        {new Date(r.createdAt).toLocaleDateString("es-PE")}
                      </td>
                      <td className="whitespace-nowrap p-4 font-body-sm text-on-surface-variant">
                        {new Date(r.fechaFin).toLocaleDateString("es-PE")}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.snapshotId && ["EMITIDO", "PENDIENTE_FIRMA", "FIRMADO", "NOTARIADO"].includes(r.estado) ? (
                            <button
                              type="button"
                              disabled={busy || downloadingId === r.id}
                              onClick={() => void downloadContractPdf(r)}
                              className="flex items-center gap-1 rounded border border-primary px-2 py-1 font-label-md text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Descargar contrato en PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {downloadingId === r.id ? "Descargando…" : "Descargar PDF"}
                            </button>
                          ) : null}
                          {transitions.map((t) => (
                            <button
                              key={t.action}
                              disabled={!t.allowed || busy}
                              onClick={() => handleAction(r, t.action)}
                              className="rounded border border-outline-variant px-2 py-1 font-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-transparent"
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center font-body-md text-on-surface-variant">
                      No se encontraron contratos con los filtros aplicados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </div>

      {showCreate ? (
        <CreateContractModal
          clients={depositantes}
          departments={departments}
          templates={templates}
          versions={versions}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      ) : null}

      {editing ? (
        <EditContractModal
          contract={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {resolving ? (
        <ResolveContractModal
          contract={resolving}
          onClose={() => setResolving(null)}
          onDone={async () => {
            setResolving(null);
            await load();
          }}
        />
      ) : null}

      {renewing ? (
        <RenewContractModal
          contract={renewing}
          onClose={() => setRenewing(null)}
          onDone={async () => {
            setRenewing(null);
            await load();
          }}
        />
      ) : null}
    </DashboardShell>
  );
}

/** Campos de cláusulas específicas (separación S/ 500 y mascotas). */
function ClausulasForm({
  separacion,
  mascotasItems,
  onChange,
}: {
  separacion: boolean;
  mascotasItems: string[];
  onChange: (next: {
    separacion: boolean;
    mascotasItems: string[];
  }) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-outline-variant bg-surface-container-low/40 p-3 dark:border-transparent">
      <p className="font-label-md text-on-surface-variant">Cláusulas específicas</p>
      <label className="flex items-center gap-2 font-body-sm text-on-surface">
        <input
          type="checkbox"
          checked={separacion}
          onChange={(e) =>
            onChange({ separacion: e.target.checked, mascotasItems })
          }
          className="h-4 w-4 accent-primary"
        />
        Incluir cláusula de separación (S/ 500.00)
      </label>
      <div>
        <label className="mb-1 block font-label-md text-on-surface-variant">
          Mascotas
        </label>
        <textarea
          rows={2}
          placeholder={"Se precarga desde la ficha del contacto.\nEj.:\nPerro\nGato"}
          value={mascotasItems.join("\n")}
          onChange={(e) =>
            onChange({
              separacion,
              mascotasItems: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="w-full rounded border border-outline-variant bg-transparent px-2 py-1.5 font-body-sm text-on-surface"
        />
      </div>
    </div>
  );
}

/** Checklist del inventario del departamento; alimenta [INVENTARIO] del contrato. */
function InventarioDepartamentoField({
  departamentoId,
  muebleriaItems,
  onChange,
}: {
  departamentoId: string;
  muebleriaItems: string[];
  onChange: (items: string[]) => void;
}) {
  const inventarioPermitido = inventarioDepartamento(departamentoId);
  const inventarioIds = inventarioPermitido.flatMap((grupo) => grupo.items.map(([id]) => id));
  const inventarioSeleccionado = new Set(muebleriaItems);
  const etiquetas = inventarioPermitido.flatMap((grupo) => grupo.items.map(([, label]) => label));
  const todosSeleccionados = etiquetas.length > 0 && etiquetas.every((item) => inventarioSeleccionado.has(item));

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <label className="block font-label-md text-on-surface-variant">Inventario del departamento</label>
          <p className="text-xs text-on-surface-variant">Selecciona los bienes que se incluirán en [INVENTARIO].</p>
        </div>
        <button
          type="button"
          disabled={inventarioIds.length === 0}
          onClick={() => onChange(todosSeleccionados ? [] : etiquetas)}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-40"
        >
          {todosSeleccionados ? "Quitar todos" : "Seleccionar todo"}
        </button>
      </div>
      {!departamentoId ? (
        <p className="text-sm text-on-surface-variant">Selecciona un departamento para mostrar su inventario.</p>
      ) : inventarioPermitido.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Este departamento aún no tiene inventario registrado. Complétalo en Uni/Dep.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {inventarioPermitido.map((grupo) => (
            <div key={grupo.categoria} className="rounded border border-outline-variant p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">{grupo.categoria}</p>
              <div className="space-y-1">
                {grupo.items.map(([id, label]) => (
                  <label key={id} className="flex items-start gap-2 text-sm text-on-surface">
                    <input
                      type="checkbox"
                      checked={inventarioSeleccionado.has(label)}
                      onChange={() => onChange(inventarioSeleccionado.has(label) ? muebleriaItems.filter((item) => item !== label) : [...muebleriaItems, label])}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditContractModal({
  contract,
  departments,
  onClose,
  onSaved,
}: {
  contract: ContractApi;
  departments: DepartmentApi[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    departamentoId: contract.departamentoId,
    montoCanonMensual: contract.montoCanonMensual,
    depositoGarantia: contract.depositoGarantia ?? "0.00",
    mantenimiento: contract.mantenimiento ?? "50.00",
    fechaInicio: contract.fechaInicio,
    fechaFin: contract.fechaFin,
    separacion: contract.separacion ?? true,
    muebleriaItems: contract.muebleriaItems ?? [],
    mascotasItems: contract.mascotasItems ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (!form.fechaInicio || !form.fechaFin) {
        throw new Error("Debe indicar las fechas del contrato");
      }
      if (form.fechaFin < form.fechaInicio) {
        throw new Error("La fecha fin no puede ser anterior a la de inicio");
      }
      const res = await apiFetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo actualizar el contrato");
      }
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
          <h3 className="font-headline-md text-on-surface">Editar contrato</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 font-mono-label text-on-surface-variant">{contract.codigoContrato}</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Departamento</label>
            <select
              className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface"
              value={form.departamentoId}
              onChange={(e) => {
                const departamentoId = e.target.value;
                const permitidos = new Set(
                  inventarioDepartamento(departamentoId).flatMap((grupo) =>
                    grupo.items.map(([, label]) => label)
                  )
                );
                setForm({
                  ...form,
                  departamentoId,
                  muebleriaItems: form.muebleriaItems.filter((item) => permitidos.has(item)),
                });
              }}
            >
              <option value="">Selecciona un departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} {d.codigo ? `(${d.codigo})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Mensualidad (S/)</label>
              <input type="number" step="0.01" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.montoCanonMensual} onChange={(e) => setForm({ ...form, montoCanonMensual: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Depósito (S/)</label>
              <input type="number" step="0.01" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.depositoGarantia} onChange={(e) => setForm({ ...form, depositoGarantia: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Mantenimiento (S/)</label>
            <input type="number" step="0.01" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.mantenimiento} onChange={(e) => setForm({ ...form, mantenimiento: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Fecha inicio</label>
              <input type="date" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Fecha fin</label>
              <input type="date" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} />
            </div>
          </div>
          <InventarioDepartamentoField
            departamentoId={form.departamentoId}
            muebleriaItems={form.muebleriaItems}
            onChange={(muebleriaItems) => setForm({ ...form, muebleriaItems })}
          />
          <ClausulasForm
            separacion={form.separacion}
            mascotasItems={form.mascotasItems}
            onChange={(cls) => setForm({ ...form, ...cls })}
          />
        </div>

        {error ? (
          <p className="mt-4 font-body-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.departamentoId}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResolveContractModal({
  contract,
  onClose,
  onDone,
}: {
  contract: ContractApi;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/contracts/${contract.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolver", motivo }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo resolver el contrato");
      }
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Resolver contrato</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 font-body-sm text-on-surface-variant">
          <span className="font-mono-label">{contract.codigoContrato}</span> · El contrato pasará a estado{" "}
          <strong>Resuelto</strong> y las cuotas futuras no pagadas se cerrarán.
        </p>
        <label className="mb-1 block font-label-md text-on-surface-variant">Motivo de la resolución</label>
        <textarea
          rows={3}
          placeholder="Ej.: Mutuo acuerdo, retiro del arrendatario, incumplimiento de pago…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full rounded border border-outline-variant bg-transparent px-2 py-1.5 font-body-sm text-on-surface"
        />
        {error ? (
          <p className="mt-3 font-body-sm text-destructive">{error}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !motivo.trim()}
            className="rounded bg-error px-4 py-2 font-label-md text-on-error disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "Resolviendo…" : "Resolver contrato"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RenewContractModal({
  contract,
  onClose,
  onDone,
}: {
  contract: ContractApi;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    nuevaFechaInicio: contract.fechaFin.slice(0, 10),
    nuevaFechaFin: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (form.nuevaFechaFin < form.nuevaFechaInicio) {
        throw new Error("La fecha fin no puede ser anterior a la de inicio");
      }
      const res = await apiFetch(`/api/contracts/${contract.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "renovar", ...form }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo renovar el contrato");
      }
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Renovar contrato</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 font-body-sm text-on-surface-variant">
          Se creará un <strong>nuevo contrato en borrador</strong> vinculado a{" "}
          <span className="font-mono-label">{contract.codigoContrato}</span> (sufijo <span className="font-mono-label">-R</span>),
          heredando cliente, departamento, plantilla y condiciones vigentes.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Nueva fecha inicio</label>
            <input type="date" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.nuevaFechaInicio} onChange={(e) => setForm({ ...form, nuevaFechaInicio: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Nueva fecha fin</label>
            <input type="date" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.nuevaFechaFin} onChange={(e) => setForm({ ...form, nuevaFechaFin: e.target.value })} />
          </div>
        </div>
        {error ? (
          <p className="mt-3 font-body-sm text-destructive">{error}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.nuevaFechaInicio || !form.nuevaFechaFin}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "Renovando…" : "Crear renovación"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateContractModal({
  clients,
  departments,
  templates,
  versions,
  onClose,
  onCreated,
}: {
  clients: Depositante[];
  departments: DepartmentApi[];
  templates: TemplateApi[];
  versions: Record<string, TemplateVersionApi | null>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    clienteId: "",
    departamentoId: "",
    plantillaVersionId: "",
    codigoContrato: "",
    montoCanonMensual: "0.00",
    depositoGarantia: "0.00",
    mantenimiento: "0.00",
    fechaInicio: "",
    fechaFin: "",
    separacion: true,
    muebleriaItems: [] as string[],
    mascotasItems: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function infoDepositante(cli: Depositante) {
    const deptId = cli.departamentoId ?? "";
    const deptPrecio = cli.mensualidad ?? "";
    const deptGarantia = cli.garantia ?? deptPrecio;
    return {
      deptId,
      deptPrecio: deptPrecio && Number(deptPrecio) > 0 ? Number(deptPrecio).toFixed(2) : "",
      deptGarantia: deptGarantia && Number(deptGarantia) > 0 ? Number(deptGarantia).toFixed(2) : "",
      sep: cli.separacion,
    };
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const clienteSel = clients.find((c) => c.id === form.clienteId);
      if (!clienteSel) throw new Error("Selecciona un depositante");
      if (!UUID_PATTERN.test(form.departamentoId) || !departments.some((d) => d.id === form.departamentoId)) {
        throw new Error("El departamento de la separación ya no existe. Asígnalo nuevamente desde Departamentos.");
      }

      const codigoContrato =
        clienteSel.codigoDepartamento?.trim() ||
        `CTR-${Date.now().toString().slice(-6)}`;

      const res = await apiFetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          codigoContrato,
          mantenimiento: "50.00",
          cliente: {
            nombres: clienteSel.nombres,
            apellidos: clienteSel.apellidos,
            documentoIdentidad: clienteSel.documentoIdentidad,
            ruc: clienteSel.ruc,
            tipoPersona: clienteSel.tipoPersona,
            email: clienteSel.email,
            telefono: clienteSel.telefono,
            domicilio: clienteSel.domicilio,
            codigoDepartamento: clienteSel.codigoDepartamento,
          },
          separacionDetalle: clienteSel.separacion
            ? {
                tipo: getTipoSeparacion(clienteSel.separacion),
                monto: Number(clienteSel.separacion.montoSeparacion).toFixed(2),
                garantiaExtendida: clienteSel.separacion.garantiaExtendida,
                fecha: clienteSel.separacion.fechaSeparacion,
                baucherSeparacion: clienteSel.separacion.baucherSeparacion ?? null,
              }
            : null,
          copiaDni: (clienteSel.copiaDni ?? []).map((archivo) => ({
            nombre: archivo.nombre,
            tipo: archivo.tipo,
            dataUrl: archivo.dataUrl,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo crear el contrato");
      }
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
          <h3 className="font-headline-md text-on-surface">Nuevo contrato</h3>
          <button onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Depositante</label>
            <div className="flex gap-2">
<select className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface" value={form.clienteId} onChange={(e) => {
                const id = e.target.value;
                const cli = clients.find((c) => c.id === id);
                if (!cli) {
                  setForm({ ...form, clienteId: id, departamentoId: "", montoCanonMensual: "0.00", depositoGarantia: "0.00" });
                  return;
                }
                const info = infoDepositante(cli);
                let deptId = departments.some((d) => d.id === info.deptId) ? info.deptId : "";
                if (!deptId && cli.codigoDepartamento) {
                  const match = departments.find((d) => d.codigo === cli.codigoDepartamento);
                  if (match) deptId = match.id;
                }
                setForm({
                  ...form,
                  clienteId: id,
                  departamentoId: deptId,
                  codigoContrato: cli.codigoDepartamento ?? form.codigoContrato,
                  montoCanonMensual: info.deptPrecio || form.montoCanonMensual,
                  depositoGarantia: info.deptGarantia || form.depositoGarantia,
                  muebleriaItems: [],
                  mascotasItems: cli.mascotasItems ?? [],
                });
              }}>
                <option value="">Selecciona un depositante</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.nombres, c.apellidos].filter(Boolean).join(" ")}
                    {c.codigoDepartamento ? ` · ${c.codigoDepartamento}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.clienteId && (() => {
            const cli = clients.find((c) => c.id === form.clienteId);
            if (!cli) return null;
            const info = infoDepositante(cli);
            if (!info.sep) return null;
            const tipo = getTipoSeparacion(info.sep);
            const etiqueta =
              tipo === "TOTAL"
                ? { texto: "Garantía completa", clase: "bg-green-500/15 text-green-600" }
                : info.sep.garantiaExtendida
                ? { texto: "Cláusula S/500 + garantía extendida", clase: "bg-amber-500/15 text-amber-600" }
                : { texto: "Cláusula S/500", clase: "bg-amber-500/15 text-amber-600" };
            return (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${etiqueta.clase}`}>
                  {etiqueta.texto}
                </span>
                <p className="mt-1 text-muted-foreground">
                  Separa su departamento con{" "}
                  <strong>S/ {info.sep.montoSeparacion.toLocaleString("es-PE")}</strong>. La garantía equivale
                  al precio del departamento.
                </p>
              </div>
            );
          })()}
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Departamento</label>
            {form.clienteId && form.departamentoId ? (() => {
              const deptAsignado = departments.find((d) => d.id === form.departamentoId);
              return (
                <div className="flex h-10 w-full items-center rounded border border-outline-variant bg-muted/40 px-2 text-on-surface">
                  {deptAsignado ? `${deptAsignado.nombre} (${deptAsignado.codigo ?? ""})` : form.departamentoId}
                </div>
              );
            })() : (
              <select className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface" value={form.departamentoId} onChange={(e) => setForm({ ...form, departamentoId: e.target.value })}>
                <option value="">Selecciona un departamento</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre} {d.codigo ? `(${d.codigo})` : ""}</option>
                ))}
              </select>
            )}
          </div>
          <InventarioDepartamentoField
            departamentoId={form.departamentoId}
            muebleriaItems={form.muebleriaItems}
            onChange={(muebleriaItems) => setForm({ ...form, muebleriaItems })}
          />
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Código del contrato</label>
            <input
              className="h-10 w-full rounded border border-outline-variant bg-surface-container text-on-surface px-2 font-mono"
              value={form.codigoContrato || "CTR-…"}
              readOnly
            />
            <p className="mt-1 text-xs text-on-surface-variant">
              Se asigna automáticamente según el departamento del cliente.
            </p>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Plantilla</label>
            <select className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface" value={form.plantillaVersionId} onChange={(e) => setForm({ ...form, plantillaVersionId: e.target.value })}>
              <option value="">Selecciona una plantilla</option>
              {templates.map((t) => {
                const v = versions[t.id];
                return (
                  <option key={t.id} value={v?.id ?? ""} disabled={!v}>
                    {t.nombre} {v ? `(v${v.version})` : " — sin versión publicada"}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Mensualidad (S/)</label>
            <input type="number" step="0.01" readOnly className="h-10 w-full rounded border border-outline-variant bg-muted/40 text-on-surface px-2" value={form.montoCanonMensual} onChange={(e) => setForm({ ...form, montoCanonMensual: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Garantía (S/)</label>
            <input type="number" step="0.01" readOnly className="h-10 w-full rounded border border-outline-variant bg-muted/40 text-on-surface px-2" value={form.depositoGarantia} />
          </div>
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">Mantenimiento</label>
            <div className="flex h-10 items-center rounded border border-outline-variant bg-surface-container px-2 font-body-md text-on-surface">
              S/ 50.00 · fijo mensual
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Fecha inicio</label>
              <input type="date" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Fecha fin</label>
              <input type="date" className="h-10 w-full rounded border border-outline-variant bg-transparent text-on-surface px-2" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} />
            </div>
          </div>
          <ClausulasForm
            separacion={form.separacion}
            mascotasItems={form.mascotasItems}
            onChange={(cls) => setForm({ ...form, ...cls })}
          />
        </div>

        {error ? (
          <p className="mt-4 font-body-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-outline-variant px-4 py-2 font-label-md text-on-surface-variant dark:border-transparent">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.clienteId || !form.departamentoId || !form.plantillaVersionId || !form.fechaInicio || !form.fechaFin}
            className="rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "Creando…" : "Crear contrato"}
          </button>
        </div>
      </div>
    </div>
  );
}

