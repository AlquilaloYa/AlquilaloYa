"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  FileText,
  Mail,
  MessageCircle,
  Music2,
  Plus,
  Search,
  Send,
  Globe,
  Phone,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

type Canal = "MANUAL" | "WHATSAPP" | "MESSENGER" | "TIKTOK" | "WEB" | "LLAMADA" | "EMAIL";
type EstadoConv = "ABIERTA" | "EN_ESPERA" | "CERRADA";

interface Conversacion {
  id: string;
  canal: Canal;
  contactoNombre: string;
  contactoTelefono: string;
  leadId: string | null;
  estado: EstadoConv;
  asignadoA: string;
  ultimoMensaje: string;
  ultimoMensajeEn: string | null;
  noLeidos: number;
  createdAt: string | null;
}

interface Mensaje {
  id: string;
  direccion: "INBOUND" | "OUTBOUND";
  autor: string;
  contenido: string;
  createdAt: string | null;
}

interface Plantilla {
  id: string;
  nombre: string;
  canal: string;
  cuerpo: string;
  activa: boolean;
}

interface LeadBrief {
  id: string;
  nombre: string;
  apellido: string;
}

const CANAL_CONF: Record<Canal, { label: string; Icon: typeof Mail; badge: string }> = {
  WHATSAPP: { label: "WhatsApp", Icon: MessageCircle, badge: "bg-green-500" },
  MESSENGER: { label: "Messenger", Icon: MessageCircle, badge: "bg-blue-500" },
  TIKTOK: { label: "TikTok", Icon: Music2, badge: "bg-fuchsia-600" },
  WEB: { label: "Web", Icon: Globe, badge: "bg-slate-500" },
  LLAMADA: { label: "Llamada", Icon: Phone, badge: "bg-emerald-600" },
  EMAIL: { label: "Email", Icon: Mail, badge: "bg-orange-500" },
  MANUAL: { label: "Manual", Icon: Pencil, badge: "bg-zinc-500" },
};

const ESTADO_CHIP: Record<EstadoConv, string> = {
  ABIERTA: "bg-green-500/15 text-green-700 dark:text-green-300",
  EN_ESPERA: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  CERRADA: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return `${(partes[0]?.[0] ?? "?").toUpperCase()}${(partes[1]?.[0] ?? "").toUpperCase()}`;
}

function haceRato(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - d) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `${hs}h`;
  return new Date(iso).toLocaleDateString("es-PE");
}

