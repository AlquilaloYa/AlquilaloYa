"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AlertTriangle, ChevronDown, X } from "lucide-react";
import { DonutChart } from "@/components/donut-chart";
import { CobranzaVendedores } from "@/components/cobranza-vendedores";
import { addMonths, localDateStr, parseLocalDate } from "@/lib/cronograma";

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

interface PagoVenceHoy {
  id: string;
  codigoContrato: string;
  cliente: string;
  departamento: string | null;
  monto: number;
  periodo: string;
}

interface ContratoMorosidad {
  id: string;
  codigoContrato: string;
  clienteId: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
  montoCanonMensual: string;
  mantenimiento: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}

interface PagoMorosidad {
  contractId: string;
  periodo: string;
  estado: string;
  fechaPago: string | null;
  diasIndulgencia?: number;
}

interface DepartamentoDashboard {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  piso?: number;
  precio?: string;
  activo: boolean;
  motivoBloqueo?: string | null;
  enMantenimiento?: boolean;
  bloqueado?: boolean;
  estadoManual?: string | null;
  disponibilidad: { disponible: false; fechaFin: string; dias: number } | null;
  ocupante?: { nombres: string; apellidos: string | null; telefono: string | null } | null;
}

interface ContratoDashboard {
  id: string;
  codigoContrato: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
  departamentoId: string;
  fechaInicio: string;
  fechaFin: string;
  resueltoEn?: string | null;
  estado: string;
}

interface AdendaDashboard {
  id: string;
  tipo: string;
  estadoGeneracion: string;
  fechaFinAdenda: string | null;
  codigoContrato: string;
  clienteNombre: string;
  clienteApellidos: string;
  departamentoNombre: string;
}

type DashboardPanel = "morosidad" | "ocupadas" | "disponibles" | "ocupacion" | "finalizan" | "unidades";

interface DetalleMorosidad {
  contrato: string;
  departamento: string;
  periodo: string;
  vencimiento: string;
  fechaPago: string | null;
  diasAtraso: number;
  estado: "Vencido" | "Pagado";
}

interface ClienteMorosidad {
  id: string;
  nombre: string;
  detalles: DetalleMorosidad[];
}

function sumarDiasFecha(fecha: string, dias: number): string {
  const resultado = parseLocalDate(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return localDateStr(resultado);
}

function diasEntreFechas(desde: string, hasta: string): number {
  return Math.max(
    0,
    Math.floor(
      (parseLocalDate(hasta).getTime() - parseLocalDate(desde).getTime()) /
        86_400_000
    )
  );
}

function fechaLegible(fecha: string): string {
  return parseLocalDate(fecha).toLocaleDateString("es-PE");
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
  pagosVencenHoy?: PagoVenceHoy[];
  contratosRenovados: number;
  contratosVencidosPeriodo: number;
  tasaRenovacion: number;
  duracionMediaContratoDias: number | null;
  duracionContratos: { label: string; cantidad: number }[];
  vacanciaMediaDias: number | null;
  vacanciasObservadas: number;
  distribucionVacancia: { label: string; cantidad: number }[];
  vacanciaActualMediaDias: number | null;
  departamentosLibresConHistorial: number;
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

function StatCard({
  s,
  r,
  onOpen,
}: {
  s: StatItem;
  r: Resumen;
  onOpen: () => void;
}) {
  const className =
    "col-span-12 flex flex-col justify-between rounded-lg p-4 text-left shadow-sm transition-shadow hover:shadow-md sm:col-span-6 md:col-span-4 lg:col-span-2 " +
    (s.tone ? toneCardClass[s.tone] : toneCardClass.default);
  const contenido = (
    <>
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
    </>
  );
  if (["unidadesTotales", "morosidad", "ocupadas", "disponibles", "tasaOcupacion", "aPuntoDeFinalizar"].includes(s.valueKey)) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir detalle: ${s.label}`}
        className={`${className} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
      >
        {contenido}
      </button>
    );
  }
  return <div className={className}>{contenido}</div>;
}

function DistributionBars({
  items,
  emptyLabel,
}: {
  items: { label: string; cantidad: number }[];
  emptyLabel: string;
}) {
  const maximo = Math.max(1, ...items.map((item) => item.cantidad));
  if (items.every((item) => item.cantidad === 0)) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="space-y-1.5">
          <div className="flex justify-between gap-3 text-sm">
            <span>{item.label}</span>
            <span className="font-mono-label">{item.cantidad}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-variant">
            <div
              className="h-full rounded-full bg-sky-600"
              style={{ width: `${(item.cantidad / maximo) * 100}%` }}
            />
          </div>
        </div>
      ))}
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

