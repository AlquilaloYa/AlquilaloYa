"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { CobranzaVendedores } from "@/components/cobranza-vendedores";
import { CobranzaServiciosExtras } from "@/components/cobranza-servicios-extras";
import { apiFetch } from "@/lib/api";
import { addMonths, localDateStr, parseLocalDate } from "@/lib/cronograma";

type PaymentVoucher = { nombre: string; url: string; monto?: number };

type PaymentRow = {
  id: string;
  contractId: string;
  periodo: string;
  monto: string;
  mantenimiento: string;
  penalidad?: string;
  montoPagado?: string;
  diasIndulgencia?: number;
  estado: string;
  fechaPago: string | null;
  voucherNombre: string | null;
  vouchers?: PaymentVoucher[];
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
  personaPago?: string | null;
};

const COBRADORES = ["miguel", "emely", "evelin", "evelyn"] as const;

function esCobrador(persona: string | null | undefined): boolean {
  const valor = (persona ?? "").trim().toLowerCase();
  return COBRADORES.some((nombre) => valor.startsWith(nombre));
}

type ServicioExtraRow = {
  contractId: string;
  incluyeInternet: boolean;
  incluyeCargaElectrica: boolean;
  montoInternet: string;
  montoCargaElectrica: string;
};

type CuotaFila = {
  contrato: ContractRow;
  periodo: string;
  periodoFecha: Date;
  total: number;
  internet: number;
  luzEx: number;
  extras: number;
  montoPagado: number;
  saldo: number;
  estadoPago: "PAGADO" | "PARCIAL" | "PENDIENTE" | "VENCIDO" | "FINALIZADO";
  diasMora: number;
  penalidad: number;
  indulgencia: number;
  pago: PaymentRow | null;
};

const MOROSIDAD_DIARIA = 70; // S/ 70 por cada día de atraso (cláusula contrato)
const penalidadPorDias = (diasMora: number, penalidadGuardada?: string | null) => {
  if (diasMora <= 0) return 0;
  return penalidadGuardada == null
    ? MOROSIDAD_DIARIA * diasMora
    : Math.max(Number(penalidadGuardada), MOROSIDAD_DIARIA * diasMora);
};

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "PENDIENTE", label: "Pendientes" },
  { key: "PARCIAL", label: "Parciales" },
  { key: "VENCIDO", label: "Vencidos" },
  { key: "PAGADO", label: "Pagados" },
  { key: "SERVICIOS_EXTRAS", label: "Servicios extras" },
] as const;

function esJpeg(nombre: string, dataUrl: string): boolean {
  return /\.(jpe?g)$/i.test(nombre) || dataUrl.startsWith("data:image/jpeg");
}

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

const moneda = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN" });

type AbonoModo = "PARCIAL" | "TOTAL";

