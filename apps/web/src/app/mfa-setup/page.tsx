"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@contract/ui/components/button";
import { Input } from "@contract/ui/components/input";
import { Label } from "@contract/ui/components/label";

interface EnrollData {
  factorId: string;
  qrCode: string;
  secret: string;
}

export default function MfaSetupPage() {
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    setEnroll(null);
    try {
      const response = await fetch("/api/auth/mfa/enroll", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as Partial<EnrollData> & {
        error?: string;
      };
      if (!response.ok || !data.factorId || !data.qrCode || !data.secret) {
        setError(data.error ?? "No se pudo iniciar el enrolamiento.");
        return;
      }
      setEnroll({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
    } catch {
      setError("No se pudo iniciar el enrolamiento. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function activate(event: FormEvent) {
    event.preventDefault();
    if (!enroll || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/mfa/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ factorId: enroll.factorId, code }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "El código no es válido. Inténtalo otra vez.");
        return;
      }
      window.location.replace("/dashboard");
    } catch {
      setError("No se pudo verificar el código. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión.");
      window.location.replace("/login");
    } catch {
      setError("No se pudo cerrar la sesión. Inténtalo otra vez.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 text-on-surface">
      <section className="w-full max-w-xl space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-lg sm:p-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Seguridad de la cuenta</p>
          <h1 className="mt-2 text-2xl font-bold">Configura la verificación en dos pasos</h1>
          <p className="mt-3 text-sm text-on-surface-variant">
            Este rol requiere MFA para acceder al ERP. Configura una aplicación autenticadora y verifica el código para continuar.
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!enroll ? (
          <Button type="button" disabled={busy} onClick={startEnrollment}>
            {busy ? "Preparando…" : "Configurar MFA"}
          </Button>
        ) : (
          <>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <img
                src={enroll.qrCode}
                alt="Código QR para configurar el autenticador"
                className="h-44 w-44 rounded-md border border-outline-variant bg-white p-2"
              />
              <div className="space-y-3">
                <p className="text-sm text-on-surface-variant">
                  Escanea el código con Google Authenticator, Authy u otra aplicación TOTP.
                </p>
                <div>
                  <Label htmlFor="mfa-secret">Secreto de configuración manual</Label>
                  <code id="mfa-secret" className="mt-1 block break-all rounded-md bg-surface-container p-3 text-sm">
                    {enroll.secret}
                  </code>
                </div>
              </div>
            </div>
            <form onSubmit={activate} className="space-y-3">
              <Label htmlFor="mfa-setup-code">Código de 6 dígitos</Label>
              <Input
                id="mfa-setup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                required
              />
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Verificando…" : "Verificar y continuar"}
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={startEnrollment}
            >
              Generar un código nuevo
            </Button>
          </>
        )}

        <button
          type="button"
          onClick={logout}
          className="block text-sm text-on-surface-variant underline underline-offset-4"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
