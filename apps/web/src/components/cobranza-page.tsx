"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, ShieldCheck, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { PaymentVerificationDialog } from "@/components/payment-verification-dialog";
import { CobranzaVendedores } from "@/components/cobranza-vendedores";
import { CobranzaServiciosExtras } from "@/components/cobranza-servicios-extras";
import { CobranzaDiasExtras } from "@/components/cobranza-dias-extras";
import { LocalUtilityReceiptsDialog } from "@/components/locales/local-utility-receipts-dialog";
import { apiFetch } from "@/lib/api";
import {
  addMonths,
  DIAS_PRORROGA_POR_DEFECTO,
  localDateStr,
  parseLocalDate,
} from "@/lib/cronograma";
import { compressImageFile, fileToDataUrl } from "@/lib/image-compression";
import { calcularImpuestoRenta } from "@/lib/local-utility-billing";

type PaymentVoucher = { nombre: string; url: string; monto?: number };

type PaymentRow = {
  id: string;
  contractId: string;
  periodo: string;
  monto: string;
  mantenimiento: string;
  reciboLuzMonto?: string;
  reciboAguaMonto?: string;
  pagoLuz?: string;
  pagoAgua?: string;
  pagoLuzPorcentaje?: string;
  pagoAguaPorcentaje?: string;
  penalidad?: string;
  montoPagado?: string;
  diasIndulgencia?: number;
  estado: string;
  fechaPago: string | null;
  voucherNombre: string | null;
  tieneVoucher?: boolean;
  vouchers?: PaymentVoucher[];
  /** Suma de los montos anotados en los vouchers subidos (API compacta). */
  vouchersMonto?: string;
  voucherVerificadoEn?: string | null;
  voucherVerificadoPor?: string | null;
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
  luz: number;
  agua: number;
  impuestoRenta: number;
  abonado: number;
  saldo: number;
  estadoPago:
    | "PAGADO"
    | "DEPOSITADO"
    | "PARCIAL"
    | "PENDIENTE"
    | "VENCIDO"
    | "FINALIZADO";
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
  { key: "DEPOSITADO", label: "Uploaded" },
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
      title="Días de prórroga"
      className="w-20 rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-center text-sm text-on-surface focus:border-primary focus:outline-none"
    />
  );
}

const moneda = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN" });

async function cargarLista<T>(path: string): Promise<T[]> {
  const response = await apiFetch(path);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Error ${response.status}`;
    throw new Error(`No se pudo cargar ${path}: ${message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`La respuesta de ${path} no tiene el formato esperado.`);
  }
  return data as T[];
}

type AbonoModo = "PARCIAL" | "TOTAL" | "VOUCHER";

