"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FileText, AlertTriangle, Activity } from "lucide-react";
import { DonutChart } from "@/components/donut-chart";
import { CobranzaVendedores } from "@/components/cobranza-vendedores";

interface ProximoAVencer {
  id: string;
  codigoContrato: string;
  cliente: string;
  departamento: string | null;
  fechaFin: string;
  diasRestantes: number;
  renuevaProximoMes: boolean | null;
  renovacionMeses: number | null;
}

interface Resumen {
  unidadesTotales: number;
  ocupadas: number;
  disponibles: number;
  tasaOcupacion: number;
  mantenimiento: number;
  aPuntoDeFinalizar: number;
  proximosAVencer?: ProximoAVencer[];
  ingresosYTD: number;
  egresos: number;
  resultadosYTD: number;
  incidencias: number;
  morosidad: number;
  clientesReportados: number;
  enProceso: number;
}

interface DashboardData {
  contratos: {
    total: number;
    borradores: number;
    pendientesEmision: number;
    pendientesFirma: number;
    emitidos: number;
    firmados: number;
    cancelados: number;
  };
  erroresGeneracion: number;
  resumen: Resumen;
  actividadReciente: {
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    module: string;
    entityId: string;
    result: string;
  }[];
}

type Tone = "default" | "green" | "red" | "yellow" | "black" | "blue";

const toneCardClass: Record<Tone, string> = {
  default: "bg-surface-container-lowest",
  green: "bg-emerald-600 text-emerald-50",
  red: "bg-destructive text-destructive-foreground",
  yellow: "bg-amber-400 text-amber-900",
  black: "bg-black text-white",
  blue: "bg-blue-600 text-white",
};

interface StatItem {
  label: string;
  valueKey: keyof Resumen;
  tone?: Tone;
  format?: "number" | "percent" | "money" | "moneyK";
}

const stats: StatItem[] = [
  { label: "Unidades totales", valueKey: "unidadesTotales" },
  { label: "Ocupadas", valueKey: "ocupadas", tone: "green" },
  { label: "Disponibles", valueKey: "disponibles", tone: "red" },
  { label: "Tasa de ocupación", valueKey: "tasaOcupacion", format: "percent" },
  { label: "Mantenimiento", valueKey: "mantenimiento" },
  { label: "Incidencias", valueKey: "incidencias" },
  { label: "Ingresos YTD", valueKey: "ingresosYTD", tone: "blue", format: "moneyK" },
  { label: "Egresos YTD", valueKey: "egresos", tone: "yellow", format: "moneyK" },
  { label: "Resultados YTD", valueKey: "resultadosYTD", format: "moneyK" },
  { label: "Morosidad", valueKey: "morosidad", tone: "black", format: "percent" },
  { label: "A punto de finalizar", valueKey: "aPuntoDeFinalizar", tone: "red" },
  { label: "Clientes reportados", valueKey: "clientesReportados", tone: "red" },
];

