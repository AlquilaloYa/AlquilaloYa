"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@contract/ui/components/button";
import { Input } from "@contract/ui/components/input";
import { Label } from "@contract/ui/components/label";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { SunIcon, MoonIcon } from "@contract/ui/components/theme-toggle";
import { Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const { user, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const ok = await login(email, password);
    setSubmitting(false);
    if (!ok) {
      setError("Credenciales inválidas. Verifica tu correo y la contraseña del sistema.");
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="grid min-h-screen bg-surface text-on-surface lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#eef3fb] text-[#081a34] dark:bg-[#081a34] dark:text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(circle_at_20%_20%,#ffffff_0,transparent_45%),radial-gradient(circle_at_85%_75%,#8590a6_0,transparent_45%)] dark:[background:radial-gradient(circle_at_20%_20%,#3c5878_0,transparent_45%),radial-gradient(circle_at_85%_75%,#172d49_0,transparent_45%)]" />
        <div className="relative overflow-hidden rounded-xl bg-[#dbe7f5]/70 p-6 min-h-[120px] dark:bg-[#0b2540]/70">
          <img
            src="/fondo.gif"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-105 object-cover opacity-85 blur-md"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#eef3fb]/90 via-[#eef3fb]/30 to-[#eef3fb]/0 dark:from-[#081a34]/80 dark:via-[#081a34]/20 dark:to-[#081a34]/0" />
          <div className="relative flex items-center gap-3">
            <img src="/logo-white-mode.png" alt="CP System ERP" className="h-12 w-16 object-contain dark:hidden" />
            <img src="/logo-black-mode.png" alt="CP System ERP" className="hidden h-12 w-16 object-contain dark:block" />
            <div>
              <span className="block font-headline-md font-bold">CP System ERP</span>
              <span className="font-label-md uppercase tracking-wider text-[#294261] dark:text-white/80">Sistema de gestión integral ERP</span>
            </div>
          </div>
        </div>
        <div className="relative">
          <h1 className="max-w-md text-3xl font-bold leading-tight text-[#081a34] dark:text-white">
            Sistema de gestión integral ERP
          </h1>
          <p className="mt-4 max-w-md text-[#294261] dark:text-white/80">
            Sistema interno para administrar clientes, departamentos y contratos con trazabilidad completa.
          </p>
        </div>
        <p className="relative font-mono-label text-[#526782] dark:text-white/60">CP System ERP</p>
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
              <img src="/logo-white-mode.png" alt="CP System ERP" className="h-9 w-12 object-contain dark:hidden" />
              <img src="/logo-black-mode.png" alt="CP System ERP" className="hidden h-9 w-12 object-contain dark:block" />
              <span className="font-headline-md font-bold text-primary">CP System ERP</span>
            </div>
          </div>

          <h2 className="font-headline-lg text-primary">Acceso</h2>
          <p className="mt-1 font-body-md text-on-surface-variant">
            Inicia sesión para continuar.
          </p>

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
                  type="password"
                  className="pl-9 border-outline-variant bg-surface-container-lowest"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
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

          <div className="mt-6 rounded-md border border-outline-variant bg-surface-container-lowest p-4">
            <p className="font-label-md text-on-surface-variant">
              Accesos (Supabase Auth · usa la contraseña asignada a tu usuario)
            </p>
            <ul className="mt-2 space-y-1 font-body-sm text-on-surface-variant">
              <li>admin@sistema.com — Admin</li>
              <li>operador@sistema.com — Operador</li>
              <li>supervisor@sistema.com — Supervisor</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}