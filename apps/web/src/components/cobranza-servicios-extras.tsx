"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, ShieldCheck, Upload } from "lucide-react";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas } from "@/components/tabla-busqueda";
import { ServiciosExtrasVerificationDialog } from "@/components/servicios-extras-verification-dialog";

type ServicioExtra = {
  id: string;
  contractId: string;
  codigoContrato: string | null;
  tipoServicio: string | null;
  incluyeInternet: boolean;
  incluyeCargaElectrica: boolean;
  montoTotal: string | null;
  fechaOpcion: string;
  fechaPago: string | null;
  clienteNombre: string | null;
  clienteDocumento: string | null;
  estado: string;
  filename: string | null;
};

type ServicioPago = {
  id: string;
  servicioId: string;
  periodo: string;
  fechaVencimiento: string;
  voucherFilename: string | null;
  voucherVerificadoEn: string | null;
  voucherVerificadoPor: string | null;
  contractId: string;
  codigoContrato: string | null;
  tipoServicio: string | null;
  montoTotal: string | null;
  clienteNombre: string | null;
  clienteDocumento: string | null;
};

const OPCION_LABEL: Record<string, string> = {
  AMBOS: "Internet + carga eléctrica",
  INTERNET: "Internet",
  CARGA_ELECTRICA: "Carga eléctrica",
};

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "set", "oct", "nov", "dic",
];