function PagarHoyPopup({
  pagos,
  onCerrar,
}: {
  pagos: PagoVenceHoy[];
  onCerrar: () => void;
}) {
  const total = pagos.reduce((s, p) => s + p.monto, 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-label-lg text-on-surface">
                Pagos de hoy ({pagos.length})
              </h3>
              <p className="font-body-sm text-on-surface-variant">
                Clientes que deben pagar el día de hoy · Total S/{" "}
                {total.toLocaleString("es-PE")}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="rounded p-1 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {pagos.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/60 bg-surface-container-low px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-label-md text-on-surface">
                  {p.cliente}
                </p>
                <p className="truncate font-body-sm text-on-surface-variant">
                  {p.departamento ?? p.codigoContrato}
                  {" · "}
                  {p.codigoContrato}
                </p>
              </div>
              <span className="shrink-0 font-label-lg text-emerald-600">
                S/ {p.monto.toLocaleString("es-PE")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function useDashboardJson<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    apiFetch(path)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${response.status}`);
        }
        return (await response.json()) as T;
      })
      .then((result) => {
        if (activo) setData(result);
      })
      .catch((reason: unknown) => {
        if (activo) setError(reason instanceof Error ? reason.message : "Error al cargar datos");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [path, reloadKey]);

  return { data, loading, error, reload: () => setReloadKey((key) => key + 1) };
}

function DashboardPanel({
  titulo,
  subtitulo,
  onCerrar,
  children,
  panelClassName = "max-w-4xl",
}: {
  titulo: string;
  subtitulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  panelClassName?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onCerrar}
    >
      <section
        className={`flex max-h-[90vh] w-full ${panelClassName} flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
          <div>
            <h2 className="font-headline-md text-on-surface">{titulo}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{subtitulo}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded p-1 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">{children}</div>
      </section>
    </div>
  );
}

function EstadoCarga({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-sm text-on-surface-variant">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
        Cargando datos…
      </div>
    );
  }
  return error ? (
    <p className="rounded-lg bg-error-container p-4 text-sm text-error-container-foreground">{error}</p>
  ) : null;
}

interface PuntoOcupacion {
  x: number;
  y: number;
  mes: string;
  ocupadas: number;
  porcentaje: number;
}

function curvaSuave(puntos: PuntoOcupacion[]): string {
  if (puntos.length === 0) return "";
  const primero = puntos[0]!;
  let path = `M ${primero.x} ${primero.y}`;
  for (let indice = 0; indice < puntos.length - 1; indice++) {
    const previo = puntos[Math.max(0, indice - 1)]!;
    const inicio = puntos[indice]!;
    const fin = puntos[indice + 1]!;
    const siguiente = puntos[Math.min(puntos.length - 1, indice + 2)]!;
    path += ` C ${inicio.x + (fin.x - previo.x) / 6} ${inicio.y + (fin.y - previo.y) / 6}, ${fin.x - (siguiente.x - inicio.x) / 6} ${fin.y - (siguiente.y - inicio.y) / 6}, ${fin.x} ${fin.y}`;
  }
  return path;
}