export default function MensajesPage() {
  const [convs, setConvs] = useState<Conversacion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [leads, setLeads] = useState<LeadBrief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [canalFiltro, setCanalFiltro] = useState<string>("all");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [nuevaConv, setNuevaConv] = useState(false);
  const [gestionPlantillas, setGestionPlantillas] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [nuevoCanal, setNuevoCanal] = useState<Canal>("MANUAL");
  const [nuevoAsignado, setNuevoAsignado] = useState("");
  const finRef = useRef<HTMLDivElement | null>(null);

  const loadConvs = useCallback(async () => {
    try {
      const res = await apiFetch("/api/conversaciones");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Error al cargar");
      setConvs((await res.json()) as Conversacion[]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadConvs();
    void (async () => {
      const [p, l] = await Promise.all([
        apiFetch("/api/plantillas").then((r) => (r.ok ? r.json() : [])),
        apiFetch("/api/leads").then((r) => (r.ok ? r.json() : [])),
      ]);
      setPlantillas(p as Plantilla[]);
      setLeads(
        ((l as Array<{ id: string; nombre: string; apellido: string }>) ?? []).map((x) => ({
          id: x.id,
          nombre: x.nombre,
          apellido: x.apellido,
        }))
      );
    })();
    const t = setInterval(() => void loadConvs(), 30_000);
    return () => clearInterval(t);
  }, [loadConvs]);

  const selected = useMemo(() => convs.find((c) => c.id === selectedId) ?? null, [convs, selectedId]);

  const loadMensajes = useCallback(async (id: string, marcar: boolean) => {
    const res = await apiFetch(`/api/conversaciones/${id}/mensajes${marcar ? "?read=1" : ""}`);
    if (res.ok) setMensajes((await res.json()) as Mensaje[]);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMensajes([]);
      return;
    }
    void loadMensajes(selectedId, true);
    void loadConvs();
  }, [selectedId, loadMensajes, loadConvs]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return convs
      .filter((c) => canalFiltro === "all" || c.canal === canalFiltro)
      .filter((c) =>
        !term ? true : `${c.contactoNombre} ${c.contactoTelefono} ${c.ultimoMensaje}`.toLowerCase().includes(term)
      );
  }, [convs, q, canalFiltro]);

  async function enviar() {
    if (!selected || !texto.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/conversaciones/${selected.id}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: texto.trim(), direccion: "OUTBOUND" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo enviar");
      setTexto("");
      await loadMensajes(selected.id, false);
      await loadConvs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function crearConv() {
    if (!nuevoNombre.trim()) return;
    const res = await apiFetch("/api/conversaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: undefined,
        contactoNombre: nuevoNombre.trim(),
        contactoTelefono: nuevoTelefono.trim(),
        canal: nuevoCanal,
        asignadoA: nuevoAsignado.trim(),
      }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "No se pudo crear");
      return;
    }
    const created = (await res.json()) as Conversacion;
    setNuevaConv(false);
    setNuevoNombre("");
    setNuevoTelefono("");
    setNuevoAsignado("");
    await loadConvs();
    setSelectedId(created.id);
  }

  async function actualizar(id: string, patch: Record<string, unknown>) {
    await apiFetch("/api/conversaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await loadConvs();
  }

  return (
    <DashboardShell>
      <div className="flex h-[calc(100vh-8.5rem)] min-h-[480px] flex-col rounded-xl bg-surface-container-lowest shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/40 p-3 dark:border-white/10">
          <h2 className="mr-2 font-headline-md font-bold text-primary">Bandeja de mensajes</h2>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar contacto o mensaje…"
              className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-sm"
            />
          </div>
          <select
            value={canalFiltro}
            onChange={(e) => setCanalFiltro(e.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="all">Todos los canales</option>
            {Object.entries(CANAL_CONF).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setGestionPlantillas(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm hover:bg-accent"
            title="Administrar plantillas de mensajes"
          >
            <FileText className="h-4 w-4" /> Plantillas
          </button>
          <button
            type="button"
            onClick={() => setNuevaConv(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nueva
          </button>
        </div>

        {error && <p className="border-b border-outline-variant/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">{error}</p>}

        <div className="flex min-h-0 flex-1">
          {/* Lista de conversaciones */}
          <div className="w-full max-w-xs shrink-0 overflow-y-auto border-r border-outline-variant/40 dark:border-white/10">
            {visibles.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Sin conversaciones. Crea una con “Nueva” o recibe mensajes por el webhook.</p>
            ) : (
              visibles.map((c) => {
                const cc = CANAL_CONF[c.canal] ?? CANAL_CONF.MANUAL;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-start gap-2.5 border-b border-outline-variant/30 p-3 text-left transition-colors hover:bg-accent dark:border-white/5 ${selectedId === c.id ? "bg-accent" : ""}`}
                  >
                    <span className="relative">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {iniciales(c.contactoNombre)}
                      </span>
                      <span className={`absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full text-white ${cc.badge}`}>
                        <cc.Icon className="h-2.5 w-2.5" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-on-surface">{c.contactoNombre || "Sin nombre"}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{haceRato(c.ultimoMensajeEn)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">{c.ultimoMensaje || "—"}</span>
                        {c.noLeidos > 0 ? (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {c.noLeidos}
                          </span>
                        ) : null}
                      </span>
                      {c.asignadoA ? <span className="mt-0.5 block truncate text-[10px] text-primary">Asignado: {c.asignadoA}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Hilo */}
          <div className="flex min-w-0 flex-1 flex-col">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Selecciona una conversación para responder
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/40 p-2.5 text-sm dark:border-white/10">
                  <span className="font-semibold text-on-surface">{selected.contactoNombre}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_CHIP[selected.estado] ?? ESTADO_CHIP.ABIERTA}`}>
                    {selected.estado === "ABIERTA" ? "Abierta" : selected.estado === "EN_ESPERA" ? "En espera" : "Cerrada"}
                  </span>
                  <select
                    className="h-7 rounded border border-input bg-background px-1 text-xs"
                    value={selected.estado}
                    onChange={(e) => void actualizar(selected.id, { estado: e.target.value })}
                    aria-label="Estado"
                  >
                    <option value="ABIERTA">Abierta</option>
                    <option value="EN_ESPERA">En espera</option>
                    <option value="CERRADA">Cerrada</option>
                  </select>
                  <input
                    className="h-7 w-36 rounded border border-input bg-background px-2 text-xs"
                    placeholder="Asignado a…"
                    defaultValue={selected.asignadoA}
                    onBlur={(e) => {
                      if (e.target.value !== selected.asignadoA) void actualizar(selected.id, { asignadoA: e.target.value });
                    }}
                  />
                  <select
                    className="h-7 max-w-44 rounded border border-input bg-background px-1 text-xs"
                    value={selected.leadId ?? ""}
                    onChange={(e) => void actualizar(selected.id, { leadId: e.target.value || null })}
                    aria-label="Lead vinculado"
                  >
                    <option value="">Sin lead</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>{l.nombre} {l.apellido}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {mensajes.map((m) => (
                    <div key={m.id} className={`flex ${m.direccion === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                          m.direccion === "OUTBOUND"
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-accent text-on-surface"
                        }`}
                      >
                        {m.direccion === "OUTBOUND" && m.autor ? (
                          <span className="mb-0.5 block text-[10px] opacity-80">{m.autor}</span>
                        ) : null}
                        <span className="whitespace-pre-wrap break-words">{m.contenido}</span>
                        <span className={`mt-0.5 block text-right text-[10px] ${m.direccion === "OUTBOUND" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {m.createdAt ? new Date(m.createdAt).toLocaleString("es-PE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={finRef} />
                </div>
                <div className="border-t border-outline-variant/40 p-2.5 dark:border-white/10">
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {plantillas
                      .filter((p) => p.activa && (p.canal === "TODOS" || p.canal === selected.canal))
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setTexto((t) => (t ? `${t}\n${p.cuerpo}` : p.cuerpo))}
                          className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                          title={p.cuerpo}
                        >
                          {p.nombre}
                        </button>
                      ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void enviar();
                        }
                      }}
                      placeholder={`Responder a ${selected.contactoNombre}… (Enter envía)`}
                      className="flex-1 resize-none rounded-lg border border-input bg-background p-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void enviar()}
                      disabled={enviando || !texto.trim()}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" /> Enviar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal nueva conversación */}
      {nuevaConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setNuevaConv(false)}>
          <div className="w-full max-w-sm rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-headline-md font-bold text-primary">Nueva conversación</h3>
              <button type="button" onClick={() => setNuevaConv(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Nombre del contacto *" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
              <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Teléfono / correo" value={nuevoTelefono} onChange={(e) => setNuevoTelefono(e.target.value)} />
              <select className="h-9 w-full rounded-lg border border-input bg-background px-2" value={nuevoCanal} onChange={(e) => setNuevoCanal(e.target.value as Canal)}>
                {Object.entries(CANAL_CONF).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Asignado a" value={nuevoAsignado} onChange={(e) => setNuevoAsignado(e.target.value)} />
              <button type="button" onClick={() => void crearConv()} disabled={!nuevoNombre.trim()} className="w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-40">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {gestionPlantillas && (
        <GestionPlantillas
          plantillas={plantillas}
          setPlantillas={setPlantillas}
          onCerrar={() => setGestionPlantillas(false)}
        />
      )}
    </DashboardShell>
  );
}

function GestionPlantillas({
  plantillas,
  setPlantillas,
  onCerrar,
}: {
  plantillas: Plantilla[];
  setPlantillas: (p: Plantilla[]) => void;
  onCerrar: () => void;
}) {
  const [editando, setEditando] = useState<null | { id?: string; nombre: string; canal: string; cuerpo: string }>(null);
  const [err, setErr] = useState<string | null>(null);

  async function recargar() {
    const res = await apiFetch("/api/plantillas");
    if (res.ok) setPlantillas((await res.json()) as Plantilla[]);
  }

  async function guardar() {
    if (!editando || !editando.nombre.trim() || !editando.cuerpo.trim()) return;
    setErr(null);
    const res = await apiFetch("/api/plantillas", {
      method: editando.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editando),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? "No se pudo guardar");
      return;
    }
    setEditando(null);
    await recargar();
  }

  async function eliminar(p: Plantilla) {
    if (!window.confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return;
    await apiFetch(`/api/plantillas?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    await recargar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-headline-md font-bold text-primary">Plantillas de mensajes</h3>
          <button type="button" onClick={onCerrar}><X className="h-4 w-4" /></button>
        </div>
        {err && <p className="mb-2 rounded bg-destructive/10 px-2 py-1 text-sm text-destructive">{err}</p>}
        <div className="space-y-2">
          {plantillas.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay plantillas.</p> : null}
          {plantillas.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 rounded-lg border border-input p-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{p.nombre} <span className="ml-1 rounded bg-accent px-1.5 text-[10px] text-muted-foreground">{p.canal}</span></p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.cuerpo}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => setEditando({ id: p.id, nombre: p.nombre, canal: p.canal, cuerpo: p.cuerpo })}><Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" /></button>
                <button type="button" onClick={() => void eliminar(p)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
              </div>
            </div>
          ))}
        </div>
        {editando ? (
          <div className="mt-4 space-y-2 rounded-lg border border-primary/40 p-3 text-sm">
            <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Nombre de la plantilla" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
            <select className="h-9 w-full rounded-lg border border-input bg-background px-2" value={editando.canal} onChange={(e) => setEditando({ ...editando, canal: e.target.value })}>
              <option value="TODOS">Todos los canales</option>
              {Object.entries(CANAL_CONF).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <textarea rows={4} className="w-full rounded-lg border border-input bg-background p-2" placeholder="Cuerpo del mensaje…" value={editando.cuerpo} onChange={(e) => setEditando({ ...editando, cuerpo: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditando(null)} className="rounded-lg border border-input px-3 py-1.5 text-xs">Cancelar</button>
              <button type="button" onClick={() => void guardar()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Guardar</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setEditando({ nombre: "", canal: "TODOS", cuerpo: "" })} className="mt-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <Plus className="h-4 w-4" /> Nueva plantilla
          </button>
        )}
      </div>
    </div>
  );
}
