"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  AlarmClock,
  CalendarCheck2,
  Coffee,
  Fingerprint,
  LogOut,
  User,
} from "lucide-react";

type Registro = {
  id: string;
  nombre: string;
  dni: string;
  entradaAt: string | null;
  refrigerioInicioAt: string | null;
  refrigerioFinAt: string | null;
  salidaAt: string | null;
  asistio: boolean;
  createdAt: string | null;
};

type Accion = "ENTRADA" | "REFRIGERIO_INICIO" | "REFRIGERIO_FIN" | "SALIDA";

function esHoy(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const ahora = new Date();
  return (
    d.getDate() === ahora.getDate() &&
    d.getMonth() === ahora.getMonth() &&
    d.getFullYear() === ahora.getFullYear()
  );
}

function fmtHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function CronogramaAsistenciaPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [tipoMensaje, setTipoMensaje] = useState<"ok" | "error">("ok");
  const [cargando, setCargando] = useState(true);

  const notify = useCallback((texto: string, ok = true) => {
    setMensaje(texto);
    setTipoMensaje(ok ? "ok" : "error");
  }, []);

  const cargar = useCallback(async () => {
    const res = await apiFetch("/api/asistencias");
    if (res.ok) {
      const rows = (await res.json()) as Registro[];
      if (Array.isArray(rows)) setRegistros(rows);
    }
  }, []);

  useEffect(() => {
    void cargar().finally(() => setCargando(false));
  }, [cargar]);

  const dniLimpio = dni.trim();
  const miRegistro = dniLimpio
    ? registros.find((r) => r.dni === dniLimpio && esHoy(r.createdAt))
    : undefined;

  const datosListos = Boolean(nombre.trim()) && Boolean(dniLimpio);

  const puedeEntrada = datosListos && !miRegistro;
  const puedeRefrigerioInicio = Boolean(
    miRegistro && !miRegistro.refrigerioInicioAt && !miRegistro.salidaAt
  );
  const puedeRefrigerioFin = Boolean(
    miRegistro?.refrigerioInicioAt && !miRegistro.refrigerioFinAt
  );
  const puedeSalida = Boolean(miRegistro && !miRegistro.salidaAt);

  async function marcar(accion: Accion) {
    if (!datosListos) {
      return notify("Completá el nombre y el DNI antes de marcar", false);
    }
    setBusy(true);
    setMensaje(null);
    try {
      const res = await apiFetch("/api/asistencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), dni: dniLimpio, accion }),
      });
      const body = (await res.json()) as {
        registro?: Registro;
        aviso?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "No se pudo registrar la asistencia");
      await cargar();
      const marcada =
        accion === "ENTRADA"
          ? body.registro?.entradaAt ?? null
          : accion === "REFRIGERIO_INICIO"
            ? body.registro?.refrigerioInicioAt ?? null
            : accion === "REFRIGERIO_FIN"
              ? body.registro?.refrigerioFinAt ?? null
              : body.registro?.salidaAt ?? null;
      const hora = fmtHora(marcada);
      if (body.aviso) {
        notify(body.aviso, false);
        return;
      }
      const textos: Record<Accion, string> = {
        ENTRADA: `Entrada registrada a las ${hora}`,
        REFRIGERIO_INICIO: `Inicio de refrigerio registrado a las ${hora}`,
        REFRIGERIO_FIN: `Fin de refrigerio registrado a las ${hora}`,
        SALIDA: `Salida registrada a las ${hora}`,
      };
      notify(textos[accion]);
    } catch (error) {
      notify((error as Error).message, false);
    } finally {
      setBusy(false);
    }
  }

  const filaHora = (iso: string | null) => (
    <td className="px-3 py-2 text-sm text-on-surface">
      {fmtHora(iso)}
      <span className="block text-xs text-on-surface-variant">{fmtFecha(iso)}</span>
    </td>
  );

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarCheck2 className="h-6 w-6 text-primary" />
            <div>
              <h2 className="font-headline-lg text-on-surface">Cronograma de asistencia</h2>
              <p className="font-body-md text-on-surface-variant">
                Registrá tu entrada, tu refrigerio (máximo 1 hora) y tu salida.
              </p>
            </div>
          </div>
        </div>

        {mensaje ? (
          <div
            className={`rounded-md border p-3 text-sm ${
              tipoMensaje === "ok"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {mensaje}
          </div>
        ) : null}

        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="font-headline-md text-on-surface">Datos del trabajador</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Se piden antes de empezar a marcar. El DNI identifica tu jornada de hoy.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">
                Nombre del usuario
              </label>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 shrink-0 text-on-surface-variant" />
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  disabled={Boolean(miRegistro)}
                  placeholder="Nombre y apellido"
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm disabled:opacity-60"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">DNI</label>
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 shrink-0 text-on-surface-variant" />
                <input
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  disabled={Boolean(miRegistro)}
                  placeholder="Documento de identidad"
                  inputMode="numeric"
                  className="h-10 w-full rounded border border-outline-variant bg-transparent px-3 text-sm disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-outline-variant p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlarmClock className="h-4 w-4 text-primary" />
                <p className="font-label-md text-on-surface">Jornada laboral</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !puedeEntrada}
                  onClick={() => void marcar("ENTRADA")}
                  className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4 rotate-180" />
                  Iniciar jornada (hora de llegada)
                </button>
                <button
                  type="button"
                  disabled={busy || !puedeSalida}
                  onClick={() => void marcar("SALIDA")}
                  className="inline-flex items-center gap-2 rounded border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" />
                  Finalizar jornada (hora de salida)
                </button>
              </div>
              <p className="mt-2 text-xs text-on-surface-variant">
                Llegada: <strong>{fmtHora(miRegistro?.entradaAt ?? null)}</strong> · Salida:{" "}
                <strong>{fmtHora(miRegistro?.salidaAt ?? null)}</strong>
              </p>
            </div>

            <div className="rounded-lg border border-outline-variant p-4">
              <div className="mb-3 flex items-center gap-2">
                <Coffee className="h-4 w-4 text-primary" />
                <p className="font-label-md text-on-surface">Refrigerio (máximo 1 hora)</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !puedeRefrigerioInicio}
                  onClick={() => void marcar("REFRIGERIO_INICIO")}
                  className="inline-flex items-center gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Iniciar refrigerio
                </button>
                <button
                  type="button"
                  disabled={busy || !puedeRefrigerioFin}
                  onClick={() => void marcar("REFRIGERIO_FIN")}
                  className="inline-flex items-center gap-2 rounded border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Finalizar refrigerio
                </button>
              </div>
              <p className="mt-2 text-xs text-on-surface-variant">
                Inicio: <strong>{fmtHora(miRegistro?.refrigerioInicioAt ?? null)}</strong> · Fin:{" "}
                <strong>{fmtHora(miRegistro?.refrigerioFinAt ?? null)}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="font-headline-md text-on-surface">Registros de asistencia</h3>
          {cargando ? (
            <p className="mt-4 text-sm text-on-surface-variant">Cargando registros…</p>
          ) : registros.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
              Todavía no hay registros de asistencia.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant text-xs uppercase text-on-surface-variant">
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">DNI</th>
                    <th className="px-3 py-2 font-medium">Hora de inicio</th>
                    <th className="px-3 py-2 font-medium">Hora de salida</th>
                    <th className="px-3 py-2 font-medium">Refrigerio inicio</th>
                    <th className="px-3 py-2 font-medium">Refrigerio fin</th>
                    <th className="px-3 py-2 text-center font-medium">Asistió</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((reg) => (
                    <tr key={reg.id} className="border-b border-outline-variant/60">
                      <td className="px-3 py-2 text-sm text-on-surface">{reg.nombre}</td>
                      <td className="px-3 py-2 text-sm text-on-surface-variant">{reg.dni}</td>
                      {filaHora(reg.entradaAt)}
                      {filaHora(reg.salidaAt)}
                      {filaHora(reg.refrigerioInicioAt)}
                      {filaHora(reg.refrigerioFinAt)}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={reg.asistio}
                          readOnly
                          aria-label="Asistió"
                          className="h-4 w-4 accent-emerald-600"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