function moneyCompact(n: number): string {
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${signo}${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = abs / 1_000;
    return `${signo}${v >= 10 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return `${signo}${abs.toLocaleString("es-PE")}`;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    CONTRACT_CREATED: "creó el contrato",
    CONTRACT_UPDATED: "actualizó el contrato",
    CONTRACT_EMISSION_REQUESTED: "solicitó emisión",
    SNAPSHOT_CREATED: "generó instantánea",
    CONTRACT_EMITTED: "emitió el contrato",
    CONTRACT_SIGNATURE_REQUESTED: "solicitó la firma",
    CONTRACT_SIGNED: "firmó el contrato",
    CONTRACT_RESOLVED: "resolvió el contrato",
    CONTRACT_RENEWED: "renovó el contrato",
    CONTRACT_CANCELLED: "canceló el contrato",
  };
  return map[action] ?? action.toLowerCase().replace(/_/g, " ");
}

function statValue(s: StatItem, r: Resumen): number | string {
  const raw = r[s.valueKey];
  const n = typeof raw === "number" ? raw : Number(raw) || 0;
  if (s.format === "percent") {
    return `${n}%`;
  }
  if (s.format === "moneyK") {
    return moneyCompact(n);
  }
  if (s.format === "money") {
    return n.toLocaleString("es-PE", {
      style: "currency",
      currency: "PEN",
      maximumFractionDigits: 0,
    });
  }
  return n.toLocaleString("es-PE");
}

function StatCard({ s, r }: { s: StatItem; r: Resumen }) {
  return (
    <div
      className={
        "col-span-12 flex flex-col justify-between rounded-lg p-4 shadow-sm transition-shadow hover:shadow-md sm:col-span-6 md:col-span-4 lg:col-span-2 " +
        (s.tone ? toneCardClass[s.tone] : toneCardClass.default)
      }
    >
      <div className="mb-2">
        <span className="font-label-md uppercase tracking-wider">
          {s.label}
        </span>
      </div>
      <div>
        <span className="block font-display leading-none">
          {statValue(s, r)}
        </span>
      </div>
    </div>
  );
}

function ProximosAVencerBox({
  contratos,
  onCambio,
}: {
  contratos: ProximoAVencer[];
  onCambio: (id: string, renueva: boolean, meses: number | null) => Promise<void>;
}) {
  const [guardados, setGuardados] = useState<Record<string, { renueva: boolean; meses: string }>>(
    () => {
      const init: Record<string, { renueva: boolean; meses: string }> = {};
      for (const c of contratos) {
        if (c.renuevaProximoMes !== null) {
          init[c.id] = {
            renueva: Boolean(c.renuevaProximoMes),
            meses: c.renovacionMeses ? String(c.renovacionMeses) : "",
          };
        }
      }
      return init;
    }
  );
  const [salvando, setSalvando] = useState<string | null>(null);

  async function guardar(id: string, renueva: boolean, meses: string) {
    const mesesNum = meses.trim() === "" ? null : Number(meses);
    setSalvando(id);
    try {
      await onCambio(id, renueva, mesesNum);
      setGuardados((prev) => ({ ...prev, [id]: { renueva, meses } }));
    } catch {
      /* error de red: se deja sin cambio */
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-3">
      <div className="mb-2 flex items-center gap-2 font-label-md text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        {contratos.length}{" "}
        {contratos.length === 1
          ? "contrato vence en el próximo mes:"
          : "contratos vencen en el próximo mes:"}
      </div>
      <ul className="divide-y divide-amber-400/20">
        {contratos.map((p) => {
          const estado = guardados[p.id];
          const marcado = estado?.renueva ?? false;
          const noMarcado = estado ? !estado.renueva : false;
          const meses = estado?.meses ?? "";
          const enProceso = salvando === p.id;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
              <Link
                href={`/contratos/${p.id}`}
                className="min-w-0 flex-1 font-body-sm text-on-surface hover:text-primary hover:underline"
              >
                <span className="font-semibold">{p.codigoContrato}</span>
                {" · "}
                {p.cliente}
                {p.departamento ? ` · ${p.departamento}` : ""}
              </Link>
              <span className="text-xs text-on-surface-variant">
                vence el{" "}
                {new Date(`${p.fechaFin}T12:00:00`).toLocaleDateString("es-PE")}
              </span>
              <label className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(e) =>
                    void guardar(p.id, e.target.checked, e.target.checked ? "12" : "")
                  }
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                Renueva
              </label>
              <label className="flex items-center gap-1 text-xs font-medium text-destructive">
                <input
                  type="checkbox"
                  checked={noMarcado}
                  onChange={(e) =>
                    void guardar(p.id, false, e.target.checked ? "" : "12")
                  }
                  className="h-3.5 w-3.5 accent-destructive"
                />
                No renueva
              </label>
              {marcado ? (
                <label className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span>Renueva por</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={meses}
                    onChange={(e) => setGuardados((prev) => ({ ...prev, [p.id]: { renueva: true, meses: e.target.value } }))}
                    onBlur={(e) => void guardar(p.id, true, e.target.value)}
                    className="w-14 rounded border border-outline-variant bg-surface-container-lowest px-1 py-0.5 text-center text-xs text-on-surface focus:border-primary focus:outline-none"
                  />
                  <span>meses</span>
                </label>
              ) : null}
              {enProceso ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-outline border-t-primary" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/dashboard")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${r.status}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  const resumen = useMemo<Resumen | null>(() => {
    if (!data) return null;
    return {
      ...data.resumen,
    };
  }, [data]);

return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Resumen</h2>
            <p className="font-body-sm text-on-surface-variant">
              Estado del sistema · Rol: {user?.role ?? ""}
              {" · "}
              <Link href="/workflow" className="text-primary-container hover:text-primary">
                Ver workflow
              </Link>
            </p>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5" />
            No se pudo cargar el dashboard: {error}
          </div>
        ) : !data ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando métricas…
          </div>
        ) : (
          <>
            {data.resumen.proximosAVencer && data.resumen.proximosAVencer.length > 0 ? (
              <ProximosAVencerBox
                contratos={data.resumen.proximosAVencer}
                onCambio={async (id, renueva, meses) => {
                  const r = await apiFetch(`/api/contracts/${id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "renovacion", renueva, meses }),
                  });
                  if (!r.ok) {
                    const b = await r.json().catch(() => ({}));
                    throw new Error((b as { error?: string }).error ?? "No se pudo guardar");
                  }
                }}
              />
            ) : null}
            <div className="grid grid-cols-12 gap-4">
            {stats.map((s) => (
              <StatCard key={s.label} s={s} r={resumen!} />
            ))}

            <div className="col-span-12">
              <CobranzaVendedores />
            </div>

            <div className="col-span-12 flex flex-col rounded-lg bg-surface-container-lowest shadow-sm lg:col-span-6">
              <div className="flex items-center justify-between p-5">
                <h3 className="font-headline-md text-primary">Portafolio · Ocupación</h3>
                <span className="font-mono-label text-on-surface-variant">
                  {resumen!.ocupadas} de {resumen!.unidadesTotales} unidades
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-center p-5">
                <DonutChart
                  segments={[
                    { label: "Ocupadas", value: resumen!.ocupadas, color: "rgb(96, 165, 250)" },
                    { label: "Desocupadas", value: resumen!.disponibles, color: "rgb(203, 213, 225)" },
                  ]}
                  centerLabel="Ocupación"
                  centerValue={`${resumen!.tasaOcupacion}%`}
                />
              </div>
            </div>

            <div className="col-span-12 flex flex-col rounded-lg bg-surface-container-lowest shadow-sm lg:col-span-6">
              <div className="flex items-center justify-between p-5">
                <h3 className="font-headline-md text-primary">Distribución de estados</h3>
              </div>
              <div className="flex flex-1 flex-col justify-center p-5">
                <DonutChart
                  segments={[
                    { label: "Ocupado", value: resumen!.ocupadas, color: "rgb(96, 165, 250)" },
                    { label: "Disponible", value: resumen!.disponibles, color: "rgb(74, 222, 128)" },
                    { label: "Mantenimiento", value: data.resumen.mantenimiento, color: "rgb(250, 204, 21)" },
                    { label: "En proceso", value: resumen!.enProceso, color: "rgb(248, 113, 113)" },
                  ]}
                />
              </div>
            </div>

            <div className="col-span-12 flex flex-col rounded-lg bg-surface-container-lowest shadow-sm">
              <div className="flex items-center justify-between p-5">
                <h3 className="font-headline-md text-primary">Actividad reciente</h3>
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <ul className="max-h-[400px] flex-1 divide-y divide-outline-variant/50 overflow-y-auto">
                {data.actividadReciente.length === 0 ? (
                  <li className="p-4 font-body-sm text-on-surface-variant">Sin actividad.</li>
                ) : (
                  data.actividadReciente.map((a) => (
                    <li key={a.id} className="flex gap-3 p-4 transition-colors hover:bg-surface">
                      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-body-sm text-on-surface break-words">
                          <span className="font-semibold">{a.actor}</span> {actionLabel(a.action)}
                        </p>
                        <span className="font-mono-label text-on-surface-variant">
                          {new Date(a.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <div className="p-3 text-center">
                <Link href="/actividad" className="font-label-md text-primary-container hover:text-primary">
                  Ver actividad completa
                </Link>
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}