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

        <BotsYConexiones />

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

const CANALES_BOT = ["WHATSAPP", "MESSENGER", "TIKTOK", "WEB", "EMAIL", "TODOS"] as const;

interface BotRegla {
  id: string;
  nombre: string;
  canal: string;
  keywords: string[];
  plantillaId: string | null;
  cuerpo: string;
  unaPorConversacion: boolean;
  activa: boolean;
}

interface Plantilla {
  id: string;
  nombre: string;
  cuerpo: string;
}

function BotsYConexiones() {
  const [bots, setBots] = useState<BotRegla[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [estado, setEstado] = useState<{ variables: Record<string, boolean>; webhooks: { meta: string; canonico: string } } | null>(null);
  const [modal, setModal] = useState<null | { nombre: string; canal: string; keywords: string; plantillaId: string; cuerpo: string }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, p, e] = await Promise.all([
      apiFetch("/api/bots").then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/plantillas").then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/canales/estado").then((r) => (r.ok ? r.json() : null)),
    ]);
    setBots(b as BotRegla[]);
    setPlantillas(p as Plantilla[]);
    setEstado(e);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function guardar() {
    if (!modal?.nombre.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await apiFetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: modal.nombre.trim(),
        canal: modal.canal,
        keywords: modal.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        plantillaId: modal.plantillaId || null,
        cuerpo: modal.cuerpo.trim(),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "No se pudo crear");
      return;
    }
    setModal(null);
    await load();
  }

  async function toggle(b: BotRegla) {
    await apiFetch("/api/bots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, activa: !b.activa }),
    });
    await load();
  }

  async function eliminar(b: BotRegla) {
    if (!window.confirm(`¿Eliminar la regla de bot "${b.nombre}"?`)) return;
    await apiFetch(`/api/bots?id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <section className="rounded-xl border border-input p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-headline-md font-bold text-primary">Bots de respuesta</h3>
            <p className="text-sm text-muted-foreground">Responden automáticamente con una plantilla cuando un mensaje entrante coincide con una palabra clave.</p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ nombre: "", canal: "WHATSAPP", keywords: "", plantillaId: "", cuerpo: "" })}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nuevo bot
          </button>
        </div>
        {bots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin bots. Crea uno para responder “precio”, “disponibilidad”, etc.</p>
        ) : (
          <div className="space-y-2">
            {bots.map((b) => (
              <div key={b.id} className={`flex items-center justify-between gap-3 rounded-lg border border-input p-3 ${b.activa ? "" : "opacity-60"}`}>
                <div className="min-w-0">
                  <p className="font-medium text-on-surface">{b.nombre} <span className="ml-1 rounded bg-accent px-1.5 text-[10px] text-muted-foreground">{b.canal}</span></p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {b.keywords.length ? `Si dice: ${b.keywords.join(", ")} → ` : "A todo mensaje → "}
                    {b.cuerpo || (plantillas.find((p) => p.id === b.plantillaId)?.cuerpo ?? "usa plantilla")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => void toggle(b)} className={`relative h-6 w-11 rounded-full ${b.activa ? "bg-green-500" : "bg-muted"}`} aria-label="Activar">
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${b.activa ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                  <button type="button" onClick={() => void eliminar(b)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-input p-4">
        <h3 className="mb-2 font-headline-md font-bold text-primary">Conexiones de canales</h3>
        {!estado ? (
          <p className="text-sm text-muted-foreground">Cargando estado…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 text-sm">
              {Object.entries(estado.variables).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <code className="text-xs text-on-surface-variant">{k}</code>
                  <span className={v ? "text-xs font-medium text-green-600 dark:text-green-400" : "text-xs text-muted-foreground"}>
                    {v ? "configurado" : "no definido"}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">Configura estas URLs como webhook (Meta → tu App → Webhooks):</p>
              <div>
                <p className="text-[11px] font-medium text-on-surface-variant">WhatsApp / Messenger</p>
                <code className="block break-all rounded bg-accent px-2 py-1 text-[11px]">{estado.webhooks.meta}</code>
              </div>
              <div>
                <p className="text-[11px] font-medium text-on-surface-variant">Gateway canónico (TikTok / otros)</p>
                <code className="block break-all rounded bg-accent px-2 py-1 text-[11px]">{estado.webhooks.canonico}</code>
              </div>
            </div>
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-headline-md font-bold text-primary">Nuevo bot</h3>
              <button type="button" onClick={() => setModal(null)}><X className="h-4 w-4" /></button>
            </div>
            {err && <p className="mb-2 rounded bg-destructive/10 px-2 py-1 text-sm text-destructive">{err}</p>}
            <div className="space-y-3 text-sm">
              <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Nombre * (ej. Respuesta de precio)" value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="h-9 rounded-lg border border-input bg-background px-2" value={modal.canal} onChange={(e) => setModal({ ...modal, canal: e.target.value })}>
                  {CANALES_BOT.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  className="h-9 rounded-lg border border-input bg-background px-2"
                  value={modal.plantillaId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const tpl = plantillas.find((p) => p.id === pid);
                    setModal({ ...modal, plantillaId: pid, cuerpo: tpl ? tpl.cuerpo : modal.cuerpo });
                  }}
                >
                  <option value="">(sin plantilla)</option>
                  {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Palabras clave separadas por coma (vacío = siempre)" value={modal.keywords} onChange={(e) => setModal({ ...modal, keywords: e.target.value })} />
              <textarea rows={3} className="w-full rounded-lg border border-input bg-background p-2" placeholder="Mensaje de respuesta…" value={modal.cuerpo} onChange={(e) => setModal({ ...modal, cuerpo: e.target.value })} />
              <button type="button" onClick={() => void guardar()} disabled={busy || !modal.nombre.trim() || !(modal.cuerpo.trim() || modal.plantillaId)} className="w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-40">
                {busy ? "Guardando…" : "Crear bot"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
