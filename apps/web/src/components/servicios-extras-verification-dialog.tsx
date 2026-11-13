"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

type ServicioExtra = {
  id: string;
  contractId: string;
  codigoContrato: string | null;
  tipoServicio: string | null;
  montoTotal: string | null;
  fechaPago: string | null;
  clienteNombre: string | null;
  voucherFilename: string | null;
  voucherVerificadoEn: string | null;
  voucherVerificadoPor: string | null;
};

type VerificationStep = "loading" | "code" | "enroll" | "servicios";
type EnrolledTotp = { factorId: string; qrCode: string; secret: string };

const OPCION_LABEL: Record<string, string> = {
  AMBOS: "Internet + carga eléctrica",
  INTERNET: "Internet",
  CARGA_ELECTRICA: "Carga eléctrica",
};

function moneda(n: number): string {
  return n.toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

export function ServiciosExtrasVerificationDialog({
  onClose,
  onVerified,
}: {
  onClose: () => void;
  onVerified: () => void;
}) {
  const [servicios, setServicios] = useState<ServicioExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState<VerificationStep>("loading");
  const [enroll, setEnroll] = useState<EnrolledTotp | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiFetch("/api/servicios-extras", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body)) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `Error ${response.status}`
        );
      }
      // Pendientes de verificar: con voucher subido y sin verificación
      // (estado "Uploaded").
      setServicios(
        (body as ServicioExtra[]).filter(
          (s) => Boolean(s.voucherFilename) && !s.voucherVerificadoEn
        )
      );
    } catch (loadFailure) {
      setLoadError(
        loadFailure instanceof Error
          ? loadFailure.message
          : "No se pudieron cargar los vouchers por verificar."
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
              typeof (status as { error?: unknown }).error === "string"
              ? (status as { error: string }).error
              : `Error ${statusResponse.status}`
          );
        }
        if (
          typeof status === "object" &&
          status !== null &&
          "enabled" in status &&
          (status as { enabled?: unknown }).enabled === true
        ) {
          if (active) setStep("code");
          return;
        }

        const enrollResponse = await apiFetch("/api/auth/mfa/enroll", { method: "POST" });
        const enrollment: unknown = await enrollResponse.json().catch(() => null);
        if (
          !enrollResponse.ok ||
          typeof enrollment !== "object" ||
          enrollment === null
        ) {
          throw new Error(
            typeof enrollment === "object" &&
              enrollment !== null &&
              "error" in enrollment &&
              typeof (enrollment as { error?: unknown }).error === "string"
              ? (enrollment as { error: string }).error
              : "No se pudo preparar la app autenticadora."
          );
        }
        const data = enrollment as { factorId?: unknown; qrCode?: unknown; secret?: unknown };
        if (
          typeof data.factorId !== "string" ||
          typeof data.qrCode !== "string" ||
          typeof data.secret !== "string"
        ) {
          throw new Error("No se pudo preparar la app autenticadora.");
        }
        if (active) {
          setEnroll({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
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
    if (step === "servicios") void load();
  }, [load, step]);

  async function verificar(servicio: ServicioExtra) {
    setBusyId(servicio.id);
    setError("");
    try {
      const response = await apiFetch(
        `/api/servicios-extras/${encodeURIComponent(servicio.id)}/verify`,
        { method: "POST" }
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `Error ${response.status}`
        );
      }
      const result = body as { voucherVerificadoEn: string; voucherVerificadoPor: string };
      setServicios((current) =>
        current.map((item) =>
          item.id === servicio.id
            ? {
                ...item,
                voucherVerificadoEn: result.voucherVerificadoEn,
                voucherVerificadoPor: result.voucherVerificadoPor,
              }
            : item
        )
      );
      onVerified();
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "No se pudo verificar el voucher."
      );
    } finally {
      setBusyId(null);
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
        step === "enroll" ? "/api/auth/mfa/activate" : "/api/servicios-extras/verification/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            step === "enroll" ? { factorId: enroll?.factorId, code } : { code }
          ),
        }
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `Error ${response.status}`
        );
      }
      setCode("");
      // Tras activar el autenticador por primera vez, se pide el código de
      // nuevo para abrir la sesión de verificación de servicios extras.
      setStep(step === "enroll" ? "code" : "servicios");
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

  async function cerrar() {
    try {
      await apiFetch("/api/servicios-extras/verification/session", { method: "DELETE" });
    } catch (closeError) {
      console.error("Error al cerrar la autorización de verificación:", closeError);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="servicios-verification-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant/50 p-4 sm:p-5">
          <div>
            <h2 id="servicios-verification-title" className="font-headline-md text-on-surface">
              Verificación de vouchers — servicios extras
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Confirma los vouchers subidos de internet y carga eléctrica.
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
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {step !== "servicios" ? (
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
                        Escanea este código QR con Google Authenticator u otra app autenticadora.
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
                    <p className="text-sm text-on-surface-variant">
                      Ingresa el código de tu app autenticadora para ver los vouchers por verificar.
                    </p>
                  )}
                  {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void autorizar();
                    }}
                    className="space-y-3"
                  >
                    <label className="block text-sm font-medium text-on-surface" htmlFor="servicios-verification-auth-code">
                      {step === "enroll" ? "Código de activación" : "Código de verificación"}
                    </label>
                    <input
                      id="servicios-verification-auth-code"
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
                      {authBusy
                        ? "Validando..."
                        : step === "enroll"
                          ? "Activar y continuar"
                          : "Ver vouchers"}
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant" role="status">
              <RefreshCw className="h-4 w-4 animate-spin" /> Cargando vouchers...
            </p>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={() => void load()} className="mt-2 underline">
                Reintentar
              </button>
            </div>
          ) : servicios.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">
              No hay vouchers por verificar. Todo está al día.
            </p>
          ) : (
            <>
              {error ? (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <ul className="space-y-3">
                {servicios.map((servicio) => {
                  const verificado = Boolean(servicio.voucherVerificadoEn);
                  return (
                    <li
                      key={servicio.id}
                      className="rounded-lg border border-outline-variant p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-on-surface">
                            {servicio.clienteNombre || "Cliente sin nombre"}
                          </p>
                          <p className="mt-1 text-sm text-on-surface-variant">
                            {servicio.codigoContrato ?? "—"}
                            {" · "}
                            {OPCION_LABEL[servicio.tipoServicio ?? ""] ?? servicio.tipoServicio ?? "—"}
                            {" · "}
                            {moneda(Number(servicio.montoTotal ?? 0))}
                          </p>
                          {verificado ? (
                            <p className="mt-1 text-xs text-on-surface-variant">
                              Verified{" "}
                              {new Date(servicio.voucherVerificadoEn!).toLocaleString("es-PE")}
                              {servicio.voucherVerificadoPor
                                ? ` · ${servicio.voucherVerificadoPor}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {servicio.voucherFilename ? (
                            <a
                              href={`/api/servicios-extras/${encodeURIComponent(servicio.id)}/voucher`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-outline-variant px-3 py-1.5 text-sm font-medium text-primary hover:bg-surface-container"
                            >
                              Ver voucher
                            </a>
                          ) : null}
                          {verificado ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-4 w-4" />
                              Verified
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void verificar(servicio)}
                              disabled={busyId === servicio.id}
                              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busyId === servicio.id ? "Verificando..." : "Verificar"}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 flex items-center gap-1 text-xs text-on-surface-variant">
                <ShieldCheck className="h-3.5 w-3.5" />
                La autorización se valida al abrir el panel y vence a los 30 minutos.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
