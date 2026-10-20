"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { RefreshCw } from "lucide-react";

interface MesAnual {
  mes: string;
  indice: number;
  etiqueta: string;
  ingresos: number;
  gastos: number;
  utilidad: number;
  entradas: number;
  salidas: number;
  neto: number;
  saldoCaja: number;
}

interface Totales {
  ingresos: number;
  gastos: number;
  utilidad: number;
  entradas: number;
  salidas: number;
  neto: number;
  saldoFinal: number;
}

interface Cierre {
  caja: number;
  cuentasPorCobrar: number;
  otrosActivos: number;
  totalActivo: number;
  pasivos: number;
  totalPasivo: number;
  capital: number;
  resultadoAcumulado: number;
  totalPatrimonio: number;
  totalPasivoPatrimonio: number;
  diferencia: number;
}

interface AnualData {
  anio: number;
  meses: MesAnual[];
  totales: Totales;
  cierre: Cierre;
  previo: { anio: number; totales: Totales; cierre: Cierre } | null;
}

function soles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function corto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(2)} M`;
  if (abs >= 10_000) return `S/ ${(n / 1000).toFixed(1)} k`;
  return soles(n);
}

/** Variación porcentual respecto al año anterior (null si no hay base). */
function variacion(actual: number, previo: number): number | null {
  if (Math.abs(previo) < 0.005) return null;
  return ((actual - previo) / Math.abs(previo)) * 100;
}

function TarjetaKpi({
  label,
  valor,
  previo,
  anio,
  anioPrevio,
}: {
  label: string;
  valor: number;
  previo: number;
  anio: number;
  anioPrevio: number;
}) {
  const v = variacion(valor, previo);
  const sube = valor >= previo;
  return (
    <div className="rounded-lg bg-surface-container-lowest p-4">
      <p className="font-label-md text-on-surface-variant">{label}</p>
      <p className="mt-1 font-headline-md text-on-surface">{soles(valor)}</p>
      <p className="mt-1 font-body-xs text-on-surface-variant">
        {v === null ? (
          <>Sin comparativa con {anioPrevio}</>
        ) : (
          <>
            <span className={sube ? "text-green-700" : "text-red-600"}>
              {v >= 0 ? "+" : ""}
              {v.toFixed(1)}%
            </span>{" "}
            vs {anioPrevio} ({corto(previo)})
          </>
        )}
      </p>
      <p className="font-body-xs text-on-surface-variant">Año {anio}</p>
    </div>
  );
}

function FilaComparativa({
  label,
  actual,
  previo,
  anio,
  anioPrevio,
}: {
  label: string;
  actual: number;
  previo: number;
  anio: number;
  anioPrevio: number;
}) {
  const v = variacion(actual, previo);
  return (
    <tr className="border-t border-outline-variant dark:border-transparent">
      <td className="py-2 pr-4">{label}</td>
      <td className="py-2 text-right font-mono-label">{soles(actual)}</td>
      <td className="py-2 text-right font-mono-label text-on-surface-variant">
        {soles(previo)}
      </td>
      <td className="py-2 text-right font-mono-label">
        {v === null ? (
          <span className="text-on-surface-variant">—</span>
        ) : (
          <span className={v >= 0 ? "text-green-700" : "text-red-600"}>
            {v >= 0 ? "+" : ""}
            {v.toFixed(1)}%
          </span>
        )}
        <span className="ml-2 font-body-xs text-on-surface-variant">
          {anio}/{anioPrevio}
        </span>
      </td>
    </tr>
  );
}

export function AnaliticaAnual() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [data, setData] = useState<AnualData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/contabilidad?anio=${anio}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      setData((await res.json()) as AnualData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [anio]);

  useEffect(() => {
    void load();
  }, [load]);

  const anioPrevio = anio - 1;
  const años = Array.from({ length: 6 }, (_, i) => anioActual - i);
  const t = data?.totales;
  const tp = data?.previo?.totales;
  const cierre = data?.cierre;
  const maxMes = Math.max(
    1,
    ...(data?.meses ?? []).flatMap((m) => [m.ingresos, m.gastos])
  );

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">
              Analíticas contables
            </h2>
            <p className="max-w-2xl font-body-sm text-on-surface-variant">
              Cierre del año contable {anio}: resultado del año, balance a 31 de
              diciembre y comparativa frente al {anioPrevio}.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">
                Año contable
              </label>
              <select
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="h-9 rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              >
                {años.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-outline-variant px-3 font-label-md text-on-surface-variant transition-colors hover:bg-surface-container dark:border-transparent"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </button>
          </div>
        </div>

        {error ? <p className="font-body-sm text-red-600">{error}</p> : null}

        {loading ? (
          <div className="flex items-center gap-3 font-body-sm text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Analizando el año {anio}…
          </div>
        ) : data && t && tp && cierre ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TarjetaKpi
                label="Ingresos del año"
                valor={t.ingresos}
                previo={tp.ingresos}
                anio={anio}
                anioPrevio={anioPrevio}
              />
              <TarjetaKpi
                label="Gastos del año"
                valor={t.gastos}
                previo={tp.gastos}
                anio={anio}
                anioPrevio={anioPrevio}
              />
              <TarjetaKpi
                label="Utilidad neta"
                valor={t.utilidad}
                previo={tp.utilidad}
                anio={anio}
                anioPrevio={anioPrevio}
              />
              <TarjetaKpi
                label="Flujo neto de caja"
                valor={t.neto}
                previo={tp.neto}
                anio={anio}
                anioPrevio={anioPrevio}
              />
            </div>

            <section className="rounded-lg bg-surface-container-lowest p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-headline-md text-on-surface">
                  Cierre del año contable · 31 de diciembre {anio}
                </h3>
                <p className="font-body-xs text-on-surface-variant">
                  Saldo final de caja {soles(cierre.caja)}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="mb-1 font-label-md uppercase tracking-wide text-on-surface-variant">
                    Activo
                  </p>
                  <ul className="font-body-sm">
                    <li className="flex justify-between py-1">
                      <span className="text-on-surface-variant">Caja y bancos</span>
                      <span className="font-mono-label">{soles(cierre.caja)}</span>
                    </li>
                    <li className="flex justify-between py-1">
                      <span className="text-on-surface-variant">Cuentas por cobrar</span>
                      <span className="font-mono-label">
                        {soles(cierre.cuentasPorCobrar)}
                      </span>
                    </li>
                    <li className="flex justify-between py-1">
                      <span className="text-on-surface-variant">Otros activos</span>
                      <span className="font-mono-label">{soles(cierre.otrosActivos)}</span>
                    </li>
                    <li className="mt-1 flex justify-between border-t border-outline-variant pt-2 font-semibold dark:border-transparent">
                      <span>Total activo</span>
                      <span className="font-mono-label">{soles(cierre.totalActivo)}</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-label-md uppercase tracking-wide text-on-surface-variant">
                    Pasivo
                  </p>
                  <ul className="font-body-sm">
                    <li className="flex justify-between py-1">
                      <span className="text-on-surface-variant">Deudas registradas</span>
                      <span className="font-mono-label">{soles(cierre.pasivos)}</span>
                    </li>
                    <li className="mt-1 flex justify-between border-t border-outline-variant pt-2 font-semibold dark:border-transparent">
                      <span>Total pasivo</span>
                      <span className="font-mono-label">{soles(cierre.totalPasivo)}</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-label-md uppercase tracking-wide text-on-surface-variant">
                    Patrimonio
                  </p>
                  <ul className="font-body-sm">
                    <li className="flex justify-between py-1">
                      <span className="text-on-surface-variant">Capital</span>
                      <span className="font-mono-label">{soles(cierre.capital)}</span>
                    </li>
                    <li className="flex justify-between py-1">
                      <span className="text-on-surface-variant">Resultados acumulados</span>
                      <span className="font-mono-label">
                        {soles(cierre.resultadoAcumulado)}
                      </span>
                    </li>
                    <li className="mt-1 flex justify-between border-t border-outline-variant pt-2 font-semibold dark:border-transparent">
                      <span>Total patrimonio</span>
                      <span className="font-mono-label">
                        {soles(cierre.totalPatrimonio)}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
              <p className="mt-3 font-body-sm text-on-surface-variant">
                Pasivo + patrimonio:{" "}
                <span className="font-mono-label">{soles(cierre.totalPasivoPatrimonio)}</span>
                {Math.abs(cierre.diferencia) > 0.005 ? (
                  <span className="ml-3 text-red-600">
                    · Diferencia por conciliar:{" "}
                    <span className="font-mono-label">{soles(cierre.diferencia)}</span>
                  </span>
                ) : (
                  <span className="ml-3 text-green-700">· Balance cuadrado</span>
                )}
              </p>
            </section>

            <section className="rounded-lg bg-surface-container-lowest p-5">
              <h3 className="mb-1 font-headline-md text-on-surface">
                Desglose mes a mes · {anio}
              </h3>
              <p className="mb-3 font-body-xs text-on-surface-variant">
                Ingresos y gastos devengados; entradas y salidas en efectivo.
                Saldo de caja acumulado al cierre de cada mes.
              </p>

              <div
                className="mb-4 flex h-40 items-end gap-1.5 border-b border-outline-variant dark:border-transparent"
                role="img"
                aria-label={`Ingresos y gastos por mes del año ${anio}`}
              >
                {data.meses.map((m) => (
                  <div
                    key={m.mes}
                    className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
                    title={`${m.etiqueta}: ingresos ${soles(m.ingresos)} · gastos ${soles(m.gastos)}`}
                  >
                    <div
                      className="w-1/2 max-w-4 rounded-t-sm bg-emerald-600"
                      style={{ height: `${Math.max(2, (m.ingresos / maxMes) * 100)}%` }}
                    />
                    <div
                      className="w-1/2 max-w-4 rounded-t-sm bg-red-500/80"
                      style={{ height: `${Math.max(2, (m.gastos / maxMes) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>

              <div className="mb-3 flex gap-3 font-body-xs text-on-surface-variant">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Ingresos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-500/80" /> Gastos
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] border-collapse font-body-sm">
                  <thead>
                    <tr className="border-b border-outline-variant text-left font-label-md text-on-surface-variant dark:border-transparent">
                      <th className="py-2 pr-4 font-medium">Mes</th>
                      <th className="py-2 pr-4 text-right font-medium">Ingresos</th>
                      <th className="py-2 pr-4 text-right font-medium">Gastos</th>
                      <th className="py-2 pr-4 text-right font-medium">Utilidad</th>
                      <th className="py-2 pr-4 text-right font-medium">Entradas</th>
                      <th className="py-2 pr-4 text-right font-medium">Salidas</th>
                      <th className="py-2 pr-4 text-right font-medium">Flujo neto</th>
                      <th className="py-2 text-right font-medium">Saldo caja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.meses.map((m) => (
                      <tr
                        key={m.mes}
                        className="border-b border-outline-variant/50 last:border-0 dark:border-transparent"
                      >
                        <td className="py-2 pr-4">{m.etiqueta}</td>
                        <td className="py-2 pr-4 text-right font-mono-label">
                          {soles(m.ingresos)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono-label">
                          {soles(m.gastos)}
                        </td>
                        <td
                          className={`py-2 pr-4 text-right font-mono-label ${
                            m.utilidad >= 0 ? "text-green-700" : "text-red-600"
                          }`}
                        >
                          {soles(m.utilidad)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono-label">
                          {soles(m.entradas)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono-label">
                          {soles(m.salidas)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono-label">
                          {soles(m.neto)}
                        </td>
                        <td className="py-2 text-right font-mono-label">
                          {soles(m.saldoCaja)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-outline-variant font-semibold dark:border-transparent">
                      <td className="py-2 pr-4">Total {anio}</td>
                      <td className="py-2 pr-4 text-right font-mono-label">
                        {soles(t.ingresos)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono-label">
                        {soles(t.gastos)}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right font-mono-label ${
                          t.utilidad >= 0 ? "text-green-700" : "text-red-600"
                        }`}
                      >
                        {soles(t.utilidad)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono-label">
                        {soles(t.entradas)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono-label">
                        {soles(t.salidas)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono-label">
                        {soles(t.neto)}
                      </td>
                      <td className="py-2 text-right font-mono-label">
                        {soles(t.saldoFinal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="rounded-lg bg-surface-container-lowest p-5">
              <h3 className="mb-1 font-headline-md text-on-surface">
                Comparativa {anio} vs {anioPrevio}
              </h3>
              <p className="mb-3 font-body-xs text-on-surface-variant">
                Resultado del año y cierre de cada ejercicio contable.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse font-body-sm">
                  <thead>
                    <tr className="border-b border-outline-variant text-left font-label-md text-on-surface-variant dark:border-transparent">
                      <th className="py-2 pr-4 font-medium">Concepto</th>
                      <th className="py-2 pr-4 text-right font-medium">{anio}</th>
                      <th className="py-2 pr-4 text-right font-medium">{anioPrevio}</th>
                      <th className="py-2 text-right font-medium">Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    <FilaComparativa
                      label="Ingresos del año"
                      actual={t.ingresos}
                      previo={tp.ingresos}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Gastos del año"
                      actual={t.gastos}
                      previo={tp.gastos}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Utilidad neta"
                      actual={t.utilidad}
                      previo={tp.utilidad}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Entradas de caja"
                      actual={t.entradas}
                      previo={tp.entradas}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Salidas de caja"
                      actual={t.salidas}
                      previo={tp.salidas}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Flujo neto de caja"
                      actual={t.neto}
                      previo={tp.neto}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Total activo al cierre"
                      actual={cierre.totalActivo}
                      previo={data.previo?.cierre.totalActivo ?? 0}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Total pasivo al cierre"
                      actual={cierre.totalPasivo}
                      previo={data.previo?.cierre.totalPasivo ?? 0}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                    <FilaComparativa
                      label="Patrimonio al cierre"
                      actual={cierre.totalPatrimonio}
                      previo={data.previo?.cierre.totalPatrimonio ?? 0}
                      anio={anio}
                      anioPrevio={anioPrevio}
                    />
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
