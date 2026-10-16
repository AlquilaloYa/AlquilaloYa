"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@contract/ui/components/button";
import { Input } from "@contract/ui/components/input";
import { Label } from "@contract/ui/components/label";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { SunIcon, MoonIcon } from "@contract/ui/components/theme-toggle";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const { user, login, verifyMfa } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (user) {
      router.replace(user.role === "MANTENIMIENTO" ? "/acceso-app" : "/dashboard");
    }
  }, [user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.status === "mfaRequired") {
      setMfaStep(true);
      return;
    }
    if (result.status === "error") {
      setError("Credenciales inválidas. Verifica tu correo y la contraseña del sistema.");
      return;
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await verifyMfa(code);
    setSubmitting(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
  }

  return (
    <div className="grid min-h-screen bg-surface text-on-surface lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#eef3fb] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <img
          src="/fondo.gif"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/65 via-slate-950/40 to-slate-950/65" />
        <div className="relative flex items-center gap-3 text-white">
          <img src="/logo-black-mode.png" alt="AlquilaYa ERP" className="h-12 w-16 object-contain" />
          <div>
            <span className="block font-headline-md font-bold text-white">AlquilaYa ERP</span>
            <span className="font-label-md uppercase tracking-wider text-white/85">Sistema de gestión integral ERP</span>
          </div>
        </div>
        <div className="relative">
          <h1 className="max-w-md text-3xl font-bold leading-tight text-white">
            Sistema de gestión integral ERP
          </h1>
          <p className="mt-4 max-w-md text-white/85">
            Sistema interno para administrar clientes, departamentos y contratos con trazabilidad completa.
          </p>
        </div>
        <p className="relative font-mono-label text-white/70">AlquilaYa ERP</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="absolute right-6 top-6">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
            onClick={toggleTheme}
            aria-label="Cambiar tema"
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <img src="/logo-white-mode.png" alt="AlquilaYa ERP" className="h-9 w-12 object-contain dark:hidden" />
              <img src="/logo-black-mode.png" alt="AlquilaYa ERP" className="hidden h-9 w-12 object-contain dark:block" />
              <span className="font-headline-md font-bold text-primary">AlquilaYa ERP</span>
            </div>
          </div>

          <h2 className="font-headline-lg text-primary">
            {mfaStep ? "Verificación en dos pasos" : "Acceso"}
          </h2>
          <p className="mt-1 font-body-md text-on-surface-variant">
            {mfaStep
              ? "Ingresa el código de tu aplicación de autenticación."
              : "Inicia sesión para continuar."}
          </p>

          {mfaStep ? (
            <form onSubmit={handleMfaSubmit} className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code" className="font-label-md text-on-surface-variant">
                  Código de verificación
                </Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="border-outline-variant bg-surface-container-lowest text-center tracking-[0.5em]"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  required
                />
              </div>
              {error ? <p className="font-body-sm text-destructive">{error}</p> : null}
              <Button
                type="submit"
                disabled={submitting || code.length < 6}
                className="w-full border-outline-variant bg-primary text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Verificando…" : "Verificar"}
              </Button>
              <button
                type="button"
                className="w-full text-center font-body-sm text-on-surface-variant hover:text-primary"
                onClick={() => {
                  setMfaStep(false);
                  setCode("");
                  setError(null);
                }}
              >
                Volver al inicio de sesión
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-label-md text-on-surface-variant">
                Correo electrónico
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <Input
                  id="email"
                  type="email"
                  className="pl-9 border-outline-variant bg-surface-container-lowest"
                  placeholder="operador@sistema.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-label-md text-on-surface-variant">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="border-outline-variant bg-surface-container-lowest pl-9 pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? "Ocultar" : "Ver"}
                  aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:bg-surface-variant"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error ? (
              <p className="font-body-sm text-destructive">{error}</p>
            ) : null}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full border-outline-variant bg-primary text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Verificando…" : "Iniciar sesión"}
            </Button>
          </form>
          )}
        </div>
      </section>
    </div>
  );
}