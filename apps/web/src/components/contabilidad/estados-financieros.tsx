"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

type Seccion = "RESULTADOS" | "FLUJO" | "BALANCE";

interface Ajuste {
  id: string;
  periodo: string;
  estado: Seccion;
  grupo: string;
  etiqueta: string;
  monto: number;
  nota: string;
}

interface ContabilidadData {
  periodo: string;
  resultados: {
    ingresos: number;
    gastos: number;
    ingresosERP: number;
    gastosERP: number;
  };
  flujo: {
    entradas: number;
    salidas: number;
    entradasERP: number;
    salidasERP: number;
    saldoInicial: number;
    neto: number;
    saldoFinal: number;
  };
  balance: {
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
  };
  ajustes: Ajuste[];
}

const TITULOS: Record<Seccion, { titulo: string; descripcion: string }> = {
  BALANCE: {
    titulo: "Balance General",
    descripcion:
      "Situación financiera al cierre del mes. Caja y cuentas por cobrar se calculan desde la cobranza; los demás saldos se cargan a mano.",
  },
  RESULTADOS: {
    titulo: "Estado de Resultados",
    descripcion:
      "Ingresos y gastos devengados del mes. La cobranza y los materiales se toman del ERP; puedes añadir otras líneas manualmente.",
  },
  FLUJO: {
    titulo: "Estado de Flujo de Efectivo",
    descripcion:
      "Movimiento de caja del mes. Los cobros se reconocen por fecha de pago; las salidas por fecha de la orden. Admite ajustes manuales.",
  },
};

const GRUPOS_POR_SECCION: Record<Seccion, { value: string; label: string }[]> = {
  RESULTADOS: [
    { value: "INGRESO", label: "Ingreso" },
    { value: "GASTO", label: "Gasto" },
  ],
  FLUJO: [
    { value: "ENTRADA", label: "Entrada" },
    { value: "SALIDA", label: "Salida" },
  ],
  BALANCE: [
    { value: "ACTIVO", label: "Activo" },
    { value: "PASIVO", label: "Pasivo" },
    { value: "PATRIMONIO", label: "Patrimonio" },
  ],
};

function soles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function FilaTotal({ label, valor }: { label: string; valor: number }) {
  return (
    <tr className="border-t border-outline-variant font-semibold dark:border-transparent">
      <td className="py-2 pr-4">{label}</td>
      <td className="py-2 text-right font-mono-label">{soles(valor)}</td>
    </tr>
  );
}

function FilaDato({ label, valor }: { label: string; valor: number }) {
  return (
    <tr className="text-on-surface-variant">
      <td className="py-1.5 pr-4">{label}</td>
      <td className="py-1.5 text-right font-mono-label">{soles(valor)}</td>
    </tr>
  );
}

function FilaAjuste({
  ajuste,
  onDelete,
}: {
  ajuste: Ajuste;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="text-on-surface">
      <td className="py-1.5 pr-4">
        {ajuste.etiqueta}
        <span className="ml-2 rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-on-surface-variant">
          manual
        </span>
        {ajuste.nota ? (
          <span className="ml-2 text-xs text-on-surface-variant">· {ajuste.nota}</span>
        ) : null}
      </td>
      <td className="py-1.5 text-right font-mono-label">
        <span className="inline-flex items-center gap-2">
          {soles(ajuste.monto)}
          <button
            type="button"
            onClick={() => onDelete(ajuste.id)}
            className="text-on-surface-variant transition-colors hover:text-red-600"
            title="Eliminar ajuste"
            aria-label="Eliminar ajuste"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </td>
    </tr>
  );
}

