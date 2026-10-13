"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas } from "@/components/tabla-busqueda";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AccessControl, Permission } from "@contract/domain/rbac";
import { Download, Edit, FileText, Loader2, Plus, RefreshCw, Trash2, Wifi, X, Zap } from "lucide-react";

type ServicioExtra = {
  id: string;
  contractId: string;
  clienteId: string | null;
  codigoContrato: string | null;
  tipoServicio: string | null;
  incluyeInternet: boolean;
  incluyeCargaElectrica: boolean;
  montoInternet: string;
  montoCargaElectrica: string;
  montoTotal: string | null;
  fechaOpcion: string;
  fechaPago: string | null;
  clienteNombre: string | null;
  clienteDocumento: string | null;
  estado: string;
  filename: string | null;
  storageKey: string | null;
};

type ContractPick = {
  id: string;
  codigoContrato: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
  fechaInicio: string | null;
  estado: string;
};

const OPCION_LABEL: Record<string, string> = {
  AMBOS: "Internet + carga eléctrica",
  INTERNET: "Internet",
  CARGA_ELECTRICA: "Carga eléctrica",
};

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function moneda(value: string | number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("es-PE", {
    style: "currency",
    currency: "PEN",
  });
}

function fechaLegible(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function guardarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ServiciosExtrasPage() {
  const { user } = useAuth();
  const puedeGestionar = user
    ? AccessControl.forRole(user.role, user.additionalPermissions).can(Permission.CONTRACT_UPDATE)
    : false;

  const [servicios, setServicios] = useState<ServicioExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [regenerandoId, setRegenerandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerContratos, setPickerContratos] = useState<ContractPick[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerBusqueda, setPickerBusqueda] = useState("");

  const [selected, setSelected] = useState<ContractPick | null>(null);
  const [editando, setEditando] = useState<ServicioExtra | null>(null);
  const [internet, setInternet] = useState(false);
  const [carga, setCarga] = useState(false);
  const [fechaOpcion, setFechaOpcion] = useState(hoy());
  const [fechaPago, setFechaPago] = useState(hoy());
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/servicios-extras");
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

  const tabla = useMemo(
    () =>
      filtrarFilas(servicios, busqueda, (s) => [
        s.codigoContrato,
        s.clienteNombre,
        s.clienteDocumento,
        s.filename,
        OPCION_LABEL[s.tipoServicio ?? ""],
        fechaLegible(s.fechaOpcion),
        fechaLegible(s.fechaPago),
      ]),
    [servicios, busqueda],
  );

  const pickerFiltrados = useMemo(
    () =>
      filtrarFilas(pickerContratos, pickerBusqueda, (c) => [
        c.codigoContrato,
        c.clienteNombre,
        c.apellidoCliente,
        c.departamentoNombre,
      ]),
    [pickerContratos, pickerBusqueda],
  );

  const montoPreview = useMemo(
    () => (internet ? 39 : 0) + (carga ? 60 : 0),
    [internet, carga],
  );

  async function abrirPicker() {
    setError(null);
    setFormError(null);
    setPickerOpen(true);
    setPickerBusqueda("");
    setPickerLoading(true);
    setPickerContratos([]);
    try {
      const res = await apiFetch("/api/contracts");
      if (!res.ok) throw new Error("No se pudieron cargar los contratos");
      const data = (await res.json()) as ContractPick[];
      setPickerContratos(
        [...data].sort((a, b) =>
          String(a.codigoContrato).localeCompare(String(b.codigoContrato)),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  }

  function elegirContrato(c: ContractPick) {
    setPickerOpen(false);
    setEditando(null);
    setSelected(c);
    setInternet(false);
    setCarga(false);
    setFechaOpcion(hoy());
    setFechaPago((c.fechaInicio ?? hoy()).slice(0, 10));
    setFormError(null);
  }

  function abrirEdicion(s: ServicioExtra) {
    setSelected(null);
    setEditando(s);
    setInternet(s.incluyeInternet);
    setCarga(s.incluyeCargaElectrica);
    setFechaOpcion((s.fechaOpcion ?? hoy()).slice(0, 10));
    setFechaPago((s.fechaPago ?? hoy()).slice(0, 10));
    setFormError(null);
  }

  function cerrarForm() {
    setSelected(null);
    setEditando(null);
    setFormError(null);
  }

  async function guardar() {
    const esEdicion = Boolean(editando);
    if (!esEdicion && !selected) return;
    setFormError(null);
    if (!internet && !carga) {
      setFormError("Selecciona al menos un servicio (Internet o carga eléctrica).");
      return;
    }
    setGuardando(true);
    try {
      const body: Record<string, unknown> = {
        incluyeInternet: internet,
        incluyeCargaElectrica: carga,
        fechaOpcion,
        fechaPago,
      };
      if (esEdicion) {
        body.contractId = editando?.contractId;
      } else {
        body.contractId = selected?.id;
      }
      const res = await apiFetch(
        esEdicion ? `/api/servicios-extras/${editando?.id}` : "/api/servicios-extras",
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el servicio extra");
      cerrarForm();
      await load();
      const creado = data as ServicioExtra;
      if (!esEdicion && creado?.id) {
        void descargar(creado.id, creado.filename ?? "servicios-extras.pdf");
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function descargar(id: string, nombre: string) {
    setDownloadingId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/servicios-extras/${encodeURIComponent(id)}/download`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      guardarBlob(await res.blob(), nombre);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function regenerar(s: ServicioExtra) {
    setRegenerandoId(s.id);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/servicios-extras/${encodeURIComponent(s.id)}/download?regenerate=1`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      guardarBlob(
        await res.blob(),
        s.filename ?? `servicios-extras-${s.codigoContrato ?? s.id}.pdf`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerandoId(null);
    }
  }

  async function eliminar(s: ServicioExtra) {
    if (
      !confirm(
        `¿Eliminar el servicio extra de "${s.clienteNombre ?? s.codigoContrato ?? "el cliente"}"? Se borrará el PDF y el registro. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setEliminandoId(s.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/servicios-extras/${encodeURIComponent(s.id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo eliminar el servicio extra");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEliminandoId(null);
    }
  }

  const formAbierto = Boolean(selected || editando);
  const refCodigo = editando?.codigoContrato ?? selected?.codigoContrato ?? "";
  const refCliente = editando
    ? editando.clienteNombre ?? ""
    : [selected?.clienteNombre, selected?.apellidoCliente].filter(Boolean).join(" ");

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-primary" />
            <h2 className="font-headline-lg text-primary">Servicios Extras</h2>
          </div>
          <button
            onClick={() => void abrirPicker()}
            className="inline-flex shrink-0 items-center gap-2 rounded bg-primary px-4 py-2 font-label-md text-on-primary"
          >
            <Plus className="h-4 w-4" />
            Nuevo servicio extra
          </button>
        </div>

        <p className="rounded-md bg-surface-container-high px-3 py-2 font-body-sm text-on-surface-variant">
          Contrata de forma opcional el servicio de <strong>internet</strong> (S/. 39) y/o el{" "}
          <strong>recargo por carga eléctrica</strong> (S/. 60). Cada opción se documenta por
          separado y genera el documento &quot;Pagos extras por conexión y medio de carga&quot; con
          firmas del arrendatario y el arrendador. El día de pago es el mismo del contrato.
        </p>

        {error ? (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Cargando servicios extras…</p>
        ) : servicios.length === 0 ? (
          <p className="rounded-lg bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant">
            Aún no se han registrado servicios extras. Crea uno con &quot;Nuevo servicio extra&quot;.
          </p>
        ) : (
          <div className="flex items-center justify-end gap-3 rounded-md border border-outline-variant/50 p-3">
            <span className="mr-auto text-sm text-muted-foreground">
              {tabla.length} de {servicios.length} servicios
            </span>
            <BusquedaInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar contrato, cliente o documento…"
              className="w-72"
            />
          </div>
        )}

        {!loading && servicios.length > 0 ? (
          <TableScroll className="w-full rounded-md border">
            <div className="max-h-[40rem] overflow-y-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="sticky top-0 z-10 bg-[#151a24] text-left text-xs text-white/80">
                  <tr>
                    <th className="px-3 py-2 font-medium">Contrato</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Opción</th>
                    <th className="px-3 py-2 font-medium">Fecha opción</th>
                    <th className="px-3 py-2 font-medium">Día de pago</th>
                    <th className="px-3 py-2 font-medium">Monto</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Documento</th>
                    <th className="px-3 py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2 font-mono-label">
                        <Link
                          href={`/contratos/${s.contractId}`}
                          className="text-primary hover:underline"
                        >
                          {s.codigoContrato ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
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
                      <td className="whitespace-nowrap px-3 py-2">
                        {moneda(s.montoTotal)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {s.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() =>
                            void descargar(
                              s.id,
                              s.filename ?? `servicios-extras-${s.codigoContrato ?? s.id}.pdf`,
                            )
                          }
                          disabled={downloadingId === s.id}
                          className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-primary hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 dark:border-transparent"
                        >
                          <Download className="h-4 w-4" />
                          {downloadingId === s.id ? "…" : "PDF"}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {puedeGestionar ? (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void regenerar(s)}
                              disabled={regenerandoId === s.id}
                              className="inline-flex items-center gap-1 text-on-surface-variant hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                              title="Re-renderizar el PDF con los datos actuales"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${regenerandoId === s.id ? "animate-spin" : ""}`} />
                              {regenerandoId === s.id ? "…" : "Regenerar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirEdicion(s)}
                              className="inline-flex items-center gap-1 text-on-surface-variant hover:text-primary"
                              title="Editar opciones y fechas"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void eliminar(s)}
                              disabled={eliminandoId === s.id}
                              className="inline-flex items-center gap-1 text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              title="Eliminar el servicio extra y su PDF"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {eliminandoId === s.id ? "…" : "Eliminar"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableScroll>
        ) : null}
      </div>

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-surface-container-lowest p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline-md text-on-surface">Elegir contrato</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="rounded p-1 text-on-surface-variant hover:bg-surface-container"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-3">
              <BusquedaInput
                value={pickerBusqueda}
                onChange={setPickerBusqueda}
                placeholder="Buscar contrato o cliente…"
                className="w-full"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {pickerLoading ? (
                <p className="py-8 text-center font-body-sm text-on-surface-variant">
                  Cargando contratos…
                </p>
              ) : pickerFiltrados.length === 0 ? (
                <p className="rounded-md bg-surface-container-high p-4 text-center font-body-sm text-on-surface-variant">
                  No se encontraron contratos.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pickerFiltrados.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => elegirContrato(c)}
                        className="flex w-full flex-col gap-0.5 rounded-lg border border-outline-variant px-3 py-2.5 text-left transition-colors hover:bg-surface-container dark:border-transparent"
                      >
                        <span className="font-mono-label font-medium text-on-surface">
                          {c.codigoContrato}
                        </span>
                        <span className="font-body-sm text-on-surface-variant">
                          {[c.clienteNombre, c.apellidoCliente].filter(Boolean).join(" ")} ·{" "}
                          {c.departamentoNombre}
                        </span>
                        <span className="font-body-xs text-on-surface-variant">
                          {c.estado}
                          {c.fechaInicio ? ` · inicio ${fechaLegible(c.fechaInicio)}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {formAbierto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-headline-md text-on-surface">
                  {editando ? "Editar servicio extra" : "Nuevo servicio extra"}
                </h3>
                <p className="font-body-sm text-on-surface-variant">
                  {refCodigo}
                  {refCliente ? ` · ${refCliente}` : ""}
                </p>
              </div>
              <button
                onClick={cerrarForm}
                className="rounded p-1 text-on-surface-variant hover:bg-surface-container"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 dark:border-transparent">
                  <input
                    type="checkbox"
                    checked={internet}
                    onChange={(e) => setInternet(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-label-md text-on-surface">
                      <Wifi className="h-4 w-4 text-primary" /> Internet · S/. 39
                    </span>
                    <span className="mt-0.5 block text-xs text-on-surface-variant">
                      Conexión de alta latencia; baja conectividad por actividad masiva.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 dark:border-transparent">
                  <input
                    type="checkbox"
                    checked={carga}
                    onChange={(e) => setCarga(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-label-md text-on-surface">
                      <Zap className="h-4 w-4 text-primary" /> Carga eléctrica · S/. 60
                    </span>
                    <span className="mt-0.5 block text-xs text-on-surface-variant">
                      Patines pequeños/medianos; el cliente asume daños eléctricos.
                    </span>
                  </span>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-label-md text-on-surface-variant">
                    Fecha en que tomó la opción
                  </label>
                  <input
                    type="date"
                    value={fechaOpcion}
                    onChange={(e) => setFechaOpcion(e.target.value)}
                    className="h-10 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 font-body-md text-on-surface"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface-variant">
                    Día de pago (según contrato)
                  </label>
                  <input
                    type="date"
                    value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)}
                    className="h-10 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 font-body-md text-on-surface"
                  />
                </div>
              </div>

              {formError ? (
                <p className="font-body-sm text-destructive">{formError}</p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-body-md text-on-surface">
                  Total: <strong>{moneda(montoPreview)}</strong>
                </span>
                <button
                  onClick={() => void guardar()}
                  disabled={guardando || (!internet && !carga)}
                  className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {guardando
                    ? "Guardando…"
                    : editando
                      ? "Guardar cambios"
                      : "Generar documento"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
