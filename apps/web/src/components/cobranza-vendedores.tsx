"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { DonutChart } from "@/components/donut-chart";

interface ContratoVendedor {
  id: string;
  codigoContrato: string;
  clienteNombre: string;
  clienteApellido: string;
  departamento: string | null;
  estado: string;
  montoCuota: number;
  montoPagado: number;
}

interface DepartamentoAsignado {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  estadoManual: string | null;
  ocupado: boolean;
  cliente: string;
  codigoContrato: string | null;
  fechaFin: string | null;
}

interface Vendedor {
  key: string;
  nombre: string;
  generado: number;
  porCobrar: number;
  porcentaje: number;
  contratos: ContratoVendedor[];
  departamentos: DepartamentoAsignado[];
}

interface VendedoresData {
  vendedores: Vendedor[];
  totalGenerado: number;
}

const ESTADO_META: Record<string, { label: string; cls: string }> = {
  PAGADO: { label: "Pagado", cls: "bg-emerald-600" },
  PENDIENTE: { label: "Pendiente", cls: "bg-outline" },
  VENCIDO: { label: "Vencido", cls: "bg-destructive" },
};

const AGENT_COLORS: Record<string, { dot: string; slice: string }> = {
  miguel: { dot: "bg-blue-500", slice: "rgb(96, 165, 250)" },
  emely: { dot: "bg-emerald-500", slice: "rgb(16, 185, 129)" },
  evelin: { dot: "bg-violet-500", slice: "rgb(167, 139, 250)" },
};

function estadoDepartamento(d: DepartamentoAsignado): {
  label: string;
  cls: string;
} {
  if (d.estadoManual === "BLOQUEADO") return { label: "Bloqueado", cls: "bg-outline text-on-surface" };
  if (d.estadoManual === "MANTENIMIENTO") return { label: "Mantenimiento", cls: "bg-amber-400 text-amber-900" };
  if (d.ocupado) return { label: "Con cliente", cls: "bg-emerald-600 text-white" };
  return { label: "Libre", cls: "bg-blue-600 text-white" };
}

