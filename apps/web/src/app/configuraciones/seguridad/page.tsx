"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { Button } from "@contract/ui/components/button";
import { Input } from "@contract/ui/components/input";
import { Label } from "@contract/ui/components/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@contract/ui/components/card";
import { Check, Copy, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";

interface EnrollData {
  factorId: string;
  qrCode: string;
  secret: string;
}

export default function SeguridadConfiguracionPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/mfa", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        enabled?: boolean;
        factors?: Array<{ id: string }>;
      };
      setEnabled(Boolean(data.enabled));
      setFactorId(data.factors?.[0]?.id ?? null);
    } catch {
      setError("No se pudo consultar el estado de MFA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/api/auth/mfa/enroll", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Partial<EnrollData> & {
        error?: string;
      };
      if (!res.ok || !data.factorId || !data.qrCode || !data.secret) {
        setError(data.error ?? "No se pudo iniciar el enrolamiento.");
        return;
      }
      setEnroll({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
      setCode("");
    } catch {
      setError("No se pudo iniciar el enrolamiento.");
    } finally {
      setBusy(false);
    }
  }

  async function activate(e: FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/mfa/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: enroll.factorId, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Código inválido. Inténtalo de nuevo.");
        return;
      }
      setEnroll(null);
      setCode("");
      setNotice("Verificación en dos pasos activada correctamente.");
      await loadStatus();
    } catch {
      setError("No se pudo verificar el código.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!factorId) return;
    if (!window.confirm("¿Desactivar la verificación en dos pasos? Perderás la protección adicional.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/api/auth/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo desactivar MFA.");
        return;
      }
      setNotice("Verificación en dos pasos desactivada.");
      await loadStatus();
    } catch {
      setError("No se pudo desactivar MFA.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="font-headline-lg text-primary">Seguridad</h1>
          <p className="mt-1 font-body-md text-on-surface-variant">
            Administra la verificación en dos pasos (MFA) de tu cuenta.
          </p>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-body-sm text-destructive">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 font-body-sm text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        <Card className="border-outline-variant bg-surface-container-lowest">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {enabled ? (
                  <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ShieldOff className="h-6 w-6 text-on-surface-variant" />
                )}
                <div>
                  <CardTitle className="font-title-lg">Aplicación de autenticación (TOTP)</CardTitle>
                  <CardDescription>
                    {loading
                      ? "Consultando estado…"
                      : enabled
                        ? "Activada. Se solicitará un código al iniciar sesión."
                        : "No activada. Añade una capa extra de seguridad."}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 font-body-sm text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : enabled ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={disable}
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Desactivar verificación en dos pasos
              </Button>
            ) : enroll ? (
              <form onSubmit={activate} className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex h-40 w-40 items-center justify-center rounded-md border border-outline-variant bg-white p-2">
                    <img src={enroll.qrCode} alt="Código QR para configurar el autenticador" className="h-full w-full object-contain" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <p className="flex items-center gap-2 font-body-sm text-on-surface-variant">
                      <Smartphone className="h-4 w-4" />
                      Escanea el código QR con Google Authenticator, Authy u otra app TOTP.
                    </p>
                    <div className="space-y-1.5">
                      <Label className="font-label-md text-on-surface-variant">
                        ¿No puedes escanear? Introduce este secreto manualmente:
                      </Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 overflow-x-auto rounded-md border border-outline-variant bg-surface-container px-3 py-2 font-mono text-sm tracking-wider">
                          {enroll.secret}
                        </code>
                        <Button type="button" variant="outline" size="icon" onClick={copySecret} title="Copiar secreto">
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="activate-code" className="font-label-md text-on-surface-variant">
                        Código de 6 dígitos
                      </Label>
                      <Input
                        id="activate-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        className="border-outline-variant bg-surface-container-lowest tracking-[0.4em]"
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy || code.length < 6}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Activar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setEnroll(null);
                      setCode("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button type="button" disabled={busy} onClick={startEnroll}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Activar verificación en dos pasos
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