export function EstadosFinancieros({ seccion }: { seccion: Seccion }) {
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState<ContabilidadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [nuevoGrupo, setNuevoGrupo] = useState(GRUPOS_POR_SECCION[seccion][0]!.value);
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [guardando, setGuardando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/contabilidad?periodo=${mes}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      setData((await res.json()) as ContabilidadData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mes]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setNuevoGrupo(GRUPOS_POR_SECCION[seccion][0]!.value);
  }, [seccion]);

  const ajustesSeccion = useMemo(
    () => (data?.ajustes ?? []).filter((a) => a.estado === seccion),
    [data, seccion]
  );

  const grupos = GRUPOS_POR_SECCION[seccion];

  async function agregarAjuste() {
    const etiqueta = nuevaEtiqueta.trim();
    const monto = Number(nuevoMonto);
    if (!etiqueta || !Number.isFinite(monto) || monto <= 0) {
      setError("Completa la etiqueta y un monto mayor a 0");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await apiFetch("/api/contabilidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo: mes,
          estado: seccion,
          grupo: nuevoGrupo,
          etiqueta,
          monto,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo guardar el ajuste");
      }
      setNuevaEtiqueta("");
      setNuevoMonto("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarAjuste(id: string) {
    try {
      const res = await apiFetch(`/api/contabilidad?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "No se pudo eliminar el ajuste");
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const ajustesDe = (grupo: string) => ajustesSeccion.filter((a) => a.grupo === grupo);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">{TITULOS[seccion].titulo}</h2>
            <p className="max-w-2xl font-body-sm text-on-surface-variant">
              {TITULOS[seccion].descripcion}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block font-label-md text-on-surface-variant">Periodo</label>
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value || mesActual())}
                className="h-9 rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
              />
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
            Calculando…
          </div>
        ) : data ? (
          <>
            <div className="rounded-lg bg-surface-container-lowest p-6">
              <table className="w-full border-collapse font-body-md">
                <tbody>
                  {seccion === "RESULTADOS" ? (
                    <>
                      <tr className="font-semibold text-on-surface">
                        <td className="pb-1 pr-4" colSpan={2}>
                          Ingresos
                        </td>
                      </tr>
                      <FilaDato label="Cobranza devengada del mes (ERP)" valor={data.resultados.ingresosERP} />
                      {ajustesDe("INGRESO").map((a) => (
                        <FilaAjuste key={a.id} ajuste={a} onDelete={eliminarAjuste} />
                      ))}
                      <FilaTotal label="Total ingresos" valor={data.resultados.ingresos} />

                      <tr className="font-semibold text-on-surface">
                        <td className="pb-1 pt-5 pr-4" colSpan={2}>
                          Gastos
                        </td>
                      </tr>
                      <FilaDato label="Materiales de órdenes de trabajo (ERP)" valor={data.resultados.gastosERP} />
                      {ajustesDe("GASTO").map((a) => (
                        <FilaAjuste key={a.id} ajuste={a} onDelete={eliminarAjuste} />
                      ))}
                      <FilaTotal label="Total gastos" valor={data.resultados.gastos} />

                      <FilaTotal
                        label={
                          data.resultados.ingresos - data.resultados.gastos >= 0
                            ? "Utilidad del mes"
                            : "Pérdida del mes"
                        }
                        valor={data.resultados.ingresos - data.resultados.gastos}
                      />
                    </>
                  ) : null}

                  {seccion === "FLUJO" ? (
                    <>
                      <FilaTotal label="Saldo inicial de caja" valor={data.flujo.saldoInicial} />

                      <tr className="font-semibold text-on-surface">
                        <td className="pb-1 pt-5 pr-4" colSpan={2}>
                          Entradas
                        </td>
                      </tr>
                      <FilaDato label="Cobros registrados en el mes (ERP)" valor={data.flujo.entradasERP} />
                      {ajustesDe("ENTRADA").map((a) => (
                        <FilaAjuste key={a.id} ajuste={a} onDelete={eliminarAjuste} />
                      ))}
                      <FilaTotal label="Total entradas" valor={data.flujo.entradas} />

                      <tr className="font-semibold text-on-surface">
                        <td className="pb-1 pt-5 pr-4" colSpan={2}>
                          Salidas
                        </td>
                      </tr>
                      <FilaDato label="Materiales de órdenes de trabajo (ERP)" valor={data.flujo.salidasERP} />
                      {ajustesDe("SALIDA").map((a) => (
                        <FilaAjuste key={a.id} ajuste={a} onDelete={eliminarAjuste} />
                      ))}
                      <FilaTotal label="Total salidas" valor={data.flujo.salidas} />

                      <FilaTotal label="Flujo neto del mes" valor={data.flujo.neto} />
                      <FilaTotal label="Saldo final de caja" valor={data.flujo.saldoFinal} />
                    </>
                  ) : null}

                  {seccion === "BALANCE" ? (
                    <>
                      <tr className="font-semibold text-on-surface">
                        <td className="pb-1 pr-4" colSpan={2}>
                          Activo
                        </td>
                      </tr>
                      <FilaDato label="Caja y bancos" valor={data.balance.caja} />
                      <FilaDato label="Cuentas por cobrar" valor={data.balance.cuentasPorCobrar} />
                      {ajustesDe("ACTIVO").map((a) => (
                        <FilaAjuste key={a.id} ajuste={a} onDelete={eliminarAjuste} />
                      ))}
                      <FilaTotal label="Total activo" valor={data.balance.totalActivo} />

                      <tr className="font-semibold text-on-surface">
                        <td className="pb-1 pt-5 pr-4" colSpan={2}>
                          Pasivo
                        </td>
                      </tr>
                      {ajustesDe("PASIVO").length === 0 ? (
                        <FilaDato label="Sin pasivos registrados" valor={0} />
                      ) : null}
                      {ajustesDe("PASIVO").map((a) => (
                        <FilaAjuste key={a.id} ajuste={a} onDelete={eliminarAjuste} />
                      ))}
                      <FilaTotal label="Total pasivo" valor={data.balance.totalPasivo} />

                      <tr className="font-semibold text-on-surface">
                        <td className="pb-1 pt-5 pr-4" colSpan={2}>
                          Patrimonio
                        </td>
                      </tr>
                      <FilaDato label="Capital" valor={data.balance.capital} />
                      <FilaDato label="Resultados acumulados" valor={data.balance.resultadoAcumulado} />
                      <FilaTotal label="Total patrimonio" valor={data.balance.totalPatrimonio} />

                      <FilaTotal
                        label="Total pasivo + patrimonio"
                        valor={data.balance.totalPasivoPatrimonio}
                      />
                      {Math.abs(data.balance.diferencia) > 0.005 ? (
                        <FilaTotal label="Diferencia por conciliar" valor={data.balance.diferencia} />
                      ) : null}
                    </>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-surface-container-lowest p-5">
              <h3 className="mb-3 font-headline-md text-on-surface">Añadir línea manual</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem_auto]">
                <input
                  value={nuevaEtiqueta}
                  onChange={(e) => setNuevaEtiqueta(e.target.value)}
                  placeholder="Descripción (p. ej. Alquiler de oficina)"
                  className="h-9 rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
                />
                <select
                  value={nuevoGrupo}
                  onChange={(e) => setNuevoGrupo(e.target.value)}
                  className="h-9 rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
                >
                  {grupos.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevoMonto}
                  onChange={(e) => setNuevoMonto(e.target.value)}
                  placeholder="Monto"
                  className="h-9 rounded border border-outline-variant bg-transparent px-2 font-body-md text-on-surface"
                />
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void agregarAjuste()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-label-md text-on-primary disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  Añadir
                </button>
              </div>
              <p className="mt-2 font-body-xs text-on-surface-variant">
                {seccion === "BALANCE"
                  ? "Los saldos manuales del Balance se acumulan mes a mes (naturaleza de saldo)."
                  : "Las líneas manuales de este estado corresponden solo al mes seleccionado."}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