function moneda(n: number): string {
  return n.toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

function fechaLegible(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

/** "2026-11" → "nov 2026". */
function periodoLegible(periodo: string): string {
  const [y, m] = periodo.split("-");
  const indice = Number(m) - 1;
  if (!y || Number.isNaN(indice) || indice < 0 || indice > 11) return periodo;
  return `${MESES_CORTOS[indice]} ${y}`;
}

function hoyISO(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
}

/** Fecha (ISO) de dentro de n días. */
function fechaMasDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Estado del pago mensual (misma convención que pagos):
 * - Pagado (verde): voucher verificado.
 * - Uploaded (ámbar): voucher subido sin verificar.
 * - Vencido (rojo): sin voucher y la fecha de vencimiento ya pasó.
 * - Pendiente: sin voucher, aún no vence.
 */
function estadoPago(p: ServicioPago): {
  label: string;
  className: string;
} {
  if (p.voucherVerificadoEn) {
    return {
      label: "Pagado",
      className:
        "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    };
  }
  if (p.voucherFilename) {
    return {
      label: "Uploaded",
      className:
        "border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    };
  }
  if (p.fechaVencimiento < hoyISO()) {
    return {
      label: "Vencido",
      className:
        "border-destructive/40 bg-destructive/5 text-destructive dark:bg-destructive/10",
    };
  }
  return {
    label: "Pendiente",
    className:
      "border-outline-variant bg-surface-container text-on-surface-variant",
  };
}

/** Cantidad de vouchers subidos que faltan por verificar. */
function pagosPendientesDeVerificacion(pagos: ServicioPago[]): number {
  return pagos.filter(
    (p) => Boolean(p.voucherFilename) && !p.voucherVerificadoEn
  ).length;
}

/** Conteo de la alerta de pagos: vencidos, por vencer (≤7 días) y por verificar. */
function resumenAlerta(pagos: ServicioPago[]): {
  vencidos: number;
  porVencer: number;
  porVerificar: number;
} {
  const hoy = hoyISO();
  const limite = fechaMasDias(7);
  let vencidos = 0;
  let porVencer = 0;
  let porVerificar = 0;
  for (const p of pagos) {
    if (p.voucherVerificadoEn) continue;
    if (p.voucherFilename) {
      porVerificar += 1;
    } else if (p.fechaVencimiento < hoy) {
      vencidos += 1;
    } else if (p.fechaVencimiento <= limite) {
      porVencer += 1;
    }
  }
  return { vencidos, porVencer, porVerificar };
}

export function CobranzaServiciosExtras() {
  const [servicios, setServicios] = useState<ServicioExtra[]>([]);
  const [pagos, setPagos] = useState<ServicioPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const [verificacionAbierta, setVerificacionAbierta] = useState(false);
  const inputVoucherRef = useRef<HTMLInputElement | null>(null);
  const objetivoPagoRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resServicios, resPagos] = await Promise.all([
        fetch("/api/servicios-extras", { cache: "no-store" }),
        fetch("/api/servicios-extras/pagos", { cache: "no-store" }),
      ]);
      if (!resServicios.ok) {
        const body = await resServicios.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${resServicios.status}`);
      }
      setServicios((await resServicios.json()) as ServicioExtra[]);
      if (!resPagos.ok) {
        const body = await resPagos.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${resPagos.status}`);
      }
      setPagos((await resPagos.json()) as ServicioPago[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibles = useMemo(
    () =>
      filtrarFilas(servicios, busqueda, (s) => [
        s.clienteNombre,
        s.codigoContrato,
        OPCION_LABEL[s.tipoServicio ?? ""] ?? s.tipoServicio,
      ]),
    [servicios, busqueda],
  );

  const pagosVisibles = useMemo(
    () =>
      filtrarFilas(pagos, busqueda, (p) => [
        p.clienteNombre,
        p.codigoContrato,
        OPCION_LABEL[p.tipoServicio ?? ""] ?? p.tipoServicio,
        periodoLegible(p.periodo),
      ]),
    [pagos, busqueda],
  );

  const total = useMemo(
    () => visibles.reduce((acc, s) => acc + Number(s.montoTotal ?? 0), 0),
    [visibles],
  );

  const alerta = useMemo(() => resumenAlerta(pagos), [pagos]);
  const porVerificar = pagosPendientesDeVerificacion(pagos);

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

  function abrirSelectorVoucher(id: string) {
    objetivoPagoRef.current = id;
    setError(null);
    inputVoucherRef.current?.click();
  }

  async function subirVoucher(id: string, file: File) {
    setSubiendoId(id);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/servicios-extras/pagos/${encodeURIComponent(id)}/voucher`,
        {
          method: "POST",
          body: form,
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendoId(null);
      objetivoPagoRef.current = null;
      if (inputVoucherRef.current) inputVoucherRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline-md text-on-surface">Servicios extras</h2>
          <p className="text-sm text-on-surface-variant">
            Internet (S/. 39) y/o recargo por carga eléctrica (S/. 60) con pago
            mensual. Cada mes genera su propio voucher en «Pagos mensuales».
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusquedaInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar servicio extra…"
            className="w-72"
          />
          <button
            type="button"
            onClick={() => {
              setError(null);
              setVerificacionAbierta(true);
            }}
            className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/60"
          >
            <ShieldCheck className="h-4 w-4" />
            Verificar vouchers
            {porVerificar > 0 ? (
              <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white">
                {porVerificar}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <input
        ref={inputVoucherRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const id = objetivoPagoRef.current;
          if (file && id) void subirVoucher(id, file);
        }}
      />

      {error ? (
        <p className="rounded-md bg-error-container px-3 py-2 text-sm text-error-container-foreground">
          {error}
        </p>
      ) : null}

      {alerta.vencidos > 0 || alerta.porVencer > 0 || alerta.porVerificar > 0 ? (
        <div
          role="alert"
          className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            alerta.vencidos > 0
              ? "border-destructive/40 bg-destructive/5 text-destructive dark:bg-destructive/10"
              : "border-amber-600/40 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">Alerta de pagos:</span>
          {alerta.vencidos > 0 ? (
            <span>
              {alerta.vencidos} pago{alerta.vencidos === 1 ? "" : "s"} mensual
              {alerta.vencidos === 1 ? "" : "es"} vencido{alerta.vencidos === 1 ? "" : "s"}
            </span>
          ) : null}
          {alerta.porVencer > 0 ? (
            <span>
              {alerta.porVencer} por vencer (≤ 7 días)
            </span>
          ) : null}
          {alerta.porVerificar > 0 ? (
            <span>{alerta.porVerificar} voucher{alerta.porVerificar === 1 ? "" : "s"} por verificar</span>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="text-on-surface-variant">Cargando servicios extras…</p>
      ) : (
        <>
          <TableScroll
            className="w-full rounded-lg border border-outline-variant"
            contentClassName="max-h-[32rem]"
          >
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface-container-low text-xs text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Opción tomada</th>
                  <th className="px-3 py-2 font-medium">Fecha opción</th>
                  <th className="px-3 py-2 font-medium">Día de pago</th>
                  <th className="px-3 py-2 font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((s) => (
                  <tr key={s.id} className="border-t border-outline-variant/50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/contratos/${s.contractId}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {s.codigoContrato ?? "—"}
                      </Link>
                    </td>
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
                      {moneda(Number(s.montoTotal ?? 0))}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const etiqueta =
                          s.estado === "PAGADO"
                            ? "Pagado"
                            : s.estado === "DEPOSITADO"
                              ? "Uploaded"
                              : "Pendiente";
                        const clase =
                          s.estado === "PAGADO"
                            ? "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : s.estado === "DEPOSITADO"
                              ? "border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                              : "border-outline-variant bg-surface-container text-on-surface-variant";
                        return (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${clase}`}
                          >
                            {etiqueta}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() =>
                          void descargar(
                            s.id,
                            s.filename ?? `servicios-extras-${s.codigoContrato ?? s.id}.pdf`,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-primary hover:bg-surface-container dark:border-transparent"
                      >
                        <Download className="h-4 w-4" />
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-on-surface-variant">
                      No hay servicios extras registrados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {visibles.length > 0 ? (
                <tfoot className="bg-surface-container-low text-sm">
                  <tr>
                    <td className="px-3 py-2 font-medium text-on-surface" colSpan={5}>
                      Total ({visibles.length})
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-on-surface">
                      {moneda(total)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </TableScroll>

          <h3 className="font-title-md text-on-surface">Pagos mensuales</h3>
          <TableScroll
            className="w-full rounded-lg border border-outline-variant"
            contentClassName="max-h-[32rem]"
          >
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface-container-low text-xs text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Servicio</th>
                  <th className="px-3 py-2 font-medium">Período</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Voucher</th>
                </tr>
              </thead>
              <tbody>
                {pagosVisibles.map((p) => {
                  const estado = estadoPago(p);
                  return (
                    <tr key={p.id} className="border-t border-outline-variant/50">
                      <td className="px-3 py-2">
                        <Link
                          href={`/contratos/${p.contractId}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {p.codigoContrato ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-on-surface">
                        {p.clienteNombre || "—"}
                        {p.clienteDocumento ? (
                          <span className="block text-xs text-on-surface-variant">
                            {p.clienteDocumento}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-on-surface-variant">
                        {OPCION_LABEL[p.tipoServicio ?? ""] ?? p.tipoServicio ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-on-surface-variant">
                        {periodoLegible(p.periodo)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-on-surface-variant">
                        {fechaLegible(p.fechaVencimiento)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-on-surface">
                        {moneda(Number(p.montoTotal ?? 0))}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${estado.className}`}
                        >
                          {estado.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.voucherFilename ? (
                            <a
                              href={`/api/servicios-extras/pagos/${encodeURIComponent(p.id)}/voucher`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-2"
                            >
                              Ver voucher
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => abrirSelectorVoucher(p.id)}
                            disabled={subiendoId === p.id}
                            className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1.5 font-label-md text-primary hover:bg-surface-container dark:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Upload className="h-4 w-4" />
                            {subiendoId === p.id
                              ? "Subiendo…"
                              : p.voucherFilename
                                ? "Reemplazar"
                                : "Subir voucher"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pagosVisibles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-on-surface-variant">
                      No hay pagos mensuales generados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}

      {verificacionAbierta ? (
        <ServiciosExtrasVerificationDialog
          onClose={() => setVerificacionAbierta(false)}
          onVerified={() => void load()}
        />
      ) : null}
    </div>
  );
}