function AbonoModal({
  fila,
  modo,
  onClose,
  onSaved,
}: {
  fila: CuotaFila;
  modo: AbonoModo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [monto, setMonto] = useState(fila.saldo > 0 ? fila.saldo.toFixed(2) : "");
  const [voucher, setVoucher] = useState<{ nombre: string; dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const montoNum = modo === "TOTAL" ? fila.saldo : Number(monto);

  function leerArchivo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!esJpeg(file.name, `data:${file.type}`) && !file.name.toLowerCase().endsWith(".jpg")) {
      setError("El baucher debe ser una imagen JPEG (.jpg).");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setVoucher({ nombre: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function confirmar() {
    if (!voucher) {
      setError("Adjunta el baucher del pago (imagen JPEG).");
      return;
    }
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError("Ingresa el monto abonado en el baucher.");
      return;
    }
    if (montoNum > fila.saldo + 0.001) {
      setError(`El monto no puede superar el saldo pendiente (${moneda(fila.saldo)}).`);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const existentes: PaymentVoucher[] = (fila.pago?.vouchers ?? []).map((v) => ({
        nombre: v.nombre,
        url: v.url,
        ...(typeof v.monto === "number" ? { monto: v.monto } : {}),
      }));
      const vouchers = [...existentes, { nombre: voucher.nombre, url: voucher.dataUrl, monto: montoNum }];
      const payload = {
        id: fila.pago?.id,
        contractId: fila.contrato.id,
        periodo: fila.periodo,
        monto: fila.contrato.montoCanonMensual,
        mantenimiento: fila.contrato.mantenimiento ?? "50",
        vouchers,
      };
      const res = fila.pago
        ? await apiFetch("/api/payments", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `Error ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-xl">
        <h3 className="font-headline-md text-on-surface">
          {modo === "TOTAL" ? "Pago total" : "Pago parcial"}
        </h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          {fila.contrato.codigoContrato} · {fila.periodoFecha.toLocaleDateString("es-PE")}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Total mes</dt>
            <dd className="font-semibold">{moneda(fila.total)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Abonado</dt>
            <dd className="font-semibold">{moneda(fila.montoPagado)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Saldo</dt>
            <dd className="font-semibold text-destructive">{moneda(fila.saldo)}</dd>
          </div>
        </dl>

        <label className="mt-4 block text-sm">
          <span className="text-on-surface-variant">Monto abonado (S/)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={modo === "TOTAL" ? fila.saldo.toFixed(2) : monto}
            disabled={modo === "TOTAL"}
            onChange={(e) => setMonto(e.target.value)}
            className="mt-1 w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none disabled:bg-surface-container disabled:text-on-surface-variant"
          />
          {modo === "TOTAL" ? (
            <span className="mt-1 block text-xs text-on-surface-variant">
              Se abonará el saldo pendiente: el pago queda cancelado o completa el parcial.
            </span>
          ) : null}
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-on-surface-variant">Baucher (JPEG)</span>
          <input
            type="file"
            accept="image/jpeg"
            onChange={(e) => {
              leerArchivo(e.target.files);
              e.target.value = "";
            }}
            className="mt-1 block w-full text-sm text-on-surface-variant file:mr-3 file:rounded file:border file:border-outline-variant file:bg-surface-container file:px-3 file:py-1.5 file:text-sm file:text-on-surface"
          />
          {voucher ? (
            <span className="mt-1 block text-xs text-on-surface-variant">{voucher.nombre}</span>
          ) : null}
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="rounded border border-outline-variant px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={guardando}
            className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar abono"}
          </button>
        </div>
      </div>
    </div>
  );
}

type MoraGrupo = {
  clienteId: string;
  nombre: string;
  total: number;
  diasMora: number;
  contratos: { codigoContrato: string; departamento: string; total: number }[];
};

function MoraModal({
  grupos,
  onClose,
}: {
  grupos: MoraGrupo[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/50 p-4">
          <div>
            <h3 className="font-headline-md text-on-surface">Clientes en mora</h3>
            <p className="text-sm text-on-surface-variant">
              {grupos.length} {grupos.length === 1 ? "cliente" : "clientes"} · cuota del
              mes vencida
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {grupos.length === 0 ? (
            <p className="p-8 text-center text-sm text-on-surface-variant">
              No hay clientes en mora.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {grupos.map((grupo) => (
                <li key={grupo.clienteId} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/contratos/clientes/${grupo.clienteId}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {grupo.nombre}
                    </Link>
                    <span className="shrink-0 font-semibold text-destructive">
                      {moneda(grupo.total)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    {grupo.diasMora} {grupo.diasMora === 1 ? "día" : "días"} de mora
                  </p>
                  <ul className="mt-2 space-y-1">
                    {grupo.contratos.map((contrato) => (
                      <li
                        key={contrato.codigoContrato}
                        className="flex justify-between gap-2 text-xs text-on-surface-variant"
                      >
                        <span>
                          {contrato.codigoContrato}
                          {contrato.departamento ? ` · ${contrato.departamento}` : ""}
                        </span>
                        <span>{moneda(contrato.total)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PagosPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [serviciosExtras, setServiciosExtras] = useState<ServicioExtraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [busqueda, setBusqueda] = useState("");
  const [abono, setAbono] = useState<{ fila: CuotaFila; modo: AbonoModo } | null>(null);
  const [mora, setMora] = useState(false);
  const [sortKey, setSortKey] = useState<"cuota" | "contrato" | "cliente" | "departamento" | "total" | "internet" | "luzEx" | "extras" | "estado" | "morosidad" | "penalidad" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, ps, ss] = await Promise.all([
        apiFetch("/api/contracts").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/payments").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/servicios-extras").then((r) => (r.ok ? r.json() : [])),
      ]);
      setContracts(cs as ContractRow[]);
      setPayments(ps as PaymentRow[]);
      setServiciosExtras(ss as ServicioExtraRow[]);
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

  const serviciosPorContrato = useMemo(() => {
    const map = new Map<string, ServicioExtraRow>();
    for (const s of serviciosExtras) {
      if (!map.has(s.contractId)) map.set(s.contractId, s);
    }
    return map;
  }, [serviciosExtras]);

  const filas = useMemo<CuotaFila[]>(() => {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    const out: CuotaFila[] = [];
    for (const c of contracts) {
      if (c.estado === "CANCELADO" || c.estado === "RESUELTO") continue;
      const servicio = serviciosPorContrato.get(c.id);
      const internet = servicio?.incluyeInternet ? Number(servicio.montoInternet ?? 0) : 0;
      const luzEx = servicio?.incluyeCargaElectrica
        ? Number(servicio.montoCargaElectrica ?? 0)
        : 0;
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
          internet,
          luzEx,
          extras: internet + luzEx,
          montoPagado: 0,
          saldo: 0,
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
      const montoPagado = Math.max(0, Number(pago?.montoPagado ?? 0) || 0);
      const saldo = Math.max(0, total - montoPagado);
      const parcialActivo = !pagado && montoPagado > 0 && saldo > 0.001;
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
        : parcialActivo
          ? "PARCIAL"
          : vencimiento.getTime() < inicioDia
            ? "VENCIDO"
            : "PENDIENTE";
      out.push({
        contrato: c,
        periodo: pStr,
        periodoFecha: cuota,
        total,
        internet,
        luzEx,
        extras: internet + luzEx,
        montoPagado,
        saldo,
        estadoPago,
        diasMora,
        penalidad: penalidadPorDias(diasMora, pago?.penalidad),
        indulgencia,
        pago,
      });
    }
    return out.sort((a, b) => b.diasMora - a.diasMora || a.periodo.localeCompare(b.periodo));
  }, [contracts, payments, serviciosPorContrato]);

  const ESTADO_META_LOCAL: Record<string, string> = {
    PAGADO: "Pagado",
    PARCIAL: "Parcial",
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
      internet: (f) => f.internet,
      luzEx: (f) => f.luzEx,
      extras: (f) => f.extras,
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

  const gananciasEsperadas = useMemo(
    () =>
      filas
        .filter(
          (f) =>
            f.estadoPago !== "FINALIZADO" &&
            esCobrador(f.contrato.personaPago) &&
            f.periodoFecha.getTime() >=
              parseLocalDate(f.contrato.fechaInicio).getTime()
        )
        .reduce((s, f) => s + Number(f.contrato.montoCanonMensual ?? 0), 0),
    [filas]
  );

  const moraGrupos = useMemo<MoraGrupo[]>(() => {
    const map = new Map<string, MoraGrupo>();
    for (const f of filas) {
      if (f.estadoPago !== "VENCIDO") continue;
      const clienteId = f.contrato.clienteId;
      const grupo = map.get(clienteId) ?? {
        clienteId,
        nombre:
          [f.contrato.clienteNombre, f.contrato.apellidoCliente]
            .filter(Boolean)
            .join(" ") || "Cliente sin nombre",
        total: 0,
        diasMora: 0,
        contratos: [],
      };
      grupo.total += f.total;
      grupo.diasMora = Math.max(grupo.diasMora, f.diasMora);
      grupo.contratos.push({
        codigoContrato: f.contrato.codigoContrato,
        departamento: f.contrato.departamentoNombre,
        total: f.total,
      });
      map.set(clienteId, grupo);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filas]);

  const ESTADO_META: Record<string, { label: string; cls: string }> = {
    PAGADO: { label: "Pagado", cls: "bg-emerald-600" },
    PARCIAL: { label: "Parcial", cls: "bg-amber-500" },
    PENDIENTE: { label: "Pendiente", cls: "bg-outline" },
    VENCIDO: { label: "Vencido", cls: "bg-destructive" },
    FINALIZADO: { label: "Finalizado", cls: "bg-muted-foreground" },
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="font-headline-lg text-on-surface">Cobranza</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          <button
            type="button"
            onClick={() => setMora(true)}
            className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-left transition-colors hover:border-destructive/50 hover:bg-surface-container"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wider text-on-surface-variant">
                Clientes en mora
              </span>
              <span className="text-xs font-medium text-primary">Ver detalle</span>
            </div>
            <div className="mt-1 font-headline-md text-on-surface">
              {moraGrupos.length}
            </div>
          </button>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="text-xs uppercase tracking-wider text-on-surface-variant">
              Ganancias esperadas
            </div>
            <div className="mt-1 font-headline-md text-emerald-600">
              {moneda(gananciasEsperadas)}
            </div>
            <div className="mt-0.5 text-xs text-on-surface-variant">
              Canon del mes · Miguel, Emely y Evelyn
            </div>
          </div>
        </div>

        <CobranzaVendedores />

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

        {filter === "SERVICIOS_EXTRAS" ? (
          <CobranzaServiciosExtras />
        ) : loading ? (
          <p className="text-on-surface-variant">Cargando cobranza…</p>
        ) : (
          <TableScroll
            className="w-full rounded-lg border border-outline-variant"
            contentClassName="max-h-[32rem]"
          >
            <table className="w-full min-w-[1180px] text-left text-sm">
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
                  <th onClick={() => cambiarOrden("internet")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "internet" ? "font-semibold text-on-surface" : "")}>
                    Internet{sortKey === "internet" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("luzEx")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "luzEx" ? "font-semibold text-on-surface" : "")}>
                    Luz-Ex{sortKey === "luzEx" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("extras")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "extras" ? "font-semibold text-on-surface" : "")}>
                    Servicios extras{sortKey === "extras" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
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
                      <td className="whitespace-nowrap px-3 py-2">
                        {f.internet > 0 ? moneda(f.internet) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {f.luzEx > 0 ? moneda(f.luzEx) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {f.extras > 0 ? moneda(f.extras) : "—"}
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
                          <div className="flex flex-col items-start gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setAbono({ fila: f, modo: "PARCIAL" })}
                                disabled={f.total <= 0}
                                className="rounded border border-outline-variant px-2 py-1 text-xs text-primary hover:bg-surface-container disabled:opacity-40"
                              >
                                Pago parcial
                              </button>
                              <button
                                type="button"
                                onClick={() => setAbono({ fila: f, modo: "TOTAL" })}
                                disabled={f.total <= 0}
                                className="rounded bg-primary px-2 py-1 text-xs text-on-primary hover:opacity-90 disabled:opacity-40"
                              >
                                Pago total
                              </button>
                            </div>
                            {f.montoPagado > 0 ? (
                              <span className="text-xs text-on-surface-variant">
                                Abonado {moneda(f.montoPagado)} · saldo {moneda(f.saldo)}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && visibles.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-on-surface-variant">
                      No hay cuotas con este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableScroll>
        )}

        {abono ? (
          <AbonoModal
            fila={abono.fila}
            modo={abono.modo}
            onClose={() => setAbono(null)}
            onSaved={() => {
              setAbono(null);
              void load();
            }}
          />
        ) : null}

        {mora ? (
          <MoraModal grupos={moraGrupos} onClose={() => setMora(false)} />
        ) : null}
      </div>
    </DashboardShell>
  );
}
