"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { apiFetch } from "@/lib/api";
import { addMonths, localDateStr, parseLocalDate } from "@/lib/cronograma";

type PaymentRow = {
  id: string;
  contractId: string;
  periodo: string;
  monto: string;
  mantenimiento: string;
  penalidad?: string;
  diasIndulgencia?: number;
  estado: string;
  fechaPago: string | null;
  voucherNombre: string | null;
};

type ContractRow = {
  id: string;
  codigoContrato: string;
  clienteId: string;
  clienteNombre: string;
  apellidoCliente: string;
  departamentoNombre: string;
  montoCanonMensual: string;
  mantenimiento?: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
};

type CuotaFila = {
  contrato: ContractRow;
  periodo: string;
  periodoFecha: Date;
  total: number;
  estadoPago: "PAGADO" | "PENDIENTE" | "VENCIDO" | "FINALIZADO";
  diasMora: number;
  penalidad: number;
  indulgencia: number;
  pago: PaymentRow | null;
};

const MOROSIDAD = 70;

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "PENDIENTE", label: "Pendientes" },
  { key: "VENCIDO", label: "Vencidos" },
  { key: "PAGADO", label: "Pagados" },
] as const;

function InputIndulgencia({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (dias: number) => void;
}) {
  const [texto, setTexto] = useState(String(value));

  useEffect(() => {
    setTexto(String(value));
  }, [value]);

  function commit() {
    const n = Math.max(0, Math.floor(Number(texto) || 0));
    setTexto(String(n));
    if (n !== value) onCommit(n);
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="0"
      title="Período de indulgencia (días de prórroga)"
      className="w-20 rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-center text-sm text-on-surface focus:border-primary focus:outline-none"
    />
  );
}

