"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Voucher = { nombre: string; url: string; monto?: number };
type Responsable = "miguel" | "emely";

type VerificationPayment = {
  id: string;
  contractId: string;
  codigoContrato: string;
  clienteId: string;
  cliente: string;
  departamento: string | null;
  responsable: Responsable;
  periodo: string | null;
  fechaPago: string | null;
  fechaRegistro: string;
  estado: "PAGADO" | "PARCIAL";
  monto: string;
  mantenimiento: string;
  montoPagado: string;
  vouchers: Voucher[];
  voucherVerificadoEn: string | null;
  voucherVerificadoPor: string | null;
};

const RESPONSABLES: { key: Responsable; nombre: string; active: string }[] = [
  { key: "miguel", nombre: "Miguel", active: "border-emerald-600 bg-emerald-600 text-white" },
  { key: "emely", nombre: "Emely", active: "border-amber-500 bg-amber-500 text-white" },
];

const moneda = (value: number) =>
  value.toLocaleString("es-PE", { style: "currency", currency: "PEN" });

function mesActual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function PaymentVerificationDialog({
  onClose,
  onVerified,
}: {
  onClose: () => void;
  onVerified: () => void;
}) {
  const [month, setMonth] = useState(mesActual);
  const [responsable, setResponsable] = useState<Responsable>("miguel");
  const [payments, setPayments] = useState<VerificationPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiFetch(
        `/api/payments/verification?month=${encodeURIComponent(month)}`
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : `Error ${response.status}`;
        throw new Error(message);
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("payments" in body) ||
        !Array.isArray(body.payments)
      ) {
        throw new Error("La respuesta de pagos no tiene el formato esperado.");
      }
      setPayments(body.payments as VerificationPayment[]);
    } catch (loadFailure) {
      setLoadError(
        loadFailure instanceof Error
          ? loadFailure.message
          : "No se pudieron cargar los pagos para verificar."
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const visiblePayments = useMemo(
    () => payments.filter((payment) => payment.responsable === responsable),
    [payments, responsable]
  );

  async function verificar(payment: VerificationPayment) {
    if (!/^\d{6}$/.test(code)) {
      setError("Ingresa el código actual de 6 dígitos de tu app autenticadora.");
      return;
    }
    setBusyPaymentId(payment.id);
    setError("");
    setMfaSetupRequired(false);
    try {
      const response = await apiFetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, code }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const responseError =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : `Error ${response.status}`;
        setMfaSetupRequired(
          typeof body === "object" &&
            body !== null &&
            "code" in body &&
            body.code === "MFA_SETUP_REQUIRED"
        );
        throw new Error(responseError);
      }
      setPayments((current) =>
        current.map((item) =>
          item.id === payment.id
            ? {
                ...item,
                voucherVerificadoEn: new Date().toISOString(),
                voucherVerificadoPor: "Tú",
              }
            : item
        )
      );
      setCode("");
      setActivePaymentId(null);
      onVerified();
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "No se pudo verificar el voucher."
      );
    } finally {
      setBusyPaymentId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-verification-title"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 p-4 sm:p-5">
          <div>
            <h2 id="payment-verification-title" className="font-headline-md text-on-surface">
              Verificación de pagos
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Revisa los vouchers de los pagos registrados en el mes y confirma con tu token.
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
          <label className="flex items-center gap-2 text-sm font-medium">
            Mes
            <input
              type="month"
              value={month}
              max={mesActual()}
              onChange={(event) => {
                setMonth(event.target.value);
                setActivePaymentId(null);
                setCode("");
                setError("");
              }}
              className="rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-on-surface"
            />
          </label>
        </header>

        <nav className="flex gap-2 border-b border-outline-variant/50 px-4 py-3" aria-label="Filtrar por responsable">
          {RESPONSABLES.map((item) => {
            const count = payments.filter(
              (payment) => payment.responsable === item.key
            ).length;
            const isActive = responsable === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setResponsable(item.key);
                  setActivePaymentId(null);
                  setCode("");
                  setError("");
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  isActive
                    ? item.active
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {item.nombre} <span className="ml-1 opacity-80">({count})</span>
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant" role="status">
              <RefreshCw className="h-4 w-4 animate-spin" /> Cargando pagos...
            </p>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={() => void load()} className="mt-2 underline">
                Reintentar
              </button>
            </div>
          ) : visiblePayments.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">
              No hay pagos registrados para {RESPONSABLES.find((item) => item.key === responsable)?.nombre} en este mes.
            </p>
          ) : (
            <ul className="space-y-4">
              {visiblePayments.map((payment) => {
                const verified = Boolean(payment.voucherVerificadoEn);
                const amount = Number(payment.montoPagado || 0);
                const selected = activePaymentId === payment.id;
                return (
                  <li
                    key={payment.id}
                    className="rounded-lg border border-outline-variant p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/contratos/clientes/${payment.clienteId}`}
                          className="font-semibold text-primary hover:underline"
                          title="Abrir perfil del cliente"
                        >
                          {payment.cliente || "Cliente sin nombre"}
                        </Link>
                        <p className="mt-1 text-sm text-on-surface-variant">
                          {payment.codigoContrato}
                          {payment.departamento ? ` · ${payment.departamento}` : ""}
                          {payment.periodo
                            ? ` · cuota ${new Date(`${payment.periodo}T12:00:00`).toLocaleDateString("es-PE")}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {payment.fechaPago
                            ? `Pago: ${new Date(`${payment.fechaPago}T12:00:00`).toLocaleDateString("es-PE")}`
                            : `Registro: ${new Date(payment.fechaRegistro).toLocaleDateString("es-PE")}`}
                          {" · "}
                          {payment.estado === "PARCIAL" ? "Parcial" : "Pagado"}
                          {" · "}
                          {moneda(amount)}
                        </p>
                      </div>
                      {verified ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Pago verificado
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePaymentId(selected ? null : payment.id);
                            setCode("");
                            setError("");
                          }}
                          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90"
                        >
                          Verificar voucher
                        </button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {payment.vouchers.map((voucher, index) => (
                        <figure key={`${voucher.nombre}-${index}`} className="overflow-hidden rounded-md border border-outline-variant/70">
                          <a
                            href={voucher.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block bg-surface-container p-2"
                            aria-label={`Abrir voucher ${voucher.nombre} en otra pestaña`}
                          >
                            <Image
                              src={voucher.url}
                              alt={`Voucher ${voucher.nombre}`}
                              width={1000}
                              height={700}
                              unoptimized
                              className="h-64 w-full object-contain"
                            />
                          </a>
                          <figcaption className="flex flex-wrap justify-between gap-2 px-3 py-2 text-xs text-on-surface-variant">
                            <span className="break-all">{voucher.nombre}</span>
                            {typeof voucher.monto === "number" ? (
                              <span className="font-medium">{moneda(voucher.monto)}</span>
                            ) : null}
                          </figcaption>
                        </figure>
                      ))}
                    </div>

                    {verified ? (
                      <p className="mt-2 text-xs text-on-surface-variant">
                        Verificado{" "}
                        {new Date(payment.voucherVerificadoEn!).toLocaleString("es-PE")}
                        {payment.voucherVerificadoPor
                          ? ` · ${payment.voucherVerificadoPor}`
                          : ""}
                      </p>
                    ) : selected ? (
                      <div className="mt-4 rounded-md bg-surface-container p-3">
                        <label className="block text-sm font-medium text-on-surface" htmlFor={`payment-code-${payment.id}`}>
                          Token de la app autenticadora
                        </label>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            id={`payment-code-${payment.id}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            value={code}
                            onChange={(event) =>
                              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                            }
                            placeholder="000000"
                            className="w-32 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono tracking-widest text-on-surface"
                          />
                          <button
                            type="button"
                            onClick={() => void verificar(payment)}
                            disabled={busyPaymentId === payment.id || code.length !== 6}
                            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busyPaymentId === payment.id ? "Verificando..." : "Confirmar"}
                          </button>
                        </div>
                        {error ? (
                          <p role="alert" className="mt-2 text-sm text-destructive">
                            {error}
                          </p>
                        ) : null}
                        {mfaSetupRequired ? (
                          <Link
                            href="/configuraciones/seguridad"
                            className="mt-2 inline-block text-sm text-primary underline"
                          >
                            Configurar app autenticadora
                          </Link>
                        ) : null}
                        <p className="mt-2 flex items-center gap-1 text-xs text-on-surface-variant">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          El token se valida con MFA y no se almacena.
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
