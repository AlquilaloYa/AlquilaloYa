"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Link2Off,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

type GEvent = {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink?: string;
};

const DIA_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Clave yyyy-mm-dd local de un evento de Google (dateTime ISO o date YYYY-MM-DD). */
function eventKey(ev: GEvent): string {
  if (ev.allDay) return ev.start.slice(0, 10);
  return dayKey(new Date(ev.start));
}

function fmtHora(ev: GEvent): string {
  if (ev.allDay) return "Todo el día";
  return new Date(ev.start).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

export default function AgendaPage() {
  const [configured, setConfigured] = useState(true);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string>(dayKey(new Date()));

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha: "", hora: "09:00", allDay: false });

  const load = useCallback(async () => {
    setError(null);
    try {
      const min = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
      const max = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const res = await apiFetch(`/api/agenda?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as { configured: boolean; connected: boolean; events: GEvent[] };
      setConfigured(data.configured);
      setConnected(data.connected);
      setEvents(data.events ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("connected") === "1") setBanner("Google Calendar conectado correctamente.");
    else if (q.get("error")) setBanner(`No se pudo conectar Google: ${q.get("error")}`);
    if (q.get("connected") || q.get("error")) window.history.replaceState({}, "", "/agenda");
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, GEvent[]>();
    for (const ev of events) {
      const key = eventKey(ev);
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const eventsOfDay = eventsByDay.get(selectedDay) ?? [];

  const calendarCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= count; d++) cells.push(d);
    return cells;
  }, [cursor]);

  const todayKey = dayKey(new Date());

  function changeMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  function openCreate() {
    setForm({ titulo: "", descripcion: "", fecha: selectedDay, hora: "09:00", allDay: false });
    setModalOpen(true);
  }

  async function saveEvent() {
    if (!form.titulo.trim()) {
      setError("Indica el título del evento");
      return;
    }
    if (!form.fecha) {
      setError("Indica la fecha");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let start: string;
      let end: string | undefined;
      if (form.allDay) {
        start = form.fecha;
        end = form.fecha;
      } else {
        const hora = form.hora.split(":");
        const h = Number(hora[0]) || 0;
        const min = Number(hora[1]) || 0;
        const partes = form.fecha.split("-");
        const s = new Date(Number(partes[0]), (Number(partes[1]) || 1) - 1, Number(partes[2]) || 1, h, min, 0);
        const e = new Date(s.getTime() + 60 * 60 * 1000);
        start = s.toISOString();
        end = e.toISOString();
      }
      const res = await apiFetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: form.titulo,
          description: form.descripcion,
          start,
          end,
          allDay: form.allDay,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    setError(null);
    try {
      const res = await apiFetch(`/api/agenda?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function disconnect() {
    setError(null);
    try {
      await apiFetch("/api/agenda/google/disconnect", { method: "POST" });
      setConnected(false);
      setEvents([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Agenda</h2>
            <p className="font-body-sm text-on-surface-variant">
              Tu calendario personal sincronizado con Google Calendar
            </p>
          </div>
          {connected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void load()}
                className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface hover:bg-surface-variant"
              >
                <RefreshCw className="h-4 w-4" />
                Refrescar
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Nueva cita
              </button>
            </div>
          ) : null}
        </div>

        {banner ? (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 font-body-sm text-primary">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {banner}
          </div>
        ) : null}
        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : null}

        {!configured ? (
          <div className="rounded-lg bg-surface-container-lowest p-6 text-center shadow-sm">
            <CalendarClock className="mx-auto mb-3 h-10 w-10 text-on-surface-variant" />
            <p className="font-body-md text-on-surface">Google Calendar no está configurado en el servidor.</p>
            <p className="mt-1 font-body-sm text-on-surface-variant">
              Define GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI en el archivo .env para activar la agenda.
            </p>
          </div>
        ) : !connected ? (
          <div className="rounded-lg bg-surface-container-lowest p-8 text-center shadow-sm">
            <CalendarClock className="mx-auto mb-3 h-12 w-12 text-primary" />
            <h3 className="font-headline-md text-primary mb-1">Conecta tu Google Calendar</h3>
            <p className="mx-auto max-w-md font-body-sm text-on-surface-variant mb-5">
              Vincula tu cuenta de Google para ver y gestionar tu agenda personal. Cada usuario tiene su propia agenda.
            </p>
            <a
              href="/api/agenda/google/authorize"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-label-md text-primary-foreground hover:opacity-90"
            >
              <LogIn className="h-4 w-4" />
              Conectar con Google
            </a>
          </div>
        ) : (
          <>
            <section className="rounded-lg bg-surface-container-lowest p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-headline-md text-primary capitalize">
                  {cursor.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}
                </h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeMonth(-1)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Mes anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="rounded-md bg-surface-container-high px-3 py-1.5 font-label-md text-on-surface">
                    Hoy
                  </button>
                  <button onClick={() => changeMonth(1)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Mes siguiente">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button onClick={() => void disconnect()} className="ml-2 flex items-center gap-1 rounded-md bg-error-container px-3 py-1.5 font-label-md text-error-container-foreground" title="Desconectar Google">
                    <Link2Off className="h-4 w-4" />
                    Desconectar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {DIA_SEMANA.map((d) => (
                  <div key={d} className="pb-1 text-center font-mono-label text-on-surface-variant">
                    {d}
                  </div>
                ))}
                {calendarCells.map((day, i) => {
                  if (day === null) return <div key={`blank-${i}`} />;
                  const key = dayKey(new Date(cursor.getFullYear(), cursor.getMonth(), day));
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      className={`min-h-[72px] rounded-md border p-1 text-left transition-colors ${
                        isSelected ? "border-primary bg-surface-container-low" : "border-transparent hover:bg-surface-container-low"
                      } ${isToday ? "ring-1 ring-primary" : ""}`}
                    >
                      <span className={`block px-1 font-mono-label ${isToday ? "font-bold text-primary" : "text-on-surface-variant"}`}>
                        {day}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <div key={ev.id} className="truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] font-medium text-primary" title={`${fmtHora(ev)} · ${ev.summary}`}>
                            {fmtHora(ev)} {ev.summary}
                          </div>
                        ))}
                        {dayEvents.length > 3 ? (
                          <div className="px-1 text-[10px] font-medium text-on-surface-variant">+{dayEvents.length - 3} más</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg bg-surface-container-lowest p-4 shadow-sm">
              <h3 className="font-headline-md text-primary mb-3">
                Citas del {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long" })}
              </h3>
              {eventsOfDay.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant">Sin citas este día.</p>
              ) : (
                <ul className="space-y-2">
                  {eventsOfDay.map((ev) => (
                    <li key={ev.id} className="flex items-start justify-between gap-3 rounded-md border border-outline-variant/40 p-3">
                      <div>
                        <p className="font-label-md text-on-surface">
                          <span className="text-primary">{fmtHora(ev)}</span> · {ev.summary}
                        </p>
                        {ev.description ? <p className="mt-0.5 font-body-sm text-on-surface-variant">{ev.description}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {ev.htmlLink ? (
                          <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high" title="Abrir en Google">
                            <CalendarClock className="h-4 w-4" />
                          </a>
                        ) : null}
                        <button onClick={() => void removeEvent(ev.id)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error" title="Eliminar">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-surface-container-low p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline-md text-primary">Nueva cita</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Título *</label>
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" placeholder="Ej. Reunión con cliente" />
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Descripción</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" placeholder="Detalle opcional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Fecha *</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Hora</label>
                  <input type="time" value={form.hora} disabled={form.allDay} onChange={(e) => setForm({ ...form, hora: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none disabled:opacity-50" />
                </div>
              </div>
              <label className="flex items-center gap-2 font-body-sm text-on-surface">
                <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} className="h-4 w-4 rounded" />
                Todo el día
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setModalOpen(false)} className="rounded-md bg-surface-container-high px-4 py-2 font-label-md text-on-surface">Cancelar</button>
                <button onClick={() => void saveEvent()} disabled={saving} className="rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground disabled:opacity-40">{saving ? "Guardando…" : "Guardar"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}