function moneda(n: number): string {
  return n.toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

function compacto(n: number): string {
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `S/ ${signo}${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = abs / 1_000;
    return `S/ ${signo}${v >= 10 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return moneda(n);
}

const VENDEDORES_INICIALES: Vendedor[] = [
  { key: "miguel", nombre: "Miguel", generado: 0, porCobrar: 0, porcentaje: 0, contratos: [], departamentos: [] },
  { key: "emely", nombre: "Emely", generado: 0, porCobrar: 0, porcentaje: 0, contratos: [], departamentos: [] },
  { key: "evelin", nombre: "Evelyn", generado: 0, porCobrar: 0, porcentaje: 0, contratos: [], departamentos: [] },
];

export function CobranzaVendedores() {
  const [data, setData] = useState<VendedoresData | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<Vendedor | null>(null);

  useEffect(() => {
    apiFetch("/api/cobranza-vendedores")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${r.status}`);
        }
        const json = (await r.json()) as VendedoresData;
        setData(json);
        setErrorCarga(null);
      })
      .catch((e: unknown) => {
        setData(null);
        setErrorCarga((e as Error).message);
      });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSeleccionado(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const vendedores = useMemo<Vendedor[]>(() => {
    if (data && data.vendedores.length > 0) return data.vendedores;
    return VENDEDORES_INICIALES.map((v) => ({
      ...v,
      ...(data?.vendedores.find((x) => x.key === v.key) ?? {}),
    }));
  }, [data]);

  return (
    <section className="space-y-3">
      <h2 className="font-headline-md text-on-surface">
        Generado por cobrador · mes en curso
      </h2>
      {errorCarga ? (
        <p className="rounded-lg bg-error-container p-3 font-body-sm text-error-container-foreground">
          No se pudo cargar la cobranza: {errorCarga}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vendedores.map((v) => (
          <button
            key={v.key}
            onClick={() => setSeleccionado(v)}
            className="group rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-left transition hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center gap-2 font-label-md text-on-surface-variant">
              <span className={`h-2.5 w-2.5 rounded-full ${AGENT_COLORS[v.key]?.dot ?? "bg-outline"}`} />
              {v.nombre}
            </div>
            <div className="mt-2 font-headline-md text-on-surface">
              {compacto(v.generado)}
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs text-on-surface-variant">
              <span>
                Por cobrar:{" "}
                <span className="font-semibold text-destructive">
                  {compacto(v.porCobrar)}
                </span>
              </span>
              <span>{v.porcentaje}% del total del mes</span>
            </div>
          </button>
        ))}
      </div>

      {seleccionado ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSeleccionado(null)}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant/50 p-4">
              <div>
                <h3 className="font-headline-md text-on-surface">
                  {seleccionado.nombre}
                </h3>
                <p className="font-body-sm text-on-surface-variant">
                  Cobrado en el mes {compacto(seleccionado.generado)} · Por cobrar{" "}
                  {compacto(seleccionado.porCobrar)} · {seleccionado.porcentaje}%
                  del total del mes
                </p>
              </div>
              <button
                onClick={() => setSeleccionado(null)}
                className="rounded p-1 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-2">
              <div className="rounded-lg border border-outline-variant/50 p-4">
                <h4 className="mb-2 font-label-md text-on-surface-variant">
                  Cobrado vs Cuentas por cobrar
                </h4>
                {(seleccionado.generado + seleccionado.porCobrar) > 0 ? (
                  <DonutChart
                    size={180}
                    segments={[
                      {
                        label: "Cobrado",
                        value: seleccionado.generado,
                        color: "rgb(16, 185, 129)",
                      },
                      {
                        label: "Por cobrar",
                        value: seleccionado.porCobrar,
                        color: "rgb(239, 68, 68)",
                      },
                    ]}
                    centerValue={`${Math.round(
                      (seleccionado.generado /
                        (seleccionado.generado + seleccionado.porCobrar)) *
                        100
                    )}%`}
                    centerLabel="cobrado"
                  />
                ) : (
                  <p className="py-8 text-center font-body-sm text-on-surface-variant">
                    Sin movimientos aún.
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-outline-variant/50 p-4">
                <h4 className="mb-2 font-label-md text-on-surface-variant">
                  % del total del mes
                </h4>
                <DonutChart
                  size={180}
                  segments={[
                    {
                      label: seleccionado.nombre,
                      value: seleccionado.generado,
                      color:
                        AGENT_COLORS[seleccionado.key]?.slice ??
                        "rgb(96, 165, 250)",
                    },
                    {
                      label: "Resto",
                      value: Math.max(0, vendedores.reduce((s, x) => s + x.generado, 0) - seleccionado.generado),
                      color: "rgb(203, 213, 225)",
                    },
                  ]}
                  centerValue={`${seleccionado.porcentaje}%`}
                  centerLabel="del total"
                />
              </div>
            </div>

            <div className="border-t border-outline-variant/50 p-4">
              <h4 className="mb-2 font-label-md text-on-surface-variant">
                Departamentos asignados ({seleccionado.departamentos.length})
              </h4>
              <ul className="max-h-64 divide-y divide-outline-variant/50 overflow-y-auto">
                {seleccionado.departamentos.length === 0 ? (
                  <li className="py-2 font-body-sm text-on-surface-variant">
                    Sin departamentos asignados.
                  </li>
                ) : (
                  seleccionado.departamentos.map((d) => {
                    const est = estadoDepartamento(d);
                    return (
                      <li key={d.id} className="py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block font-mono text-xs text-primary">
                              {d.codigo}
                            </span>
                            <span className="block truncate text-sm font-medium text-on-surface">
                              {d.nombre} · N° {d.numero}
                            </span>
                            <span className="block text-xs text-on-surface-variant">
                              {d.ocupado
                                ? `${d.cliente} · ${d.codigoContrato ?? ""} · vence ${d.fechaFin ? new Date(`${d.fechaFin}T12:00:00`).toLocaleDateString("es-PE") : "—"}`
                                : d.estadoManual
                                  ? d.estadoManual === "BLOQUEADO"
                                    ? "No disponible"
                                    : "En mantenimiento"
                                  : "Disponible"}
                            </span>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${est.cls}`}
                            >
                              {est.label}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <div className="border-t border-outline-variant/50 p-4">
              <h4 className="mb-2 font-label-md text-on-surface-variant">
                Clientes ({seleccionado.contratos.length}) por código de contrato
              </h4>
              <ul className="max-h-64 divide-y divide-outline-variant/50 overflow-y-auto">
                {seleccionado.contratos.length === 0 ? (
                  <li className="py-2 font-body-sm text-on-surface-variant">
                    Sin clientes con cuota vigente.
                  </li>
                ) : (
                  seleccionado.contratos.map((ctr) => {
                    const meta =
                      ESTADO_META[ctr.estado] ?? ESTADO_META.PENDIENTE!;
                    return (
                      <li key={ctr.id}>
                        <Link
                          href={`/contratos/${ctr.id}`}
                          className="flex items-center justify-between gap-3 rounded py-2 transition hover:bg-surface"
                        >
                          <div className="min-w-0">
                            <span className="block font-mono text-xs text-primary">
                              {ctr.codigoContrato}
                            </span>
                            <span className="block truncate text-sm font-medium text-on-surface">
                              {ctr.clienteNombre}
                              {ctr.clienteApellido
                                ? ` ${ctr.clienteApellido}`
                                : ""}
                            </span>
                            <span className="block text-xs text-on-surface-variant">
                              {ctr.departamento ?? "—"}
                            </span>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${meta.cls}`}
                              />
                              {meta.label}
                            </span>
                            <span className="block text-xs text-on-surface-variant">
                              {ctr.montoPagado > 0
                                ? moneda(ctr.montoPagado)
                                : "sin pagos"}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}