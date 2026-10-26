"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import "../portal-client.css";

export default function ClientPortalLoginPage() {
  const router = useRouter();
  const [departmentCode, setDepartmentCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portal-cliente/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentCode, password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No fue posible iniciar sesión");
      router.replace("/portal-cliente");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="client-portal-login">
      <section className="portal-login-card">
        <header className="portal-login-brand">
          <img src="/logo-white-mode.png" alt="AlquilaYa" />
        </header>
        <div className="portal-login-content">
          <p className="portal-login-eyebrow">ALQUILAYA REPAIR</p>
          <h1>Reportes de mantenimiento</h1>
          <p className="portal-login-subtitle">
          Ingresa con tu código de departamento y la contraseña asignada por administración.
          </p>

          <form onSubmit={login} className="portal-login-form">
            <label className="portal-login-field">
              <span>Código de departamento</span>
            <input
              required
              maxLength={50}
              autoComplete="username"
              value={departmentCode}
              onChange={(event) => setDepartmentCode(event.target.value.toUpperCase())}
                placeholder="Ej. ANG170-1"
              />
            </label>
            <label className="portal-login-field">
              <span>Contraseña</span>
            <input
              required
              type="password"
              maxLength={128}
              autoComplete="current-password"
              value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button disabled={busy} className="portal-login-submit">
              <KeyRound aria-hidden className="h-4 w-4" />
              {busy ? "Ingresando…" : "Ingresar"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          {error && (
            <p role="alert" className="portal-login-error">
              {error}
            </p>
          )}
        </div>
        <footer className="portal-login-footer">
          <span className="portal-login-footer-icon" aria-hidden="true">✓</span>
          <span>Acceso protegido durante la vigencia de tu contrato</span>
        </footer>
      </section>
    </main>
  );
}
