"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Edit, FileText, Loader2, Plus, RefreshCw, Trash2, Wifi, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AccessControl, Permission } from "@contract/domain/rbac";

type ClienteOpt = {
  id: string;
  nombres?: string;
  apellidos?: string | null;
  documentoIdentidad?: string | null;
  ruc?: string | null;
};

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

const OPCION_LABEL: Record<string, string> = {
  AMBOS: "Internet + carga eléctrica",
  INTERNET: "Internet",
  CARGA_ELECTRICA: "Carga eléctrica",
};

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function nombreCliente(c: ClienteOpt | undefined): string {
  if (!c) return "";
  return [c.nombres, c.apellidos].filter(Boolean).join(" ").trim();
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

export function ServiciosExtrasPanel({
  contractId,
  codigoContrato,
  clienteId,
  clienteNombre,
  fechaInicio,
}: {
  contractId: string;
  codigoContrato: string;
  clienteId: string;
  clienteNombre: string;
  fechaInicio: string;
}) {
  const { user } = useAuth();
  const puedeGestionar = user
    ? AccessControl.forRole(user.role, user.additionalPermissions).can(Permission.CONTRACT_UPDATE)
    : false;

  const [servicios, setServicios] = useState<ServicioExtra[]>([]);
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<ServicioExtra | null>(null);
  const [regenerandoId, setRegenerandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const [clienteSel, setClienteSel] = useState(clienteId);
  const [internet, setInternet] = useState(false);
  const [carga, setCarga] = useState(false);
  const [fechaOpcion, setFechaOpcion] = useState(hoy());
  const [fechaPago, setFechaPago] = useState(fechaInicio.slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/servicios-extras?contractId=${encodeURIComponent(contractId)}`,
        { cache: "no-store" },
      );
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
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let activo = true;
    fetch("/api/clients", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (activo) setClientes(Array.isArray(data) ? (data as ClienteOpt[]) : []);
      })
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, []);

  const montoPreview = useMemo(
    () => (internet ? 39 : 0) + (carga ? 60 : 0),
    [internet, carga],
  );

  function cerrarForm() {
    setMostrarForm(false);
    setEditando(null);
    setFormError(null);
  }

  function abrirEdicion(s: ServicioExtra) {
    setEditando(s);
    setInternet(s.incluyeInternet);
    setCarga(s.incluyeCargaElectrica);
    setFechaOpcion((s.fechaOpcion ?? hoy()).slice(0, 10));
    setFechaPago((s.fechaPago ?? hoy()).slice(0, 10));
    setFormError(null);
    setMostrarForm(true);
  }

  async function generar() {
    const esEdicion = Boolean(editando);
    setFormError(null);
    if (!internet && !carga) {
      setFormError("Selecciona al menos un servicio (Internet o carga eléctrica).");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(
        esEdicion ? `/api/servicios-extras/${editando?.id}` : "/api/servicios-extras",
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            esEdicion
              ? {
                  incluyeInternet: internet,
                  incluyeCargaElectrica: carga,
                  fechaOpcion,
                  fechaPago,
                }
              : {
                  contractId,
                  clienteId: clienteSel,
                  incluyeInternet: internet,
                  incluyeCargaElectrica: carga,
                  fechaOpcion,
                  fechaPago,
                },
          ),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo guardar el servicio extra");
      const eraCreacion = !esEdicion;
      cerrarForm();
      setInternet(false);
      setCarga(false);
      setFechaOpcion(hoy());
      await load();
      const creado = body as ServicioExtra;
      if (eraCreacion && creado?.id) {
        void descargar(creado.id, creado.filename ?? "servicios-extras.pdf");
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function regenerar(s: ServicioExtra) {
    setRegenerandoId(s.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/servicios-extras/${encodeURIComponent(s.id)}/download?regenerate=1`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = s.filename ?? "servicios-extras.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
        `¿Eliminar el servicio extra de "${s.clienteNombre ?? "el cliente"}"? Se borrará el PDF y el registro.`,
      )
    ) {
      return;
    }
    setEliminandoId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/servicios-extras/${encodeURIComponent(s.id)}`, {
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
    <div className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-headline-md text-primary">
          <FileText className="h-5 w-5" />
          Servicios Extras
        </h3>
        <button
          onClick={() => (mostrarForm ? cerrarForm() : setMostrarForm(true))}
          className="inline-flex shrink-0 items-center gap-2 rounded bg-primary px-4 py-2 font-label-md text-on-primary"
        >
          <Plus className="h-4 w-4" />
          {mostrarForm ? "Cerrar" : "Nuevo servicio extra"}
        </button>
      </div>

      <p className="mb-4 rounded-md bg-surface-container-high px-3 py-2 font-body-sm text-on-surface-variant">
        Contrata de forma opcional el servicio de <strong>internet</strong> (S/. 39)
        y/o el <strong>recargo por carga eléctrica</strong> (S/. 60). Cada opción se
        documenta por separado y genera el documento &quot;Pagos extras por conexión y
        medio de carga&quot; con firmas del arrendatario y el arrendador. El día de pago
        es el mismo del contrato.
      </p>

      {mostrarForm ? (
        <div className="mb-6 space-y-4 rounded-lg border border-outline-variant bg-surface-container-low/40 p-4 dark:border-transparent">
          <p className="font-label-md text-primary">
            {editando ? "Editar servicio extra" : "Nuevo servicio extra"}
          </p>
          {!editando ? (
          <div>
            <label className="mb-1 block font-label-md text-on-surface-variant">
              Asignar a cliente
            </label>
            <select
              value={clienteSel}
              onChange={(e) => setClienteSel(e.target.value)}
              className="h-10 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 font-body-md text-on-surface"
            >
              {clientes.length === 0 ? (
                <option value={clienteId}>{clienteNombre || "Cliente del contrato"}</option>
              ) : null}
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {nombreCliente(c)}
                  {c.documentoIdentidad ? ` · ${c.documentoIdentidad}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Por defecto se usa el cliente del contrato; puedes reasignarlo.
            </p>
          </div>
          ) : null}

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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-body-md text-on-surface">
              Total: <strong>{moneda(montoPreview)}</strong>
            </span>
            <button
              onClick={() => void generar()}
              disabled={guardando || (!internet && !carga)}
              className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-label-md text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Generar documento"}
            </button>
          </div>
          {formError ? (
            <p className="font-body-sm text-destructive">{formError}</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-md bg-error-container px-3 py-2 font-body-sm text-error-container-foreground">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="font-body-sm text-on-surface-variant">Cargando servicios extras…</p>
      ) : servicios.length === 0 ? (
        <p className="font-body-sm text-on-surface-variant">
          Aún no se han registrado servicios extras para este contrato.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-surface-container-low text-xs text-on-surface-variant">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Opción tomada</th>
                <th className="px-3 py-2 font-medium">Fecha opción</th>
                <th className="px-3 py-2 font-medium">Día de pago</th>
                <th className="px-3 py-2 font-medium">Monto</th>
                <th className="px-3 py-2 font-medium">Documento</th>
                <th className="px-3 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className="border-t border-outline-variant/50">
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
                    {moneda(s.montoTotal)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() =>
                        void descargar(
                          s.id,
                          s.filename ?? `servicios-extras-${codigoContrato}.pdf`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-primary hover:bg-surface-container dark:border-transparent"
                    >
                      <Download className="h-4 w-4" />
                      PDF
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
      )}
    </div>
  );
}
