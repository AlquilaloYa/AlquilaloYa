"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function AccesoAppPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  async function handleLogout() {
    setLeaving(true);
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-on-surface">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-sm">
        <img
          src="/logo-black-mode.png"
          alt="AlquilaYa Repair"
          className="mx-auto h-14 w-20 object-contain"
        />
        <h1 className="mt-6 font-headline-md font-bold">Acceso solo desde la app móvil</h1>
        <p className="mt-3 font-body-md text-on-surface-variant">
          Tu cuenta de <strong>Mantenimiento</strong> trabaja exclusivamente con la app
          <strong> AlquilaYa Repair</strong>. Desde el ordenador no tienes acceso al ERP.
        </p>
        <p className="mt-3 font-body-sm text-on-surface-variant">
          Descarga e inicia sesión en la app del móvil para ver y gestionar tus órdenes de
          trabajo.
        </p>
        {user ? (
          <p className="mt-4 font-label-md text-on-surface-variant">
            Sesión: {user.name ?? user.email}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          disabled={leaving}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {leaving ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}
