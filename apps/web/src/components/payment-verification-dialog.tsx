"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Voucher = {
  nombre: string;
  url: string;
  monto?: number;
  verificadoEn?: string | null;
};
type Responsable = "miguel" | "emely";
type VerificationStep = "loading" | "code" | "enroll" | "payments";
type EnrolledTotp = { factorId: string; qrCode: string; secret: string };
type EnrollmentPurpose = "payment-verification" | "replace-lost-factor";
type VerificationAccess = {
  scope: "angamos" | "ben2195" | "all" | null;
  verifyPrefix: string | null;
  canVerify: boolean;
};

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
  estado: "DEPOSITADO" | "PAGADO" | "PARCIAL";
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
  localMode = false,
  localId,
}: {
  onClose: () => void;
  onVerified: () => void;
  localMode?: boolean;
  localId?: string;
}) {
  const [month, setMonth] = useState(mesActual);
  const [responsable, setResponsable] = useState<Responsable>("miguel");
  const [payments, setPayments] = useState<VerificationPayment[]>([]);
  const [verificationAccess, setVerificationAccess] =
    useState<VerificationAccess>({ scope: null, verifyPrefix: null, canVerify: true });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [montosVoucher, setMontosVoucher] = useState<Record<string, string>>({});
  const [step, setStep] = useState<VerificationStep>("loading");
  const [enroll, setEnroll] = useState<EnrolledTotp | null>(null);
  const [enrollmentPurpose, setEnrollmentPurpose] =
    useState<EnrollmentPurpose>("payment-verification");
  const [authBusy, setAuthBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ month });
      if (localMode && localId) params.set("localId", localId);
      const response = await apiFetch(
        `${localMode ? "/api/locales/cobranza/verification" : "/api/payments/verification"}?${params}`,
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
      if ("access" in body && typeof body.access === "object" && body.access !== null) {
        const access = body.access as Partial<VerificationAccess>;
        setVerificationAccess({
          scope:
            access.scope === "angamos" || access.scope === "ben2195" || access.scope === "all"
              ? access.scope
              : null,
          verifyPrefix:
            typeof access.verifyPrefix === "string" ? access.verifyPrefix : null,
          canVerify: typeof access.canVerify === "boolean" ? access.canVerify : true,
        });
      }
    } catch (loadFailure) {
      setLoadError(
        loadFailure instanceof Error
          ? loadFailure.message
          : "No se pudieron cargar los pagos para verificar."
      );
    } finally {
      setLoading(false);
    }
  }, [localId, localMode, month]);

  useEffect(() => {
    let active = true;
    async function prepareVerification() {
      try {
        const statusResponse = await apiFetch("/api/auth/mfa", { cache: "no-store" });
        const status: unknown = await statusResponse.json().catch(() => null);
        if (!statusResponse.ok) {
          throw new Error(
            typeof status === "object" &&
              status !== null &&
              "error" in status &&
              typeof status.error === "string"
              ? status.error
              : `Error ${statusResponse.status}`
          );
        }
        if (
          typeof status === "object" &&
          status !== null &&
          "enabled" in status &&
          status.enabled === true
        ) {
          if (active) setStep("code");
          return;
        }

        const enrollResponse = await apiFetch("/api/auth/mfa/enroll", { method: "POST" });
        const enrollment: unknown = await enrollResponse.json().catch(() => null);
        if (
          !enrollResponse.ok ||
          typeof enrollment !== "object" ||
          enrollment === null ||
          !("factorId" in enrollment) ||
          typeof enrollment.factorId !== "string" ||
          !("qrCode" in enrollment) ||
          typeof enrollment.qrCode !== "string" ||
          !("secret" in enrollment) ||
          typeof enrollment.secret !== "string"
        ) {
          throw new Error(
            typeof enrollment === "object" &&
              enrollment !== null &&
              "error" in enrollment &&
              typeof enrollment.error === "string"
              ? enrollment.error
              : "No se pudo preparar la app autenticadora."
          );
        }
        if (active) {
          setEnroll({
            factorId: enrollment.factorId,
            qrCode: enrollment.qrCode,
            secret: enrollment.secret,
          });
          setStep("enroll");
        }
      } catch (authFailure) {
        if (active) {
          setError(
            authFailure instanceof Error
              ? authFailure.message
              : "No se pudo preparar la verificación."
          );
          setStep("code");
        }
      }
    }
    void prepareVerification();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (step === "payments") void load();
  }, [load, step]);

  const visiblePayments = useMemo(
    () =>
      localMode || verificationAccess.scope
        ? payments
        : payments.filter((payment) => payment.responsable === responsable),
    [localMode, payments, responsable, verificationAccess.scope]
  );

  async function verificar(payment: VerificationPayment) {
    setBusyPaymentId(payment.id);
    setError("");
    // Montos de los vouchers nuevos (sin verificar), en orden. Solo aplica a
    // pagos de contratos; la verificación de locales no registra montos.
    const montos: number[] = [];
    if (!localMode) {
      for (let index = 0; index < payment.vouchers.length; index += 1) {
        const voucher = payment.vouchers[index];
        if (voucher.verificadoEn) continue;
        const texto = (montosVoucher[`${payment.id}-${index}`] ?? "").replace(",", ".");
        const monto = Number(texto);
        if (texto.trim() === "" || !Number.isFinite(monto) || monto < 0) {
          setError("Ingresa el monto de cada voucher nuevo antes de confirmar.");
          setBusyPaymentId(null);
          return;
        }
        montos.push(monto);
      }
    }
    try {
      const response = await apiFetch(localMode ? "/api/locales/cobranza/verify" : "/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, voucherMontos: montos }),
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
        throw new Error(responseError);
      }
      const result = body as {
        estado: VerificationPayment["estado"];
        montoPagado: string;
        voucherVerificadoEn: string;
        voucherVerificadoPor: string;
      };
      setPayments((current) =>
        current.map((item) =>
          item.id === payment.id
            ? {
                ...item,
                estado: result.estado,
                montoPagado: result.montoPagado,
                voucherVerificadoEn: result.voucherVerificadoEn,
                voucherVerificadoPor: result.voucherVerificadoPor,
                vouchers: item.vouchers.map((voucher, index) => {
                  if (voucher.verificadoEn) return voucher;
                  const texto = (montosVoucher[`${item.id}-${index}`] ?? "").replace(",", ".");
                  const monto = Number(texto);
                  return Number.isFinite(monto) ? { ...voucher, monto } : voucher;
                }),
              }
            : item
        )
      );
      setActivePaymentId(null);
      setMontosVoucher({});
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

  async function autorizar() {
    if (!/^\d{6}$/.test(code)) {
      setError("Ingresa el código de 6 dígitos de tu app autenticadora.");
      return;
    }
    setAuthBusy(true);
    setError("");
    try {
      const response = await apiFetch(
        step === "enroll" ? "/api/auth/mfa/activate" : "/api/payments/verification/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            step === "enroll"
              ? { factorId: enroll?.factorId, code, purpose: enrollmentPurpose }
              : { code }
          ),
        }
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : `Error ${response.status}`
        );
      }
      setCode("");
      setStep("payments");
    } catch (authorizationError) {
      setError(
        authorizationError instanceof Error
          ? authorizationError.message
          : "No se pudo validar el código."
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function iniciarRecuperacion() {
    setAuthBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth/mfa/recover", {
        method: "POST",
      });
      const body: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("factorId" in body) ||
        typeof body.factorId !== "string" ||
        !("qrCode" in body) ||
        typeof body.qrCode !== "string" ||
        !("secret" in body) ||
        typeof body.secret !== "string"
      ) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "No se pudo iniciar la recuperación del autenticador."
        );
      }
      setEnroll({
        factorId: body.factorId,
        qrCode: body.qrCode,
        secret: body.secret,
      });
      setEnrollmentPurpose("replace-lost-factor");
      setCode("");
      setStep("enroll");
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "No se pudo iniciar la recuperación del autenticador."
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function cerrar() {
    try {
      const response = await apiFetch("/api/payments/verification/session", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`No se pudo revocar la autorización (${response.status}).`);
      }
    } catch (closeError) {
      console.error("Error al cerrar la autorización de verificación de pagos:", closeError);
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-verification-title"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 p-4 sm:p-5">
          <div>
            <h2 id="payment-verification-title" className="font-headline-md text-on-surface">
              Verificación de pagos
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Revisa los vouchers de los pagos registrados en el mes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void cerrar()}
            aria-label="Cerrar"
            className="rounded p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <X className="h-5 w-5" />
          </button>
          {step === "payments" ? <label className="flex items-center gap-2 text-sm font-medium">
            Mes
            <input
              type="month"
              value={month}
              max={mesActual()}
              onChange={(event) => {
                setMonth(event.target.value);
                setActivePaymentId(null);
                setMontosVoucher({});
                setCode("");
                setError("");
              }}
              className="rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-on-surface"
            />
          </label> : null}
        </header>

        {step === "payments" && !localMode && !verificationAccess.scope ? <nav className="flex gap-2 border-b border-outline-variant/50 px-4 py-3" aria-label="Filtrar por responsable">
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
                  setMontosVoucher({});
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
        </nav> : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {step === "payments" && !localMode && verificationAccess.scope ? (
            <p className="mb-3 text-sm text-on-surface-variant">
              {verificationAccess.scope === "angamos"
                ? "Pagos de Angamos. Solo puedes verificar contratos ANG170-."
                : verificationAccess.scope === "ben2195"
                  ? "Solo se muestran pagos de contratos BEN2195-."
                  : "Se muestran los vouchers de Miguel y Emely."}
            </p>
          ) : null}
          {step !== "payments" ? (
            <div className="mx-auto max-w-md space-y-4 py-5">
              {step === "loading" ? (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-on-surface-variant" role="status">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Preparando la verificación...
                </p>
              ) : (
                <>
                  {step === "enroll" && enroll ? (
                    <div className="space-y-3 text-center">
                      <p className="text-sm text-on-surface-variant">
                        {enrollmentPurpose === "replace-lost-factor"
                          ? "Escanea este nuevo QR y confirma el código para activar tu autenticador."
                          : "Escanea este código QR con Google Authenticator u otra app autenticadora."}
                      </p>
                      <Image
                        src={enroll.qrCode}
                        alt="Código QR para vincular la app autenticadora"
                        width={208}
                        height={208}
                        unoptimized
                        className="mx-auto h-52 w-52 rounded-md border border-outline-variant bg-white p-2"
                      />
                      <p className="break-all rounded-md bg-surface-container p-2 font-mono text-xs text-on-surface">
                        Clave manual: {enroll.secret}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-on-surface-variant">
                        Ingresa el código de tu app autenticadora para ver los vouchers del mes.
                      </p>
                      <button
                        type="button"
                        onClick={() => void iniciarRecuperacion()}
                        disabled={authBusy}
                        className="text-sm font-medium text-primary underline disabled:opacity-50"
                      >
                        {authBusy ? "Generando QR nuevo..." : "Generar QR nuevo"}
                      </button>
                    </div>
                  )}
                  {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void autorizar();
                    }}
                    className="space-y-3"
                  >
                    <label className="block text-sm font-medium text-on-surface" htmlFor="verification-auth-code">
                      {step === "enroll" ? "Código de activación" : "Código de verificación"}
                    </label>
                    <input
                      id="verification-auth-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono tracking-widest text-on-surface"
                    />
                    <button
                      type="submit"
                      disabled={authBusy || code.length !== 6 || (step === "enroll" && !enroll)}
                      className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authBusy ? "Validando..." : step === "enroll" ? "Activar y continuar" : "Ver vouchers"}
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : (
            <>
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
              {verificationAccess.scope === "angamos"
                ? "No hay pagos de Angamos en este mes."
                : verificationAccess.scope === "ben2195"
                  ? "No hay pagos BEN2195- en este mes."
                  : verificationAccess.scope === "all"
                    ? "No hay vouchers registrados para este mes."
                    : `No hay pagos registrados para ${RESPONSABLES.find((item) => item.key === responsable)?.nombre} en este mes.`}
            </p>
          ) : (
            <ul className="space-y-4">
              {visiblePayments.map((payment) => {
                const verified = Boolean(payment.voucherVerificadoEn);
                const soloLectura =
                  !localMode &&
                  (!verificationAccess.canVerify ||
                    (verificationAccess.verifyPrefix !== null &&
                      !payment.codigoContrato
                        .toUpperCase()
                        .startsWith(verificationAccess.verifyPrefix)));
                const recordedAmount = Number(payment.montoPagado || 0);
                const amount =
                  verified && recordedAmount > 0
                    ? recordedAmount
                    : Number(payment.monto) + Number(payment.mantenimiento);
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
                          {!verified
                            ? "Uploaded"
                            : payment.estado === "PARCIAL"
                              ? "Parcial"
                              : "Pagado"}
                          {" · "}
                          {moneda(amount)}
                          {!verified && recordedAmount > 0
                            ? ` · Falta ${moneda(
                                Math.max(
                                  0,
                                  Number(payment.monto) +
                                    Number(payment.mantenimiento) -
                                    recordedAmount,
                                ),
                              )}`
                            : ""}
                        </p>
                      </div>
                      {verified ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Verified
                        </span>
                      ) : soloLectura ? (
                        <span className="shrink-0 rounded-full bg-surface-container px-2.5 py-1 text-xs text-on-surface-variant">
                          Solo lectura
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePaymentId(selected ? null : payment.id);
                            setCode("");
                            setError("");
                            if (selected) {
                              setMontosVoucher((prev) => {
                                const next = { ...prev };
                                for (const key of Object.keys(next)) {
                                  if (key.startsWith(`${payment.id}-`)) delete next[key];
                                }
                                return next;
                              });
                            } else {
                              const totalPendiente =
                                Number(payment.monto) + Number(payment.mantenimiento);
                              const saldo = Math.max(
                                0,
                                totalPendiente - Number(payment.montoPagado || 0),
                              );
                              const iniciales: Record<string, string> = {};
                              let primero = true;
                              payment.vouchers.forEach((voucher, index) => {
                                if (voucher.verificadoEn) return;
                                iniciales[`${payment.id}-${index}`] =
                                  primero && saldo > 0 ? saldo.toFixed(2) : "";
                                primero = false;
                              });
                              setMontosVoucher(iniciales);
                            }
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
                        Verified{" "}
                        {new Date(payment.voucherVerificadoEn!).toLocaleString("es-PE")}
                        {payment.voucherVerificadoPor
                          ? ` · ${payment.voucherVerificadoPor}`
                          : ""}
                      </p>
                    ) : selected ? (
                        <div className="mt-4 rounded-md bg-surface-container p-3">
                          {(() => {
                            const totalPendiente =
                              Number(payment.monto) + Number(payment.mantenimiento);
                            const abonado = Number(payment.montoPagado || 0);
                            const saldo = Math.max(0, totalPendiente - abonado);
                            const sinVerificar = payment.vouchers
                              .map((voucher, index) => ({ voucher, index }))
                              .filter((item) => !item.voucher.verificadoEn);
                            return (
                              <>
                                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                                {abonado > 0 || saldo < totalPendiente ? (
                                  <p className="mb-2 text-xs text-on-surface-variant">
                                    Total {moneda(totalPendiente)}
                                    {" · "}Abonado {moneda(abonado)}
                                    {" · "}Falta {moneda(saldo)}
                                  </p>
                                ) : null}
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {!localMode &&
                                    sinVerificar.map(({ voucher, index }) => (
                                    <label
                                      key={`${payment.id}-${index}`}
                                      className="block text-xs font-medium text-on-surface"
                                    >
                                      <span className="mb-1 block break-all">
                                        Monto del voucher "{voucher.nombre}"
                                      </span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={montosVoucher[`${payment.id}-${index}`] ?? ""}
                                        onChange={(event) =>
                                          setMontosVoucher((prev) => ({
                                            ...prev,
                                            [`${payment.id}-${index}`]: event.target.value
                                              .replace(/[^0-9.,]/g, "")
                                              .slice(0, 10),
                                          }))
                                        }
                                        placeholder="0.00"
                                        className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-on-surface"
                                      />
                                    </label>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void verificar(payment)}
                                  disabled={busyPaymentId === payment.id}
                                  className="mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busyPaymentId === payment.id ? "Verificando..." : "Confirmar verificación"}
                                </button>
                                <p className="mt-2 flex items-center gap-1 text-xs text-on-surface-variant">
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  La autorización se valida al abrir el panel.
                                </p>
                              </>
                            );
                          })()}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