function AbonoModal({
  fila,
  modo,
  paymentsApiBase,
  onClose,
  onSaved,
}: {
  fila: CuotaFila;
  modo: AbonoModo;
  paymentsApiBase: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [monto, setMonto] = useState(fila.saldo > 0 ? fila.saldo.toFixed(2) : "");
  const [voucher, setVoucher] = useState<{ nombre: string; dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [optimizandoVoucher, setOptimizandoVoucher] = useState(false);
  const [cargandoPago, setCargandoPago] = useState(Boolean(fila.pago));
  const [pagoDetallado, setPagoDetallado] = useState<PaymentRow | null>(null);

  const montoNum =
    modo === "TOTAL" ? fila.saldo : modo === "VOUCHER" ? null : Number(monto);

  useEffect(() => {
    if (!fila.pago) {
      setCargandoPago(false);
      return;
    }
    let active = true;
    void apiFetch(`${paymentsApiBase}?paymentId=${encodeURIComponent(fila.pago.id)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : `Error ${res.status}`;
          throw new Error(message);
        }
        if (!body || typeof body !== "object" || !("vouchers" in body)) {
          throw new Error("No se pudieron cargar los vouchers del pago.");
        }
        if (active) setPagoDetallado(body as PaymentRow);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar los vouchers del pago."
          );
        }
      })
      .finally(() => {
        if (active) setCargandoPago(false);
      });
    return () => {
      active = false;
    };
  }, [fila.pago]);

  async function leerArchivo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!esJpeg(file.name, `data:${file.type}`) && !file.name.toLowerCase().endsWith(".jpg")) {
      setError("El baucher debe ser una imagen JPEG (.jpg).");
      return;
    }
    setError(null);
    setOptimizandoVoucher(true);
    try {
      const optimized = await compressImageFile(file, "voucher");
      const dataUrl = await fileToDataUrl(optimized);
      if (!esJpeg(optimized.name, dataUrl)) {
        throw new Error("El baucher optimizado no quedó en formato JPEG.");
      }
      setVoucher({ nombre: optimized.name, dataUrl });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo optimizar el baucher.");
    } finally {
      setOptimizandoVoucher(false);
    }
  }

  async function confirmar() {
    if (modo === "VOUCHER" && !fila.pago) {
      setError("No hay un pago existente para adjuntar el voucher.");
      return;
    }
    if (fila.pago && !pagoDetallado) {
      setError("Espera a que terminen de cargar los vouchers del pago.");
      return;
    }
    if (optimizandoVoucher) {
      setError("Espera a que termine de optimizarse el baucher.");
      return;
    }
    if (!voucher) {
      setError("Adjunta el baucher del pago (imagen JPEG).");
      return;
    }
    if (modo !== "VOUCHER" && (!Number.isFinite(montoNum) || montoNum === null || montoNum <= 0)) {
      setError("Ingresa el monto abonado en el baucher.");
      return;
    }
    if (modo !== "VOUCHER" && montoNum !== null && montoNum > fila.saldo + 0.001) {
      setError(`El monto no puede superar el saldo pendiente (${moneda(fila.saldo)}).`);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const nuevosVouchers: PaymentVoucher[] = [
        {
          nombre: voucher.nombre,
          url: voucher.dataUrl,
          ...(montoNum !== null ? { monto: montoNum } : {}),
        },
      ];
      const existentes: PaymentVoucher[] = (pagoDetallado?.vouchers ?? []).map((v) => ({
        nombre: v.nombre,
        url: v.url,
        ...(typeof v.monto === "number" ? { monto: v.monto } : {}),
      }));
      const vouchers =
        modo === "VOUCHER" ? nuevosVouchers : [...existentes, ...nuevosVouchers];
      // Usa los montos de la fila de pago existente (puede estar prorrateada
      // por días) y solo cae al canon mensual del contrato cuando no hay fila.
      const usaMontosFila = fila.pago && Number(fila.pago.monto) > 0;
      const payload =
        modo === "VOUCHER"
          ? { id: fila.pago!.id, voucherOnly: true, vouchers }
          : {
              id: fila.pago?.id,
              contractId: fila.contrato.id,
              periodo: fila.periodo,
              monto: usaMontosFila ? fila.pago!.monto : fila.contrato.montoCanonMensual,
              mantenimiento: usaMontosFila
                ? fila.pago!.mantenimiento
                : fila.contrato.mantenimiento ?? "50",
              vouchers,
            };
      const res = fila.pago
        ? await apiFetch(paymentsApiBase, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch(paymentsApiBase, {
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
          {modo === "VOUCHER"
            ? "Adjuntar voucher"
            : modo === "TOTAL"
              ? "Pago total"
              : "Pago parcial"}
        </h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          {fila.contrato.codigoContrato} · {fila.periodoFecha.toLocaleDateString("es-PE")}
        </p>

        {modo === "VOUCHER" ? (
          <p className="mt-4 text-sm text-on-surface-variant">
            Adjunta el comprobante correcto. El estado y los montos del pago no cambiarán.
          </p>
        ) : <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Total mes</dt>
            <dd className="font-semibold">{moneda(fila.total)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Abonado</dt>
            <dd className="font-semibold">{moneda(fila.abonado)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-on-surface-variant">Saldo</dt>
            <dd className="font-semibold text-destructive">{moneda(fila.saldo)}</dd>
          </div>
        </dl>}

        {modo !== "VOUCHER" ? <label className="mt-4 block text-sm">
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
        </label> : null}

        <label className="mt-3 block text-sm">
          <span className="text-on-surface-variant">Baucher (JPEG)</span>
          <input
            type="file"
            accept="image/jpeg"
            disabled={optimizandoVoucher}
            onChange={(e) => {
              void leerArchivo(e.target.files);
              e.target.value = "";
            }}
            className="mt-1 block w-full text-sm text-on-surface-variant file:mr-3 file:rounded file:border file:border-outline-variant file:bg-surface-container file:px-3 file:py-1.5 file:text-sm file:text-on-surface"
          />
          {voucher ? (
            <span className="mt-1 block text-xs text-on-surface-variant">{voucher.nombre}</span>
          ) : null}
          {optimizandoVoucher && (
            <span className="mt-1 block text-xs text-on-surface-variant">Optimizando baucher…</span>
          )}
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {cargandoPago ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            Cargando vouchers del pago…
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
            disabled={guardando || cargandoPago || optimizandoVoucher}
            className="rounded bg-primary px-3 py-1.5 text-sm text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {cargandoPago ? "Cargando…" : guardando ? "Guardando…" : modo === "VOUCHER" ? "Guardar voucher" : "Guardar abono"}
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
  localMode = false,
}: {
  grupos: MoraGrupo[];
  onClose: () => void;
  localMode?: boolean;
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
                      href={localMode ? "/locales/contactos" : `/contratos/clientes/${grupo.clienteId}`}
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

type LocalForCollection = {
  id: string;
  codigo: string;
  nombre: string;
  pagoLuzPorcentaje: string;
  pagoAguaPorcentaje: string;
  impuestoRentaPorcentaje: string;
};

export function CobranzaPage({ localMode = false }: { localMode?: boolean }) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [serviciosExtras, setServiciosExtras] = useState<ServicioExtraRow[]>([]);
  const [locales, setLocales] = useState<LocalForCollection[]>([]);
  const [localId, setLocalId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [busqueda, setBusqueda] = useState("");
  const [abono, setAbono] = useState<{ fila: CuotaFila; modo: AbonoModo } | null>(null);
  const [reciboServicios, setReciboServicios] = useState<{
    periodo: string;
    existing: PaymentRow | null;
  } | null>(null);
  const [mora, setMora] = useState(false);
  const [mostrarVerificacion, setMostrarVerificacion] = useState(false);
  const [sortKey, setSortKey] = useState<"cuota" | "contrato" | "cliente" | "departamento" | "total" | "internet" | "luzEx" | "extras" | "luz" | "agua" | "impuestoRenta" | "estado" | "morosidad" | "penalidad" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const paymentsApiBase = localMode ? "/api/locales/cobranza/pagos" : "/api/payments";
  const localSeleccionado = useMemo(
    () => locales.find((local) => local.id === localId) ?? null,
    [localId, locales],
  );

  useEffect(() => {
    if (!localMode) return;
    let active = true;
    void cargarLista<LocalForCollection>("/api/locales")
      .then((items) => {
        if (!active) return;
        setLocales(items);
        setLocalId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los locales.");
      });
    return () => {
      active = false;
    };
  }, [localMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (localMode) {
        if (!localId) {
          setContracts([]);
          setPayments([]);
          setServiciosExtras([]);
          return;
        }
        const response = await apiFetch(`/api/locales/cobranza?localId=${encodeURIComponent(localId)}`);
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof body === "object" && body !== null && "error" in body
            ? String(body.error)
            : `Error ${response.status}`;
          throw new Error(message);
        }
        if (typeof body !== "object" || body === null || !("contracts" in body) || !Array.isArray(body.contracts) || !("payments" in body) || !Array.isArray(body.payments)) {
          throw new Error("La respuesta de Cobranza Locales no tiene el formato esperado.");
        }
        setContracts(body.contracts as ContractRow[]);
        setPayments(body.payments as PaymentRow[]);
        setServiciosExtras([]);
        return;
      }
      const [cs, ps, ss] = await Promise.all([
        cargarLista<ContractRow>("/api/contracts"),
        cargarLista<PaymentRow>("/api/payments?compact=1"),
        cargarLista<ServicioExtraRow>("/api/servicios-extras"),
      ]);
      setContracts(cs);
      setPayments(ps);
      setServiciosExtras(ss);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "No se pudo cargar Cobranza."
      );
    } finally {
      setLoading(false);
    }
  }, [localMode, localId]);

  useEffect(() => {
    void load();
  }, [load]);

  const guardarIndulgencia = useCallback(
    async (f: CuotaFila, dias: number) => {
      try {
        if (f.pago) {
          const r = await apiFetch(paymentsApiBase, {
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
          const r = await apiFetch(paymentsApiBase, {
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
    [load, paymentsApiBase]
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
      if (c.estado === "CANCELADO" || c.estado === "RESUELTO" || c.estado === "ANULADO") continue;
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
          luz: 0,
          agua: 0,
          impuestoRenta: 0,
          abonado: 0,
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
      const indulgencia = Math.max(
        0,
        Math.floor(Number(pago?.diasIndulgencia ?? DIAS_PRORROGA_POR_DEFECTO) || 0)
      );
      const vencimiento = new Date(cuota.getTime() + indulgencia * 86_400_000);
      // Convención mostrada: "Parcial" = hay abono registrado pero falta
      // saldo (aunque su voucher aún no se verifique), "Uploaded" = pago
      // completo con voucher sin verificar y "Pagado" = verificado.
      const tieneVoucher = Boolean(
        pago?.tieneVoucher ?? Boolean(pago?.voucherNombre),
      );
      const verificadoTodos = Boolean(pago?.voucherVerificadoEn);
      // Cuando existe la fila de pago registrada con monto (> 0), respeta su
      // total: puede estar prorrateada por días (adenda de extensión).
      const montoRenta =
        pago && Number(pago.monto) > 0
          ? Number(pago.monto)
          : Number(c.montoCanonMensual ?? 0);
      const montoMantenimiento =
        pago && Number(pago.monto) > 0
          ? Number(pago.mantenimiento ?? 0)
          : Number(c.mantenimiento ?? 50);
      const luz = localMode ? Number(pago?.pagoLuz ?? 0) : 0;
      const agua = localMode ? Number(pago?.pagoAgua ?? 0) : 0;
      const total = montoRenta + montoMantenimiento + luz + agua;
      const impuestoRenta = localMode
        ? calcularImpuestoRenta(
            montoRenta,
            Number(localSeleccionado?.impuestoRentaPorcentaje ?? 5),
          )
        : 0;
      // Abonado real: los vouchers subidos llevan sus montos (sumados en
      // vouchersMonto); el montoPagado de la BD cubre lo registrado sin
      // voucher. Con ambos, prevalece el mayor para no subestimar el abono.
      const abonado = Math.max(
        Math.max(0, Number(pago?.vouchersMonto ?? 0) || 0),
        Math.max(0, Number(pago?.montoPagado ?? 0) || 0),
      );
      const saldo = Math.max(0, total - abonado);
      const pagado =
        pago?.estado === "PAGADO" && (verificadoTodos || !tieneVoucher);
      const parcialActivo = !pagado && abonado > 0.001 && saldo > 0.001;
      const depositado =
        !pagado &&
        !parcialActivo &&
        (pago?.estado === "DEPOSITADO" || (tieneVoucher && !verificadoTodos));
      // La mora se mide desde este mes: las cuotas de meses anteriores no
      // cuentan como atraso (no hay antecedentes de mora).
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
      const cuentaMora = cuota.getTime() >= inicioMes;
      const diasMora = depositado
        ? 0
        : pagado
        ? cuentaMora && pago?.fechaPago && pago.fechaPago > localDateStr(vencimiento)
          ? Math.floor(
              (parseLocalDate(pago.fechaPago).getTime() - vencimiento.getTime()) /
                86_400_000
            )
          : 0
        : cuentaMora && vencimiento.getTime() < inicioDia
          ? Math.floor((inicioDia - vencimiento.getTime()) / 86_400_000)
          : 0;
      const estadoPago = depositado
        ? "DEPOSITADO"
        : pagado
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
        luz,
        agua,
        impuestoRenta,
        abonado,
        saldo,
        estadoPago,
        diasMora,
        penalidad: penalidadPorDias(diasMora, pago?.penalidad),
        indulgencia,
        pago,
      });
    }
    return out.sort((a, b) => b.diasMora - a.diasMora || a.periodo.localeCompare(b.periodo));
  }, [contracts, localMode, localSeleccionado, payments, serviciosPorContrato]);
  const cuotaLocalActual = localMode
    ? filas.find((fila) => fila.contrato.id === contracts[0]?.id)
    : undefined;

  const ESTADO_META_LOCAL: Record<string, string> = {
    PAGADO: "Pagado",
    DEPOSITADO: "Uploaded",
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
      luz: (f) => f.luz,
      agua: (f) => f.agua,
      impuestoRenta: (f) => f.impuestoRenta,
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
      .reduce(
        (s, p) =>
          s +
          Number(p.monto) +
          Number(p.mantenimiento) +
          Number(p.pagoLuz ?? 0) +
          Number(p.pagoAgua ?? 0),
        0,
      );
    const vencido = filas
      .filter((f) => f.estadoPago === "VENCIDO")
      .reduce((s, f) => s + f.total, 0);
    const penalidades = filas.reduce((s, f) => s + f.penalidad, 0);
    const morosos = filas.filter((f) => f.estadoPago === "VENCIDO").length;
    const impuestoRenta = filas.reduce((s, f) => s + f.impuestoRenta, 0);
    return { recaudado, vencido, penalidades, morosos, impuestoRenta };
  }, [filas, payments]);

  const gananciasEsperadas = useMemo(
    () =>
      filas
        .filter(
          (f) =>
            f.estadoPago !== "FINALIZADO" &&
              (localMode || esCobrador(f.contrato.personaPago)) &&
            f.periodoFecha.getTime() >=
              parseLocalDate(f.contrato.fechaInicio).getTime()
        )
        .reduce((s, f) => s + Number(f.contrato.montoCanonMensual ?? 0), 0),
    [filas, localMode]
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
    DEPOSITADO: { label: "Uploaded", cls: "bg-amber-500" },
    PARCIAL: { label: "Parcial", cls: "bg-amber-500" },
    PENDIENTE: { label: "Pendiente", cls: "bg-outline" },
    VENCIDO: { label: "Vencido", cls: "bg-destructive" },
    FINALIZADO: { label: "Finalizado", cls: "bg-muted-foreground" },
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline-lg text-on-surface">{localMode ? "Cobranza Locales" : "Cobranza"}</h1>
            {localMode ? (
              <select
                aria-label="Seleccionar local para cobranza"
                value={localId}
                onChange={(event) => setLocalId(event.target.value)}
                className="h-10 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
                disabled={locales.length === 0}
              >
                {locales.map((local) => <option key={local.id} value={local.id}>{local.codigo} · {local.nombre}</option>)}
              </select>
            ) : null}
            {localMode ? (
              <button
                type="button"
                onClick={() => {
                  if (cuotaLocalActual) {
                    setReciboServicios({
                      periodo: cuotaLocalActual.periodo,
                      existing: cuotaLocalActual.pago,
                    });
                  }
                }}
                disabled={!cuotaLocalActual || loading || !localSeleccionado}
                className="h-10 rounded-md bg-primary px-3 text-sm text-on-primary disabled:opacity-50"
              >
                Registrar recibos luz/agua
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
          <button
            type="button"
            onClick={() => setMostrarVerificacion(true)}
            disabled={localMode && !localId}
            className="flex min-h-[116px] flex-col items-start justify-between rounded-xl border border-red-700 bg-red-600 p-4 text-left text-white transition-colors hover:bg-red-700"
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4" />
              Verificación de pagos
            </span>
            <span className="font-headline-md">Revisar vouchers</span>
          </button>
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="text-xs uppercase tracking-wider text-on-surface-variant">
              {localMode ? "Canon esperado del mes" : "Ganancias esperadas"}
            </div>
            <div className="mt-1 font-headline-md text-emerald-600">
              {moneda(gananciasEsperadas)}
            </div>
            <div className="mt-0.5 text-xs text-on-surface-variant">
              {localMode ? "Canon mensual de contratos activos" : "Canon del mes · Miguel, Emely y Evelyn"}
            </div>
          </div>
          {localMode ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
              <div className="text-xs uppercase tracking-wider text-on-surface-variant">
                Impuesto a la renta · separado
              </div>
              <div className="mt-1 font-headline-md text-on-surface">
                {moneda(resumen.impuestoRenta)}
              </div>
              <div className="mt-0.5 text-xs text-on-surface-variant">
                No incluido en el cobro al inquilino
              </div>
            </div>
          ) : null}
        </div>

        {!localMode ? <CobranzaVendedores /> : null}
        {!localMode ? <CobranzaDiasExtras /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.filter((item) => !localMode || item.key !== "SERVICIOS_EXTRAS").map((f) => (
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

        {loadError ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error-container bg-error-container p-4 text-error-container-foreground"
            role="alert"
          >
            <p className="text-sm">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-md border border-current px-3 py-1.5 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        ) : filter === "SERVICIOS_EXTRAS" && !localMode ? (
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
                  <th onClick={() => cambiarOrden(localMode ? "luz" : "internet")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === (localMode ? "luz" : "internet") ? "font-semibold text-on-surface" : "")}>
                    {localMode ? "Luz" : "Internet"}{sortKey === (localMode ? "luz" : "internet") ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden(localMode ? "agua" : "luzEx")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === (localMode ? "agua" : "luzEx") ? "font-semibold text-on-surface" : "")}>
                    {localMode ? "Agua" : "Luz-Ex"}{sortKey === (localMode ? "agua" : "luzEx") ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden(localMode ? "impuestoRenta" : "extras")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === (localMode ? "impuestoRenta" : "extras") ? "font-semibold text-on-surface" : "")}>
                    {localMode ? "IR separado" : "Servicios extras"}{sortKey === (localMode ? "impuestoRenta" : "extras") ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th onClick={() => cambiarOrden("estado")} className={"cursor-pointer select-none px-3 py-2 font-medium hover:text-on-surface " + (sortKey === "estado" ? "font-semibold text-on-surface" : "")}>
                    Estado{sortKey === "estado" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="px-3 py-2 font-medium" title="Días de prórroga">
                    Prórroga
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
                          href={localMode ? "/locales/contratos" : `/contratos/${f.contrato.id}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {f.contrato.codigoContrato}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={localMode ? "/locales/contactos" : `/contratos/clientes/${f.contrato.clienteId}`}
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
                        {localMode
                          ? f.luz > 0 ? moneda(f.luz) : "—"
                          : f.internet > 0 ? moneda(f.internet) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {localMode
                          ? f.agua > 0 ? moneda(f.agua) : "—"
                          : f.luzEx > 0 ? moneda(f.luzEx) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {localMode
                          ? f.impuestoRenta > 0 ? moneda(f.impuestoRenta) : "—"
                          : f.extras > 0 ? moneda(f.extras) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {f.pago?.tieneVoucher || f.pago?.voucherNombre ? (
                          <button
                            type="button"
                            onClick={() => setMostrarVerificacion(true)}
                            title={f.pago.voucherVerificadoEn
                              ? `Verified el ${new Date(f.pago.voucherVerificadoEn).toLocaleString("es-PE")}`
                              : "Pendiente de verificación"}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              f.estadoPago === "PAGADO"
                                ? "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                : "border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                            }`}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {ESTADO_META[f.estadoPago]?.label ?? "Uploaded"}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-label-md">
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.cls}`} />
                            {meta.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {f.estadoPago === "PAGADO" ||
                        f.estadoPago === "DEPOSITADO" ||
                        f.estadoPago === "FINALIZADO" ? (
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
                        {f.estadoPago === "FINALIZADO" ? (
                          <span className="text-xs text-on-surface-variant">—</span>
                        ) : f.estadoPago === "PAGADO" ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-xs text-on-surface-variant">
                              {f.pago?.fechaPago ?? "—"}
                            </span>
                            {f.pago && !f.pago.voucherNombre ? (
                              <button
                                type="button"
                                onClick={() => setAbono({ fila: f, modo: "VOUCHER" })}
                                className="rounded border border-outline-variant px-2 py-1 text-xs text-primary hover:bg-surface-container"
                              >
                                Adjuntar voucher
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setAbono({ fila: f, modo: "PARCIAL" })}
                                disabled={f.total <= 0 || f.saldo <= 0.001}
                                className="rounded border border-outline-variant px-2 py-1 text-xs text-primary hover:bg-surface-container disabled:opacity-40"
                              >
                                Pago parcial
                              </button>
                              <button
                                type="button"
                                onClick={() => setAbono({ fila: f, modo: "TOTAL" })}
                                disabled={f.total <= 0 || f.saldo <= 0.001}
                                className="rounded bg-primary px-2 py-1 text-xs text-on-primary hover:opacity-90 disabled:opacity-40"
                              >
                                Pago total
                              </button>
                            </div>
                            {f.abonado > 0 ? (
                              <span className="text-xs text-on-surface-variant">
                                Abonado {moneda(f.abonado)} · saldo {moneda(f.saldo)}
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
            paymentsApiBase={paymentsApiBase}
            onClose={() => setAbono(null)}
            onSaved={() => {
              setAbono(null);
              void load();
            }}
          />
        ) : null}

        {reciboServicios && localSeleccionado ? (
          <LocalUtilityReceiptsDialog
            local={localSeleccionado}
            periodo={reciboServicios.periodo}
            existing={reciboServicios.existing}
            onClose={() => setReciboServicios(null)}
            onSaved={() => {
              setReciboServicios(null);
              void load();
            }}
          />
        ) : null}

        {mora ? (
          <MoraModal grupos={moraGrupos} onClose={() => setMora(false)} localMode={localMode} />
        ) : null}

        {mostrarVerificacion ? (
          <PaymentVerificationDialog
            onClose={() => setMostrarVerificacion(false)}
            onVerified={() => void load()}
            localMode={localMode}
            localId={localId}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
