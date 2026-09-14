"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { EVENTOS, EVENTO_DESC, PARAM_KEY, type EventoRegla } from "@/lib/automatizaciones-shared";
import {
  Play,
  Plus,
  Sparkles,
  Trash2,
  Clock,
  X,
} from "lucide-react";

interface Regla {
  id: string;
  nombre: string;
  evento: EventoRegla;
  params: Record<string, number>;
  asignadoA: string;
  activa: boolean;
}

interface Run {
  id: string;
  ruleId: string | null;
  fuente: string;
  detalle: { evaluados?: number; creadas?: number; en?: string };
  ejecutadoEn: string | null;
}

function fmtHace(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs}h`;
  return new Date(iso).toLocaleDateString("es-PE");
}

export default function AutomatizacionesPage() {
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | { nombre: string; evento: EventoRegla; valor: string; asignadoA: string }>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/automatizaciones");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Error al cargar");
      const data = (await res.json()) as { reglas: Regla[]; runs: Run[] };
      setReglas(data.reglas);
      setRuns(data.runs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ultimoRunPorRegla = useMemo(() => {
    const map: Record<string, Run> = {};
    for (const r of runs) {
      if (r.ruleId && !map[r.ruleId]) map[r.ruleId] = r;
    }
    return map;
  }, [runs]);

  async function crear() {
    if (!modal) return;
    setBusy(true);
    setFormError(null);
    const cfg = EVENTOS[modal.evento];
    const res = await apiFetch("/api/automatizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: modal.nombre.trim(),
        evento: modal.evento,
        params: { [PARAM_KEY[modal.evento]]: Number(modal.valor) || cfg.param },
        asignadoA: modal.asignadoA.trim(),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setFormError((await res.json().catch(() => ({}))).error ?? "No se pudo crear");
      return;
    }
    setModal(null);
    await load();
  }

  async function toggle(regla: Regla) {
    await apiFetch("/api/automatizaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: regla.id, activa: !regla.activa }),
    });
    await load();
  }

  async function eliminar(regla: Regla) {
    if (!window.confirm(`¿Eliminar la regla "${regla.nombre}"?`)) return;
    await apiFetch(`/api/automatizaciones?id=${encodeURIComponent(regla.id)}`, { method: "DELETE" });
    await load();
  }

  async function ejecutarAhora() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/automatizaciones/evaluar", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo ejecutar");
      const data = (await res.json()) as { resultados: Array<{ nombre: string; creadas: number; evaluados: number }> };
      const total = data.resultados.reduce((s, r) => s + r.creadas, 0);
      setError(null);
      await load();
      window.alert(`Ejecución completa. Tareas creadas: ${total}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-headline-lg text-primary">Automatizaciones</h2>
            <p className="text-sm text-muted-foreground">Reglas automáticas: un evento del ERP crea tareas de seguimiento en Work 123.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void ejecutarAhora()}
              disabled={busy}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
              title="Evaluar todas las reglas activas ahora"
            >
              <Play className="h-4 w-4" /> Ejecutar ahora
            </button>
            <button
              type="button"
              onClick={() => setModal({ nombre: "", evento: "CONV_SIN_RESPUESTA", valor: "8", asignadoA: "" })}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nueva regla
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-input bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <Sparkles className="mr-1 inline h-4 w-4" />
          El motor corre cada hora con <strong>Vercel Cron</strong> (ver <code>vercel.json</code>). Requiere definir <code>CRON_SECRET</code> en Vercel. También puedes pulsar “Ejecutar ahora”.
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : reglas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-input py-10 text-center text-sm text-muted-foreground">
            Sin reglas todavía. Crea una con “Nueva regla”.
          </p>
        ) : (
          <div className="space-y-3">
            {reglas.map((r) => {
              const cfg = EVENTOS[r.evento];
              const val = r.params[cfg.param] ?? "—";
              const last = ultimoRunPorRegla[r.id];
              return (
                <div key={r.id} className={`rounded-xl border p-4 transition-colors ${r.activa ? "border-input bg-surface" : "border-input bg-surface-container-low opacity-70"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">{r.nombre}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{EVENTO_DESC[r.evento]}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded bg-accent px-2 py-0.5 text-on-surface-variant">{cfg.label}</span>
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{val} {cfg.unidad}</span>
                        {r.asignadoA ? <span className="rounded bg-accent px-2 py-0.5 text-on-surface-variant">→ {r.asignadoA}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void toggle(r)}
                        className={`relative h-6 w-11 rounded-full transition-colors ${r.activa ? "bg-green-500" : "bg-muted"}`}
                        aria-label="Activar/desactivar"
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.activa ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                      <button type="button" onClick={() => void eliminar(r)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {last ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> Última: {fmtHace(last.ejecutadoEn)} · evaluó {last.detalle.evaluados ?? 0}, creó {last.detalle.creadas ?? 0} ({last.fuente.toLowerCase()})
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <section className="rounded-xl border border-input p-4">
          <h3 className="mb-2 font-headline-md font-bold text-primary">Ejecuciones recientes</h3>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay ejecuciones.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {runs.slice(0, 10).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 border-b border-outline-variant/30 py-1.5 last:border-0 dark:border-white/10">
                  <span className="text-muted-foreground">{fmtHace(x.ejecutadoEn)} · {x.fuente === "CRON" ? "Cron" : "Manual"}</span>
                  <span className="text-on-surface">evaluó {x.detalle.evaluados ?? 0} → creó <span className="font-semibold text-primary">{x.detalle.creadas ?? 0}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-headline-md font-bold text-primary">Nueva regla</h3>
              <button type="button" onClick={() => setModal(null)}><X className="h-4 w-4" /></button>
            </div>
            {formError && <p className="mb-2 rounded bg-destructive/10 px-2 py-1 text-sm text-destructive">{formError}</p>}
            <div className="space-y-3 text-sm">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Nombre *</span>
                <input className="h-9 w-full rounded-lg border border-input bg-background px-2" value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} placeholder="Responder rápido WhatsApp" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Evento</span>
                <select
                  className="h-9 w-full rounded-lg border border-input bg-background px-2"
                  value={modal.evento}
                  onChange={(e) => {
                    const ev = e.target.value as EventoRegla;
                    const val = ev === "CONV_SIN_RESPUESTA" ? "8" : ev === "LEAD_INACTIVO" ? "5" : "2";
                    setModal({ ...modal, evento: ev, valor: val });
                  }}
                >
                  {(Object.keys(EVENTOS) as EventoRegla[]).map((k) => (
                    <option key={k} value={k}>{EVENTOS[k].label}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">{EVENTO_DESC[modal.evento]}</p>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{EVENTOS[modal.evento].paramLabel}</span>
                <input type="number" min="1" className="h-9 w-full rounded-lg border border-input bg-background px-2" value={modal.valor} onChange={(e) => setModal({ ...modal, valor: e.target.value })} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Asignar tareas a (opcional)</span>
                <input className="h-9 w-full rounded-lg border border-input bg-background px-2" value={modal.asignadoA} onChange={(e) => setModal({ ...modal, asignadoA: e.target.value })} placeholder="Si vacío: usa el asignado del lead/conversación" />
              </label>
              <button type="button" onClick={() => void crear()} disabled={busy || !modal.nombre.trim()} className="w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-40">
                {busy ? "Guardando…" : "Crear regla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