function OcupadasPopup({ onCerrar }: { onCerrar: () => void }) {
  const { data, loading, error } = useDashboardJson<DepartamentoDashboard[]>("/api/departamentos");
  const ocupados = (data ?? []).filter((departamento) => departamento.activo && departamento.disponibilidad);
  return (
    <DashboardPanel titulo="Departamentos ocupados" subtitulo={`${ocupados.length} departamentos con contrato vigente`} onCerrar={onCerrar}>
      <EstadoCarga loading={loading} error={error} />
      {!loading && !error && (ocupados.length === 0 ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">No hay departamentos ocupados.</p>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {ocupados.map((departamento) => (
            <li key={departamento.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-label-lg text-on-surface">{departamento.codigo} · {departamento.nombre}</p>
                <p className="text-sm text-on-surface-variant">Departamento {departamento.numero}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-on-surface">
                  {departamento.ocupante
                    ? [departamento.ocupante.nombres, departamento.ocupante.apellidos].filter(Boolean).join(" ")
                    : "Sin ocupante registrado"}
                </p>
                {departamento.ocupante?.telefono ? <p className="text-sm text-on-surface-variant">{departamento.ocupante.telefono}</p> : null}
                {departamento.disponibilidad ? <p className="text-xs text-on-surface-variant">Contrato hasta {fechaLegible(departamento.disponibilidad.fechaFin)}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ))}
    </DashboardPanel>
  );
}

function UnidadesTotalesPopup({ onCerrar }: { onCerrar: () => void }) {
  const { data, loading, error } = useDashboardJson<DepartamentoDashboard[]>("/api/departamentos");
  const departamentos = (data ?? [])
    .filter((departamento) => !departamento.codigo.startsWith("EXT"))
    .sort((a, b) => {
      const clave = (codigo: string): [number, string] => {
        const match = /(\d+)([A-Z]*)$/.exec(codigo);
        return match ? [Number(match[1]), match[2] ?? ""] : [0, codigo];
      };
      const [numeroA, sufijoA] = clave(a.codigo);
      const [numeroB, sufijoB] = clave(b.codigo);
      return numeroA - numeroB || sufijoA.localeCompare(sufijoB);
    });
  const grupos = [
    { titulo: "Benavides 2195", departamentos: departamentos.filter((departamento) => departamento.codigo.startsWith("BEN")) },
    { titulo: "Angamos 170", departamentos: departamentos.filter((departamento) => departamento.codigo.startsWith("ANG")) },
    { titulo: "Otros", departamentos: departamentos.filter((departamento) => !departamento.codigo.startsWith("BEN") && !departamento.codigo.startsWith("ANG")) },
  ].filter((grupo) => grupo.departamentos.length > 0);

  function estado(departamento: DepartamentoDashboard) {
    if (departamento.disponibilidad) return { texto: "Ocupado", clase: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" };
    if (departamento.bloqueado) return { texto: "Bloqueado", clase: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" };
    if (departamento.enMantenimiento) return { texto: "Mantenimiento", clase: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" };
    return { texto: "Disponible", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" };
  }

  const ocupados = departamentos.filter((departamento) => departamento.disponibilidad).length;
  const bloqueados = departamentos.filter((departamento) => !departamento.disponibilidad && departamento.bloqueado).length;
  const mantenimiento = departamentos.filter((departamento) => !departamento.disponibilidad && !departamento.bloqueado && departamento.enMantenimiento).length;
  const disponibles = departamentos.length - ocupados - bloqueados - mantenimiento;

  return (
    <DashboardPanel titulo="Unidades totales" subtitulo={`${departamentos.length} departamentos · inventario por sede y estado`} onCerrar={onCerrar}>
      <EstadoCarga loading={loading} error={error} />
      {!loading && !error ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{disponibles} disponibles</span>
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-800 dark:bg-rose-950 dark:text-rose-200">{ocupados} ocupados</span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800 dark:bg-sky-950 dark:text-sky-200">{mantenimiento} mantenimiento</span>
            <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{bloqueados} bloqueados</span>
          </div>
          {grupos.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">No hay departamentos registrados.</p>
          ) : (
            <div className="space-y-5">
              {grupos.map((grupo) => (
                <section key={grupo.titulo}>
                  <h3 className="mb-2 flex items-center justify-between gap-3 border-b border-outline-variant pb-2 font-label-lg text-on-surface">
                    {grupo.titulo}
                    <span className="text-xs font-normal text-on-surface-variant">{grupo.departamentos.length} unidades</span>
                  </h3>
                  <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {grupo.departamentos.map((departamento) => {
                      const meta = estado(departamento);
                      const tarjetaClase = departamento.disponibilidad
                        ? "border-red-600/20 bg-red-500/10 border-l-red-600 hover:bg-red-500/15"
                        : departamento.bloqueado
                          ? "border-black bg-black border-l-black hover:opacity-90"
                          : departamento.enMantenimiento
                            ? "border-blue-600/20 bg-blue-500/10 border-l-blue-600 hover:bg-blue-500/15"
                            : "border-green-600/20 bg-green-500/10 border-l-green-600 hover:bg-green-500/15";
                      const codigoClase = departamento.disponibilidad
                        ? "text-red-700 dark:text-red-500"
                        : departamento.bloqueado
                          ? "text-white"
                          : departamento.enMantenimiento
                            ? "text-blue-700 dark:text-blue-500"
                            : "text-green-700 dark:text-green-500";
                      return (
                        <li key={departamento.id}>
                          <Link
                            href={`/disponibilidad/${encodeURIComponent(departamento.codigo)}`}
                            title={`${departamento.codigo} · ${meta.texto}${departamento.disponibilidad ? ` hasta ${fechaLegible(departamento.disponibilidad.fechaFin)}` : ""}`}
                            className={`flex min-h-20 aspect-[1.8] flex-col items-center justify-center gap-1 rounded-lg border border-l-4 p-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${tarjetaClase}`}
                          >
                            <span className={`font-mono-label text-sm font-bold sm:text-base ${codigoClase}`}>{departamento.codigo}</span>
                            <span className={`text-[10px] font-medium sm:text-xs ${departamento.bloqueado ? "text-white/80" : "text-on-surface-variant"}`}>{meta.texto}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}
    </DashboardPanel>
  );
}

function DisponiblesPopup({ onCerrar }: { onCerrar: () => void }) {
  const { data, loading, error, reload } = useDashboardJson<DepartamentoDashboard[]>("/api/departamentos");
  const [causas, setCausas] = useState<Record<string, string>>({});
  const [bloqueoEnEdicion, setBloqueoEnEdicion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const departamentos = (data ?? []).filter((departamento) => departamento.activo && !departamento.disponibilidad);
  const disponibles = departamentos.filter((departamento) => !departamento.enMantenimiento && !departamento.bloqueado);
  const mantenimiento = departamentos.filter((departamento) => departamento.enMantenimiento);
  const bloqueados = departamentos.filter((departamento) => departamento.bloqueado);

  useEffect(() => {
    if (data) {
      setCausas((actuales) => {
        const nuevas = { ...actuales };
        for (const departamento of data) {
          if (!(departamento.id in nuevas)) nuevas[departamento.id] = departamento.motivoBloqueo ?? "";
        }
        return nuevas;
      });
    }
  }, [data]);

  async function actualizarEstado(id: string, estadoManual: string, motivoBloqueo: string | null) {
    setGuardando(id);
    setErrorAccion(null);
    try {
      const response = await apiFetch(`/api/departamentos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estadoManual, motivoBloqueo }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo actualizar el departamento");
      }
      setBloqueoEnEdicion(null);
      reload();
    } catch (reason) {
      setErrorAccion(reason instanceof Error ? reason.message : "No se pudo actualizar el departamento");
    } finally {
      setGuardando(null);
    }
  }

  function fila(departamento: DepartamentoDashboard, estado: "DISPONIBLE" | "MANTENIMIENTO" | "BLOQUEADO") {
    const editando = bloqueoEnEdicion === departamento.id;
    const nombre = `${departamento.codigo} · ${departamento.nombre}`;
    return (
      <li key={departamento.id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-on-surface">{nombre}</p>
            {estado === "BLOQUEADO" && departamento.motivoBloqueo ? <p className="mt-1 text-sm text-on-surface-variant">Causa: {departamento.motivoBloqueo}</p> : null}
          </div>
          {estado === "DISPONIBLE" ? (
            <button type="button" onClick={() => setBloqueoEnEdicion(editando ? null : departamento.id)} className="rounded border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-container-high">
              {editando ? "Cancelar" : "Bloquear"}
            </button>
          ) : (
            <button type="button" disabled={guardando === departamento.id} onClick={() => void actualizarEstado(departamento.id, "DISPONIBLE", null)} className="rounded border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50">
              {guardando === departamento.id ? "Guardando…" : "Marcar disponible"}
            </button>
          )}
        </div>
        {estado === "BLOQUEADO" || editando ? (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium text-on-surface-variant" htmlFor={`causa-${departamento.id}`}>Causa del bloqueo</label>
            <textarea
              id={`causa-${departamento.id}`}
              value={causas[departamento.id] ?? ""}
              maxLength={500}
              rows={2}
              onChange={(event) => setCausas((actuales) => ({ ...actuales, [departamento.id]: event.target.value }))}
              placeholder="Escribe por qué se bloquea este departamento"
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              disabled={guardando === departamento.id || !causas[departamento.id]?.trim()}
              onClick={() => void actualizarEstado(departamento.id, "BLOQUEADO", causas[departamento.id]?.trim() ?? "")}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando === departamento.id ? "Guardando…" : estado === "BLOQUEADO" ? "Guardar causa" : "Bloquear departamento"}
            </button>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <DashboardPanel titulo="Disponibilidad de departamentos" subtitulo="Unidades libres, en mantenimiento y bloqueadas" onCerrar={onCerrar}>
      <EstadoCarga loading={loading} error={error} />
      {errorAccion ? <p className="mb-3 rounded bg-error-container p-3 text-sm text-error-container-foreground">{errorAccion}</p> : null}
      {!loading && !error ? (
        <div className="space-y-6">
          {[
            { titulo: `Disponibles (${disponibles.length})`, elementos: disponibles, estado: "DISPONIBLE" as const },
            { titulo: `En mantenimiento (${mantenimiento.length})`, elementos: mantenimiento, estado: "MANTENIMIENTO" as const },
            { titulo: `Bloqueados (${bloqueados.length})`, elementos: bloqueados, estado: "BLOQUEADO" as const },
          ].map((grupo) => (
            <section key={grupo.estado}>
              <h3 className="border-b border-outline-variant pb-2 font-label-lg text-on-surface">{grupo.titulo}</h3>
              {grupo.elementos.length === 0 ? <p className="py-3 text-sm text-on-surface-variant">No hay departamentos en este estado.</p> : <ul className="divide-y divide-outline-variant">{grupo.elementos.map((departamento) => fila(departamento, grupo.estado))}</ul>}
            </section>
          ))}
        </div>
      ) : null}
    </DashboardPanel>
  );
}

function OcupacionAnualPopup({ onCerrar }: { onCerrar: () => void }) {
  const { data: departamentos, loading: cargandoDeptos, error: errorDeptos } = useDashboardJson<DepartamentoDashboard[]>("/api/departamentos");
  const { data: contratos, loading: cargandoContratos, error: errorContratos } = useDashboardJson<ContratoDashboard[]>("/api/contracts");
  const [aniosVisibles, setAniosVisibles] = useState<number[]>([]);
  const loading = cargandoDeptos || cargandoContratos;
  const error = errorDeptos ?? errorContratos;
  const año = new Date().getFullYear();
  const total = (departamentos ?? []).filter((departamento) => departamento.activo).length;
  const anios = [año - 2, año - 1, año];
  const estadosOcupacion = new Set(["FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE", "RESUELTO"]);
  const colores = ["#f59e0b", "#22d3ee", "#fb7185"];
  const series = anios.map((anio, serieIndex) => ({
    anio,
    color: colores[serieIndex]!,
    puntos: Array.from({ length: 12 }, (_, indice) => {
      const inicio = `${anio}-${String(indice + 1).padStart(2, "0")}-01`;
      const fin = localDateStr(new Date(anio, indice + 1, 0));
      const ocupadas = new Set(
        (contratos ?? [])
          .filter((contrato) => {
            if (!estadosOcupacion.has(contrato.estado) || contrato.fechaInicio > fin) return false;
            const finReal = contrato.estado === "RESUELTO"
              ? contrato.resueltoEn?.slice(0, 10) ?? contrato.fechaFin
              : contrato.fechaFin;
            return finReal >= inicio;
          })
          .map((contrato) => contrato.departamentoId)
      ).size;
      const porcentaje = total ? Math.round((ocupadas / total) * 100) : 0;
      return {
        mes: new Date(anio, indice, 1).toLocaleDateString("es-PE", { month: "short" }).replace(".", ""),
        ocupadas,
        porcentaje,
        x: 76 + (indice / 11) * 796,
        y: 286 - (porcentaje / 100) * 238,
      };
    }),
  }));
  const seriesEfectivas = aniosVisibles.length > 0 ? aniosVisibles : anios;
  const puntosActuales = series.find((serie) => serie.anio === año)?.puntos ?? [];
  const mesActual = puntosActuales[new Date().getMonth()];
  const pico = puntosActuales.reduce((maximo, mes) => mes.ocupadas > maximo.ocupadas ? mes : maximo, puntosActuales[0]!);
  const promedio = puntosActuales.length
    ? Math.round(puntosActuales.reduce((suma, mes) => suma + mes.porcentaje, 0) / puntosActuales.length)
    : 0;

  function alternarAnio(anio: number) {
    setAniosVisibles((actuales) => {
      const visibles = actuales.length > 0 ? actuales : anios;
      if (visibles.includes(anio)) {
        const siguientes = visibles.filter((item) => item !== anio);
        return siguientes.length > 0 ? siguientes : anios;
      }
      return [...visibles, anio];
    });
  }

  return (
    <DashboardPanel titulo={`Ocupación · ${año}`} subtitulo="Tendencia mensual de departamentos ocupados" onCerrar={onCerrar} panelClassName="max-w-5xl">
      <EstadoCarga loading={loading} error={error} />
      {!loading && !error ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="font-headline-md text-on-surface">{mesActual?.porcentaje ?? 0}%</span>
              <span className="text-sm text-on-surface-variant">este mes · {mesActual?.ocupadas ?? 0}/{total}</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-surface-container-low p-1" aria-label="Mostrar años">
              {series.map((serie) => {
                const activa = seriesEfectivas.includes(serie.anio);
                return (
                  <button
                    key={serie.anio}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => alternarAnio(serie.anio)}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${activa ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activa ? serie.color : "#9ca3af" }} />
                    {serie.anio}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg bg-[#171a20] p-2 sm:p-4">
            <svg viewBox="0 0 900 340" role="img" aria-label={`Tendencia mensual de ocupación entre ${anios[0]} y ${año}`} className="h-auto min-w-[640px] w-full">
              {[0, 25, 50, 75, 100].map((nivel) => {
                const y = 286 - (nivel / 100) * 238;
                return (
                  <g key={nivel}>
                    <text x="50" y={y + 4} textAnchor="end" fill="#9ca3af" fontSize="11">{nivel}%</text>
                    <line x1="64" x2="872" y1={y} y2={y} stroke="#ffffff" strokeOpacity="0.1" strokeDasharray="3 5" />
                  </g>
                );
              })}
              {seriesEfectivas.map((anio) => {
                const serie = series.find((item) => item.anio === anio)!;
                const linea = curvaSuave(serie.puntos);
                const primero = serie.puntos[0]!;
                const ultimo = serie.puntos[serie.puntos.length - 1]!;
                return (
                  <g key={anio}>
                    <path d={`${linea} L ${ultimo.x} 286 L ${primero.x} 286 Z`} fill={serie.color} fillOpacity="0.12" />
                    <path d={linea} fill="none" stroke={serie.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    {serie.puntos.map((punto) => (
                      <circle key={`${anio}-${punto.mes}`} cx={punto.x} cy={punto.y} r="3.5" fill={serie.color} stroke="#171a20" strokeWidth="2">
                        <title>{`${anio} ${punto.mes}: ${punto.ocupadas} departamentos · ${punto.porcentaje}%`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
              {series[0]!.puntos.map((punto) => (
                <text key={punto.mes} x={punto.x} y="320" textAnchor="middle" fill="#d1d5db" fontSize="11" className="capitalize">{punto.mes}</text>
              ))}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface-variant">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {seriesEfectivas.map((anio) => {
                const serie = series.find((item) => item.anio === anio)!;
                return <span key={anio} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serie.color }} />{anio}</span>;
              })}
            </div>
            <span>Pico {pico.porcentaje}% · Promedio {promedio}% · Total {total}</span>
          </div>
        </div>
      ) : null}
    </DashboardPanel>
  );
}

function FinalizanPopup({ onCerrar }: { onCerrar: () => void }) {
  const { data: contratos, loading: cargandoContratos, error: errorContratos } = useDashboardJson<ContratoDashboard[]>("/api/contracts");
  const { data: adendasResponse, loading: cargandoAdendas, error: errorAdendas } = useDashboardJson<{ items: AdendaDashboard[] }>("/api/adendas");
  const hoy = localDateStr(new Date());
  const horizonte = new Date();
  horizonte.setDate(horizonte.getDate() + 30);
  const finHorizonte = localDateStr(horizonte);
  const estadosValidos = new Set(["EMITIDO", "PENDIENTE_FIRMA", "FIRMADO", "NOTARIADO", "ACTIVO", "VIGENTE"]);
  const proximosContratos = (contratos ?? []).filter((contrato) => estadosValidos.has(contrato.estado) && contrato.fechaFin >= hoy && contrato.fechaFin <= finHorizonte).sort((a, b) => a.fechaFin.localeCompare(b.fechaFin));
  const proximasAdendas = (adendasResponse?.items ?? []).filter((adenda) => adenda.estadoGeneracion === "GENERADO" && adenda.fechaFinAdenda && adenda.fechaFinAdenda >= hoy && adenda.fechaFinAdenda <= finHorizonte).sort((a, b) => (a.fechaFinAdenda ?? "").localeCompare(b.fechaFinAdenda ?? ""));
  const loading = cargandoContratos || cargandoAdendas;
  const error = errorContratos ?? errorAdendas;

  return (
    <DashboardPanel titulo="Contratos y adendas por finalizar" subtitulo="Documentos con fecha de término dentro de los próximos 30 días" onCerrar={onCerrar}>
      <EstadoCarga loading={loading} error={error} />
      {!loading && !error ? (
        <div className="space-y-6">
          <section>
            <h3 className="border-b border-outline-variant pb-2 font-label-lg text-on-surface">Contratos ({proximosContratos.length})</h3>
            {proximosContratos.length === 0 ? <p className="py-3 text-sm text-on-surface-variant">No hay contratos próximos a finalizar.</p> : (
              <ul className="divide-y divide-outline-variant">
                {proximosContratos.map((contrato) => <li key={contrato.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-medium text-on-surface">{contrato.codigoContrato} · {contrato.clienteNombre} {contrato.apellidoCliente} · {contrato.departamentoNombre}</span><span className="text-on-surface-variant">Finaliza {fechaLegible(contrato.fechaFin)}</span></li>)}
              </ul>
            )}
          </section>
          <section>
            <h3 className="border-b border-outline-variant pb-2 font-label-lg text-on-surface">Adendas ({proximasAdendas.length})</h3>
            {proximasAdendas.length === 0 ? <p className="py-3 text-sm text-on-surface-variant">No hay adendas próximas a finalizar.</p> : (
              <ul className="divide-y divide-outline-variant">
                {proximasAdendas.map((adenda) => <li key={adenda.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-medium text-on-surface">{adenda.tipo.replace(/_/g, " ")} · {adenda.codigoContrato} · {[adenda.clienteNombre, adenda.clienteApellidos].filter(Boolean).join(" ")} · {adenda.departamentoNombre}</span><span className="text-on-surface-variant">Finaliza {fechaLegible(adenda.fechaFinAdenda!)}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </DashboardPanel>
  );
}

function MorosidadPopup({ onCerrar }: { onCerrar: () => void }) {
  const [contratos, setContratos] = useState<ContratoMorosidad[]>([]);
  const [pagos, setPagos] = useState<PagoMorosidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/contracts").then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar los contratos");
        return (await response.json()) as ContratoMorosidad[];
      }),
      apiFetch("/api/payments").then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar los pagos");
        return (await response.json()) as PagoMorosidad[];
      }),
    ])
      .then(([contratosData, pagosData]) => {
        setContratos(contratosData);
        setPagos(pagosData);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Error al cargar morosidad");
      })
      .finally(() => setCargando(false));
  }, []);

  const clientes = useMemo(() => {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const contratoPorId = new Map(contratos.map((contrato) => [contrato.id, contrato]));
    const porCliente = new Map<string, ClienteMorosidad>();

    function clientePara(contrato: ContratoMorosidad): ClienteMorosidad {
      let cliente = porCliente.get(contrato.clienteId);
      if (!cliente) {
        const nombre = [contrato.clienteNombre, contrato.apellidoCliente]
          .filter(Boolean)
          .join(" ");
        cliente = {
          id: contrato.clienteId,
          nombre: nombre || "Cliente sin nombre",
          detalles: [],
        };
        porCliente.set(contrato.clienteId, cliente);
      }
      return cliente;
    }

    for (const contrato of contratos) {
      if (contrato.estado === "CANCELADO" || contrato.estado === "RESUELTO") continue;
      const inicio = parseLocalDate(contrato.fechaInicio);
      const fin = parseLocalDate(contrato.fechaFin);
      if (inicio.getTime() > inicioDia.getTime()) continue;

      const mesesDesdeInicio =
        (hoy.getFullYear() - inicio.getFullYear()) * 12 +
        hoy.getMonth() -
        inicio.getMonth();
      const periodo = localDateStr(addMonths(inicio, mesesDesdeInicio));
      if (!periodo.startsWith(mesActual) || parseLocalDate(periodo) >= fin) continue;

      const pago = pagos.find(
        (item) => item.contractId === contrato.id && item.periodo === periodo
      );
      if (pago?.estado === "PAGADO") continue;

      const indulgencia = Math.max(0, Math.floor(Number(pago?.diasIndulgencia ?? 0) || 0));
      const vencimiento = sumarDiasFecha(periodo, indulgencia);
      if (parseLocalDate(vencimiento).getTime() >= inicioDia.getTime()) continue;

      clientePara(contrato).detalles.push({
        contrato: contrato.codigoContrato,
        departamento: contrato.departamentoNombre || "Sin departamento",
        periodo,
        vencimiento,
        fechaPago: null,
        diasAtraso: diasEntreFechas(vencimiento, localDateStr(inicioDia)),
        estado: "Vencido",
      });
    }

    for (const pago of pagos) {
      if (pago.estado !== "PAGADO" || !pago.fechaPago) continue;
      const contrato = contratoPorId.get(pago.contractId);
      if (!contrato) continue;

      const vencimiento = sumarDiasFecha(
        pago.periodo,
        Math.max(0, Math.floor(Number(pago.diasIndulgencia ?? 0) || 0))
      );
      if (pago.fechaPago <= vencimiento) continue;

      clientePara(contrato).detalles.push({
        contrato: contrato.codigoContrato,
        departamento: contrato.departamentoNombre || "Sin departamento",
        periodo: pago.periodo,
        vencimiento,
        fechaPago: pago.fechaPago,
        diasAtraso: diasEntreFechas(vencimiento, pago.fechaPago),
        estado: "Pagado",
      });
    }

    return [...porCliente.values()]
      .map((cliente) => ({
        ...cliente,
        detalles: cliente.detalles.sort((a, b) => b.periodo.localeCompare(a.periodo)),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [contratos, pagos]);

  const mesTitulo = new Date().toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="morosidad-titulo"
      onClick={onCerrar}
    >
      <section
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
          <div>
            <h2 id="morosidad-titulo" className="font-headline-md text-on-surface">
              Morosidad · {mesTitulo}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Clientes con cuotas vencidas este mes
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded p-1 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Cerrar morosidad"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          {cargando ? (
            <div className="flex items-center justify-center gap-3 py-12 text-sm text-on-surface-variant">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
              Cargando clientes morosos…
            </div>
          ) : error ? (
            <p className="rounded-lg bg-error-container p-4 text-sm text-error-container-foreground">
              {error}
            </p>
          ) : clientes.length === 0 ? (
            <p className="py-12 text-center text-sm text-on-surface-variant">
              No hay clientes con cuotas vencidas este mes.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm font-medium text-on-surface-variant">
                {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"} · {clientes.reduce((total, cliente) => total + cliente.detalles.filter((detalle) => detalle.estado === "Vencido").length, 0)} cuotas vencidas
              </p>
              <ul className="divide-y divide-outline-variant">
                {clientes.map((cliente) => {
                  const abierto = clienteAbierto === cliente.id;
                  const cuotasVencidas = cliente.detalles.filter(
                    (detalle) => detalle.estado === "Vencido"
                  ).length;
                  const diasPorMes = new Map<string, number>();
                  for (const detalle of cliente.detalles) {
                    const mes = detalle.periodo.slice(0, 7);
                    diasPorMes.set(mes, (diasPorMes.get(mes) ?? 0) + detalle.diasAtraso);
                  }
                  const historialMensual = [...diasPorMes.entries()].sort(([a], [b]) => a.localeCompare(b));
                  const maxDias = Math.max(1, ...historialMensual.map(([, dias]) => dias));

                  return (
                    <li key={cliente.id} className="py-2">
                      <button
                        type="button"
                        aria-expanded={abierto}
                        onClick={() => setClienteAbierto(abierto ? null : cliente.id)}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <span className="min-w-0 flex-1 font-label-lg text-on-surface">
                          {cliente.nombre}
                        </span>
                        <span className="shrink-0 text-sm text-destructive">
                          {cuotasVencidas} {cuotasVencidas === 1 ? "cuota" : "cuotas"} vencidas
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${abierto ? "rotate-180" : ""}`}
                        />
                      </button>

                      {abierto ? (
                        <div className="space-y-5 px-2 pb-4 pt-2">
                          <section>
                            <h3 className="mb-3 font-label-md text-on-surface">
                              Días de atraso por mes
                            </h3>
                            {historialMensual.length === 0 ? (
                              <p className="text-sm text-on-surface-variant">Sin atrasos registrados.</p>
                            ) : (
                              <div className="space-y-3">
                                {historialMensual.map(([mes, dias]) => (
                                  <div key={mes} className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-3 text-sm">
                                    <span className="text-on-surface-variant">
                                      {parseLocalDate(`${mes}-01`).toLocaleDateString("es-PE", { month: "short", year: "2-digit" })}
                                    </span>
                                    <div className="h-3 overflow-hidden rounded-sm bg-surface-variant">
                                      <div
                                        className="h-full rounded-sm bg-rose-600"
                                        style={{ width: `${Math.max(4, (dias / maxDias) * 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-right font-mono-label">{dias} d</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>

                          <section>
                            <h3 className="mb-3 font-label-md text-on-surface">
                              Detalle de cuotas y pagos
                            </h3>
                            <div className="overflow-x-auto rounded-md border border-outline-variant">
                              <table className="w-full min-w-[680px] text-left text-sm">
                                <thead className="bg-surface-container-low text-xs uppercase text-on-surface-variant">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Período</th>
                                    <th className="px-3 py-2 font-medium">Contrato · departamento</th>
                                    <th className="px-3 py-2 font-medium">Vencimiento</th>
                                    <th className="px-3 py-2 font-medium">Fecha de pago</th>
                                    <th className="px-3 py-2 text-right font-medium">Días tarde</th>
                                    <th className="px-3 py-2 font-medium">Estado</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-outline-variant">
                                  {cliente.detalles.map((detalle, index) => (
                                    <tr key={`${detalle.contrato}-${detalle.periodo}-${index}`}>
                                      <td className="px-3 py-2">{fechaLegible(detalle.periodo)}</td>
                                      <td className="px-3 py-2">
                                        {detalle.contrato} · {detalle.departamento}
                                      </td>
                                      <td className="px-3 py-2">{fechaLegible(detalle.vencimiento)}</td>
                                      <td className="px-3 py-2">
                                        {detalle.fechaPago ? fechaLegible(detalle.fechaPago) : "Pendiente"}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono-label">{detalle.diasAtraso}</td>
                                      <td className={`px-3 py-2 font-medium ${detalle.estado === "Vencido" ? "text-destructive" : "text-emerald-700"}`}>
                                        {detalle.estado}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verPopupPagos, setVerPopupPagos] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState<DashboardPanel | null>(null);

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

  const pagosHoy = data?.resumen?.pagosVencenHoy;
  useEffect(() => {
    if (pagosHoy && pagosHoy.length > 0) {
      setVerPopupPagos(true);
    }
  }, [pagosHoy]);

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
              <StatCard
                key={s.label}
                s={s}
                r={resumen!}
                onOpen={() => {
                  const paneles: Partial<Record<keyof Resumen, DashboardPanel>> = {
                    unidadesTotales: "unidades",
                    morosidad: "morosidad",
                    ocupadas: "ocupadas",
                    disponibles: "disponibles",
                    tasaOcupacion: "ocupacion",
                    aPuntoDeFinalizar: "finalizan",
                  };
                  setPanelAbierto(paneles[s.valueKey] ?? null);
                }}
              />
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
                <div>
                  <h3 className="font-headline-md text-primary">Renovación de contratos</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Contratos con vencimiento en los últimos 12 meses</p>
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-center p-5">
                {resumen!.contratosVencidosPeriodo > 0 ? (
                  <DonutChart
                    segments={[
                      { label: "Renovados", value: resumen!.contratosRenovados, color: "rgb(16, 185, 129)" },
                      { label: "No renovados", value: resumen!.contratosVencidosPeriodo - resumen!.contratosRenovados, color: "rgb(251, 146, 60)" },
                    ]}
                    centerLabel="Renovación"
                    centerValue={`${resumen!.tasaRenovacion}%`}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay contratos vencidos en este período.</p>
                )}
              </div>
            </div>

            <div className="col-span-12 flex flex-col rounded-lg bg-surface-container-lowest shadow-sm lg:col-span-6">
              <div className="p-5">
                <h3 className="font-headline-md text-primary">Duración de contratos</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resumen!.duracionMediaContratoDias === null
                    ? "Promedio: sin datos históricos"
                    : `Duración media: ${resumen!.duracionMediaContratoDias} días`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Plazo pactado; contratos resueltos medidos hasta su resolución.</p>
              </div>
              <div className="px-5 pb-5">
                <DistributionBars
                  items={resumen!.duracionContratos}
                  emptyLabel="No hay contratos formalizados para medir."
                />
              </div>
            </div>

            <div className="col-span-12 flex flex-col rounded-lg bg-surface-container-lowest shadow-sm lg:col-span-6">
              <div className="p-5">
                <h3 className="font-headline-md text-primary">Tiempo para volver a alquilar</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resumen!.vacanciaMediaDias === null
                    ? "Promedio histórico: sin períodos libres cerrados"
                    : `Promedio histórico: ${resumen!.vacanciaMediaDias} días · ${resumen!.vacanciasObservadas} períodos`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resumen!.vacanciaActualMediaDias === null
                    ? "Sin departamentos libres con un alquiler previo terminado"
                    : `Actualmente libres: ${resumen!.vacanciaActualMediaDias} días promedio · ${resumen!.departamentosLibresConHistorial} departamentos`}
                </p>
              </div>
              <div className="px-5 pb-5">
                <DistributionBars
                  items={resumen!.distribucionVacancia}
                  emptyLabel="La distribución aparecerá cuando se cierre una vacancia con un nuevo alquiler."
                />
              </div>
            </div>

          </div>
          </>
        )}
      </div>

      {verPopupPagos && data?.resumen?.pagosVencenHoy?.length ? (
        <PagarHoyPopup
          pagos={data.resumen.pagosVencenHoy}
          onCerrar={() => setVerPopupPagos(false)}
        />
      ) : null}
      {panelAbierto === "morosidad" ? <MorosidadPopup onCerrar={() => setPanelAbierto(null)} /> : null}
      {panelAbierto === "unidades" ? <UnidadesTotalesPopup onCerrar={() => setPanelAbierto(null)} /> : null}
      {panelAbierto === "ocupadas" ? <OcupadasPopup onCerrar={() => setPanelAbierto(null)} /> : null}
      {panelAbierto === "disponibles" ? <DisponiblesPopup onCerrar={() => setPanelAbierto(null)} /> : null}
      {panelAbierto === "ocupacion" ? <OcupacionAnualPopup onCerrar={() => setPanelAbierto(null)} /> : null}
      {panelAbierto === "finalizan" ? <FinalizanPopup onCerrar={() => setPanelAbierto(null)} /> : null}
    </DashboardShell>
  );
}