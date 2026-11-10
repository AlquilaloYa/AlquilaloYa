"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Clock3, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { work123DateKey } from "@/lib/work-123-calendar";

interface CheckOutTask {
  id: string;
  titulo: string;
  descripcion: string;
  fechaLimite: string | null;
  horaEjecucion: string;
  repetirCadaHora: boolean;
  estado: "PENDIENTE" | "EN_RESOLUCION" | "RESUELTA";
  origenEvento: string | null;
}

const REFRESH_INTERVAL_MS = 60_000;
const REMINDER_INTERVAL_MS = 60 * 60 * 1_000;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduledAt(task: CheckOutTask): Date | null {
  const date = work123DateKey(task.fechaLimite);
  if (!date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.horaEjecucion)) {
    return null;
  }
  const scheduled = new Date(`${date}T${task.horaEjecucion}:00`);
  return Number.isNaN(scheduled.getTime()) ? null : scheduled;
}

export function CheckOutReminder() {
  const { user, loading: sessionLoading } = useAuth();
  const [tasks, setTasks] = useState<CheckOutTask[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [hora, setHora] = useState("09:00");
  const [repetir, setRepetir] = useState(false);
  const [cerrada, setCerrada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [completando, setCompletando] = useState(false);
  const [error, setError] = useState("");

  const tarea = useMemo(() => {
    const hoy = localDateKey(new Date(now));
    return tasks
      .filter(
        (task) =>
          task.origenEvento === "CHECKOFF" &&
          task.estado !== "RESUELTA" &&
          work123DateKey(task.fechaLimite) !== null &&
          work123DateKey(task.fechaLimite)! <= hoy,
      )
      .sort((a, b) =>
        (work123DateKey(a.fechaLimite) ?? "").localeCompare(
          work123DateKey(b.fechaLimite) ?? "",
        ),
      )[0] ?? null;
  }, [now, tasks]);

  const cargarTareas = useCallback(async () => {
    try {
      const response = await apiFetch("/api/tareas", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudieron cargar las tareas de check-out");
      }
      setTasks((await response.json()) as CheckOutTask[]);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las tareas de check-out",
      );
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || !user) return;
    void cargarTareas();
    const refresh = window.setInterval(() => void cargarTareas(), REFRESH_INTERVAL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [cargarTareas, sessionLoading, user]);

  useEffect(() => {
    if (!tarea) {
      setCerrada(false);
      return;
    }
    setHora(tarea.horaEjecucion);
    setRepetir(tarea.repetirCadaHora);
    setError("");
  }, [tarea?.id, tarea?.horaEjecucion, tarea?.repetirCadaHora]);

  useEffect(() => {
    if (!tarea) {
      setCerrada(false);
      return;
    }
    const key = `alquilaya:check-out-dismissed:${user?.id ?? "user"}:${tarea.id}`;
    const dismissedUntil = Number(window.sessionStorage.getItem(key) ?? "");
    setCerrada(
      window.sessionStorage.getItem(key) === "closed" ||
        (Number.isFinite(dismissedUntil) && dismissedUntil > now),
    );
  }, [now, tarea?.id, tarea?.repetirCadaHora, user?.id]);

  const horaProgramada = tarea ? scheduledAt(tarea) : null;
  const yaEsHora = horaProgramada !== null && now >= horaProgramada.getTime();
  const dismissalKey = tarea
    ? `alquilaya:check-out-dismissed:${user?.id ?? "user"}:${tarea.id}`
    : null;

  async function guardarHorario() {
    if (!tarea) return;
    setGuardando(true);
    setError("");
    try {
      const response = await apiFetch("/api/tareas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tarea.id,
          horaEjecucion: hora,
          repetirCadaHora: repetir,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo guardar el horario");
      }
      const updated = (await response.json()) as CheckOutTask;
      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      if (dismissalKey) window.sessionStorage.removeItem(dismissalKey);
      setCerrada(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el horario");
    } finally {
      setGuardando(false);
    }
  }

  async function marcarHecha() {
    if (!tarea || !yaEsHora) return;
    setCompletando(true);
    setError("");
    try {
      const response = await apiFetch("/api/tareas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tarea.id, estado: "RESUELTA" }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo completar la tarea");
      }
      setTasks((current) =>
        current.map((task) =>
          task.id === tarea.id ? { ...task, estado: "RESUELTA" } : task,
        ),
      );
      if (dismissalKey) window.sessionStorage.removeItem(dismissalKey);
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "No se pudo completar la tarea",
      );
    } finally {
      setCompletando(false);
    }
  }

  function cerrarAviso() {
    if (!tarea || !dismissalKey) return;
    if (tarea.repetirCadaHora) {
      window.sessionStorage.setItem(
        dismissalKey,
        String(Date.now() + REMINDER_INTERVAL_MS),
      );
    } else {
      window.sessionStorage.setItem(dismissalKey, "closed");
    }
    setCerrada(true);
  }

  function reabrirAviso() {
    if (dismissalKey) window.sessionStorage.removeItem(dismissalKey);
    setCerrada(false);
  }

  if (sessionLoading || !user) return null;

  if (!tarea) {
    return error ? (
      <aside
        role="alert"
        className="fixed right-3 top-[4.5rem] z-40 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive shadow-xl"
      >
        {error}
      </aside>
    ) : null;
  }

  if (cerrada) {
    return (
      <button
        type="button"
        onClick={reabrirAviso}
        className="fixed right-4 top-20 z-40 rounded-lg border border-primary/30 bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow-lg"
      >
        Revisión (Check out) · Reabrir
      </button>
    );
  }

  return (
    <aside
      aria-label="Recordatorio de revisión de check-out"
      className="fixed right-3 top-[4.5rem] z-40 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-primary/40 bg-card p-4 text-card-foreground shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{tarea.titulo}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{tarea.descripcion}</p>
        </div>
        <button
          type="button"
          onClick={cerrarAviso}
          aria-label="Cerrar recordatorio"
          title="Cerrar recordatorio"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            Hora de ejecución
          </span>
          <input
            type="time"
            value={hora}
            onChange={(event) => setHora(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={repetir}
            onChange={(event) => setRepetir(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Repetir cada hora si se cierra
        </label>

        {horaProgramada && !yaEsHora ? (
          <p className="text-xs text-muted-foreground">
            La tarea estará disponible a las {horaProgramada.toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
            })}.
          </p>
        ) : null}

        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void guardarHorario()}
            disabled={guardando}
            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar horario"}
          </button>
          <button
            type="button"
            onClick={() => void marcarHecha()}
            disabled={!yaEsHora || completando}
            title={!yaEsHora ? "Disponible a la hora programada" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {completando ? "Guardando…" : "Tarea hecha"}
          </button>
          <Link href="/work-123" className="self-center text-xs text-primary hover:underline">
            Ver tareas
          </Link>
        </div>
      </div>
    </aside>
  );
}