export default function PagosPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [busqueda, setBusqueda] = useState("");
  const [sortKey, setSortKey] = useState<"cuota" | "contrato" | "cliente" | "departamento" | "total" | "estado" | "morosidad" | "penalidad" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, ps] = await Promise.all([
        apiFetch("/api/contracts").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/payments").then((r) => (r.ok ? r.json() : [])),
      ]);
      setContracts(cs as ContractRow[]);
      setPayments(ps as PaymentRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const guardarIndulgencia = useCallback(
    async (f: CuotaFila, dias: number) => {
      try {
        if (f.pago) {
          const r = await apiFetch("/api/payments", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: f.pago.id, diasIndulgencia: dias }),
          });
          if (r.ok) {
            setPayments((prev) =>
              prev.map((p) =>
                p.id === f.pago!.id ? { ...p, diasIndulgencia: dias } : p
              )
            );
          } else {
            void load();
          }
        } else {
          const r = await apiFetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contractId: f.contrato.id,
              periodo: f.periodo,
              diasIndulgencia: dias,
            }),
          });
          if (r.ok) {
            const nuevo = await r.json();
            setPayments((prev) => [...prev, nuevo]);
          } else {
            void load();
          }
        }
      } catch {
        void load();
      }
    },
    [load]
  );

  const filas = useMemo<CuotaFila[]>(() => {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    const out: CuotaFila[] = [];
    for (const c of contracts) {
      if (c.estado === "CANCELADO" || c.estado === "RESUELTO") continue;
      const ini = parseLocalDate(c.fechaInicio);
      const fin = parseLocalDate(c.fechaFin);
      const k =
        (hoy.getFullYear() - ini.getFullYear()) * 12 +
        (hoy.getMonth() - ini.getMonth());
      const cuota = addMonths(ini, k);
      if (cuota.getTime() >= fin.getTime()) {
        out.push({
          contrato: c,
          periodo: localDateStr(fin),
          periodoFecha: fin,
          total: 0,
          estadoPago: "FINALIZADO",
          diasMora: 0,
          penalidad: 0,
          indulgencia: 0,
          pago: null,
        });
        continue;
      }
      const pStr = localDateStr(cuota);
      const pago =
        payments.find(
          (p) => p.contractId === c.id && p.periodo === pStr
        ) ?? null;
      const indulgencia = Math.max(0, Math.floor(Number(pago?.diasIndulgencia ?? 0) || 0));
      const vencimiento = new Date(cuota.getTime() + indulgencia * 86_400_000);
      const pagado = pago?.estado === "PAGADO";
      const total =
        Number(c.montoCanonMensual ?? 0) + Number(c.mantenimiento ?? 50);
      const diasMora = pagado
        ? pago?.fechaPago && pago.fechaPago > localDateStr(vencimiento)
          ? Math.floor(
              (parseLocalDate(pago.fechaPago).getTime() - vencimiento.getTime()) /
                86_400_000
            )
          : 0
        : vencimiento.getTime() < inicioDia
          ? Math.floor((inicioDia - vencimiento.getTime()) / 86_400_000)
          : 0;
      const estadoPago = pagado
        ? "PAGADO"
        : vencimiento.getTime() < inicioDia
          ? "VENCIDO"
          : "PENDIENTE";
      out.push({
        contrato: c,
        periodo: pStr,
        periodoFecha: cuota,
        total,
        estadoPago,
        diasMora,
        penalidad:
          diasMora > 0
            ? pago?.penalidad == null
              ? MOROSIDAD
              : Number(pago.penalidad)
            : 0,
        indulgencia,
        pago,
      });
    }
    return out.sort((a, b) => b.diasMora - a.diasMora || a.periodo.localeCompare(b.periodo));
  }, [contracts, payments]);

  const ESTADO_META_LOCAL: Record<string, string> = {
    PAGADO: "Pagado",
    PENDIENTE: "Pendiente",
    VENCIDO: "Vencido",
    FINALIZADO: "Finalizado",
  };

  const visibles = useMemo(() => {
    let filas2 = filter === "all" ? filas : filas.filter((f) => f.estadoPago === filter);
    filas2 = filtrarFilas(filas2, busqueda, (f) => [
      f.periodo,
      f.contrato.codigoContrato,
      f.contrato.clienteNombre,
      f.contrato.apellidoCliente,
      f.contrato.departamentoNombre,
      ESTADO_META_LOCAL[f.estadoPago],
    ]);
    const valoradores: Record<string, (f: CuotaFila) => string | number | null | undefined> = {
      cuota: (f) => f.periodo,
      contrato: (f) => f.contrato.codigoContrato,
      cliente: (f) => [f.contrato.clienteNombre, f.contrato.apellidoCliente].filter(Boolean).join(" "),
      departamento: (f) => f.contrato.departamentoNombre,
      total: (f) => f.total,
      estado: (f) => f.estadoPago,
      morosidad: (f) => f.diasMora,
      penalidad: (f) => f.penalidad,
    };
    if (sortKey) {
      filas2 = ordenarColumna(filas2, sortKey, sortDir, valoradores[sortKey]!);
    }
    return filas2;
  }, [filas, filter, busqueda, sortKey, sortDir]);

  function cambiarOrden(clave: typeof sortKey) {
    if (sortKey === clave) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(clave);
      setSortDir("asc");
    }
  }

  const resumen = useMemo(() => {
    const mesActual = new Date();
    const prefijo = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, "0")}`;
    const recaudado = payments
      .filter((p) => p.estado === "PAGADO" && p.periodo.startsWith(prefijo))
      .reduce((s, p) => s + Number(p.monto) + Number(p.mantenimiento), 0);
    const vencido = filas
      .filter((f) => f.estadoPago === "VENCIDO")
      .reduce((s, f) => s + f.total, 0);
    const penalidades = filas.reduce((s, f) => s + f.penalidad, 0);
    const morosos = filas.filter((f) => f.estadoPago === "VENCIDO").length;
    return { recaudado, vencido, penalidades, morosos };
  }, [filas, payments]);

  const moneda = (n: number) =>
    n.toLocaleString("es-PE", { style: "currency", currency: "PEN" });

  const ESTADO_META: Record<string, { label: string; cls: string }> = {
    PAGADO: { label: "Pagado", cls: "bg-emerald-600" },
    PENDIENTE: { label: "Pendiente", cls: "bg-outline" },
    VENCIDO: { label: "Vencido", cls: "bg-destructive" },
    FINALIZADO: { label: "Finalizado", cls: "bg-muted-foreground" },
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="font-headline-lg text-on-surface">Cobranza</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="text-xs uppercase tracking-wider text-on-surface-variant">
              Recaudado del mes
            </div>
            <div className="mt-1 font-headline-md text-emerald-600">
              {moneda(resumen.recaudado)}
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="text-xs uppercase tracking-wider text-on-surface-variant">
              Por cobrar (vencido)
            </div>
            <div className="mt-1 font-headline-md text-destructive">
              {moneda(resumen.vencido)}
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="text-xs uppercase tracking-wider text-on-surface-variant">
              Penalidades estimadas
            </div>
            <div className="mt-1 font-headline-md text-tertiary">
              {moneda(resumen.penalidades)}
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="text-xs uppercase tracking-wider text-on-surface-variant">
              Clientes en mora
            </div>
            <div className="mt-1 font-headline-md text-on-surface">
              {resumen.morosos}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  "rounded-full border px-3 py-1 font-label-md transition-colors " +
                  (filter === f.key
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <BusquedaInput value={busqueda} onChange={setBusqueda} placeholder="Buscar cuota…" className="w-72" />
        </div>

        {loading ? (
          <p className="text-on-surface-variant">Cargando cobranza…</p>
        ) : (
          <TableScroll
            className="w-full rounded-lg border border-outline-variant"
            contentClassName="max-h-[32rem]"
          >
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface-container-low text-xs text-on-surface-variant">
                <tr>
                  <th onClick={() => cambiarOrden("cuota")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "cuota" ? "font-semibold text-on-surface" : "")}>
                    Cuota{sortKey === "cuota" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("contrato")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "contrato" ? "font-semibold text-on-surface" : "")}>
                    Contrato{sortKey === "contrato" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("cliente")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "cliente" ? "font-semibold text-on-surface" : "")}>
                    Cliente{sortKey === "cliente" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("departamento")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "departamento" ? "font-semibold text-on-surface" : "")}>
                    Departamento{sortKey === "departamento" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("total")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "total" ? "font-semibold text-on-surface" : "")}>
                    Total mes{sortKey === "total" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("estado")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "estado" ? "font-semibold text-on-surface" : "")}>
                    Estado{sortKey === "estado" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="px-3 py-2 font-medium" title="Período de indulgencia">
                    Indulgencia
                  </th>
                  <th onClick={() => cambiarOrden("morosidad")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "morosidad" ? "font-semibold text-on-surface" : "")}>
                    Morosidad{sortKey === "morosidad" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("penalidad")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "penalidad" ? "font-semibold text-on-surface" : "")}>
                    Penalidad{sortKey === "penalidad" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="px-3 py-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const meta = ESTADO_META[f.estadoPago] ?? ESTADO_META.PENDIENTE!;
                  return (
                    <tr
                      key={f.contrato.id + f.periodo}
                      className="border-t border-outline-variant/50"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {f.periodoFecha.toLocaleDateString("es-PE")}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/contratos/${f.contrato.id}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {f.contrato.codigoContrato}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/contratos/clientes/${f.contrato.clienteId}`}
                          className="block font-semibold text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                        >
                          {f.contrato.clienteNombre}
                        </Link>
                        {f.contrato.apellidoCliente ? (
                          <span className="block text-xs text-on-surface-variant">
                            {f.contrato.apellidoCliente}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-on-surface-variant">
                        {f.contrato.departamentoNombre}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {moneda(f.total)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 font-label-md">
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.cls}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {f.estadoPago === "PAGADO" || f.estadoPago === "FINALIZADO" ? (
                          <span className="text-sm text-on-surface-variant">
                            {f.indulgencia > 0 ? `${f.indulgencia} d` : "—"}
                          </span>
                        ) : (
                          <InputIndulgencia
                            value={f.indulgencia}
                            onCommit={(dias) => void guardarIndulgencia(f, dias)}
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {f.diasMora > 0 ? `${f.diasMora} d` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {f.penalidad > 0 ? moneda(f.penalidad) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {f.estadoPago === "PAGADO" ? (
                          <span className="text-xs text-on-surface-variant">
                            {f.pago?.fechaPago ?? "—"}
                          </span>
                        ) : (
                          <Link
                            href={`/contratos/clientes/${f.contrato.clienteId}`}
                            className="rounded bg-primary px-2 py-1 text-xs text-on-primary hover:opacity-90"
                          >
                            Registrar pago
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && visibles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-on-surface-variant">
                      No hay cuotas con este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    </DashboardShell>
  );
}
