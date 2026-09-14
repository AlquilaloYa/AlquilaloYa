"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  CheckSquare,
  Mail,
  MessageCircle,
  Music2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Globe,
  Phone,
} from "lucide-react";

type Etapa = "ENTRANTE" | "DECISION" | "NEGOCIACION" | "FINAL" | "GANADO" | "PERDIDO";
type Canal = "MANUAL" | "WHATSAPP" | "MESSENGER" | "TIKTOK" | "WEB" | "LLAMADA" | "EMAIL";

interface Lead {
  id: string;
  nombre: string;
  apellido: string;
  canal: Canal;
  etapa: Etapa;
  servicio: string;
  monto: number;
  tags: string[];
  asignadoA: string;
  venceEl: string | null;
  notas: string;
  createdAt: string | null;
}

interface LeadForm {
  nombre: string;
  apellido: string;
  canal: Canal;
  etapa: Etapa;
  servicio: string;
  monto: string;
  tags: string;
  asignadoA: string;
  venceEl: string;
  notas: string;
}

const COLUMNAS: Array<{ value: Etapa; title: string; bar: string }> = [
  { value: "ENTRANTE", title: "Leads entrantes", bar: "bg-yellow-400" },
  { value: "DECISION", title: "Toma de decisiones", bar: "bg-purple-500" },
  { value: "NEGOCIACION", title: "Negociación del contrato", bar: "bg-green-400" },
  { value: "FINAL", title: "Decisión final", bar: "bg-blue-500" },
];

const CANALES: Array<{ value: Canal; label: string; Icon: typeof Mail; badge: string }> = [
  { value: "WHATSAPP", label: "WhatsApp", Icon: MessageCircle, badge: "bg-green-500" },
  { value: "MESSENGER", label: "Messenger", Icon: MessageCircle, badge: "bg-blue-500" },
  { value: "TIKTOK", label: "TikTok", Icon: Music2, badge: "bg-fuchsia-600" },
  { value: "WEB", label: "Web chat", Icon: Globe, badge: "bg-slate-500" },
  { value: "LLAMADA", label: "Llamada", Icon: Phone, badge: "bg-emerald-600" },
  { value: "EMAIL", label: "Email", Icon: Mail, badge: "bg-orange-500" },
  { value: "MANUAL", label: "Manual", Icon: Pencil, badge: "bg-zinc-500" },
];

const ETAPAS_CERRADAS: Etapa[] = ["GANADO", "PERDIDO"];

function canalConf(canal: Canal) {
  return CANALES.find((c) => c.value === canal) ?? CANALES[CANALES.length - 1]!;
}

function iniciales(nombre: string, apellido: string): string {
  return `${(nombre[0] ?? "").toUpperCase()}${(apellido[0] ?? "").toUpperCase()}` || "?";
}

function fmtMoneda(n: number): string {
  return n.toLocaleString("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-PE");
}

function venceInfo(venceEl: string | null): { texto: string; clase: string } {
  if (!venceEl) return { texto: "Sin tareas", clase: "text-amber-500" };
  const hoy = new Date();
  const dia = new Date(`${venceEl}T12:00:00`);
  const dias = Math.floor((dia.getTime() - hoy.setHours(12, 0, 0, 0)) / 86_400_000);
  if (dias < 0) return { texto: `${Math.abs(dias)}d`, clase: "text-red-500" };
  if (dias === 0) return { texto: "Hoy", clase: "text-green-500" };
  if (dias <= 3) return { texto: `${dias}d`, clase: "text-red-500" };
  return { texto: `${dias}d`, clase: "text-slate-400" };
}

const FORM_VACIO: LeadForm = {
  nombre: "",
  apellido: "",
  canal: "MANUAL",
  etapa: "ENTRANTE",
  servicio: "",
  monto: "",
  tags: "",
  asignadoA: "",
  venceEl: "",
  notas: "",
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [canalFiltro, setCanalFiltro] = useState<string>("all");
  const [verCerrados, setVerCerrados] = useState(false);
  const [modal, setModal] = useState<null | { modo: "crear" } | { modo: "editar"; lead: Lead }>(null);
  const [form, setForm] = useState<LeadForm>(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [colHover, setColHover] = useState<Etapa | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/leads");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudieron cargar los leads");
      }
      setLeads((await res.json()) as Lead[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const visibles = useMemo(
    () => leads.filter((l) => (verCerrados || !ETAPAS_CERRADAS.includes(l.etapa)) && (canalFiltro === "all" || l.canal === canalFiltro)),
    [leads, verCerrados, canalFiltro]
  );

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return visibles;
    return visibles.filter((l) =>
      [l.nombre, l.apellido, l.servicio, l.asignadoA, ...l.tags].join(" ").toLowerCase().includes(term)
    );
  }, [visibles, q]);

  const totalMonto = useMemo(() => filtrados.reduce((s, l) => s + (l.monto || 0), 0), [filtrados]);

  function openCrear() {
    setForm(FORM_VACIO);
    setModal({ modo: "crear" });
    setError(null);
  }

  function openEditar(lead: Lead) {
    setForm({
      nombre: lead.nombre,
      apellido: lead.apellido,
      canal: lead.canal,
      etapa: lead.etapa,
      servicio: lead.servicio,
      monto: String(lead.monto || ""),
      tags: lead.tags.join(", "),
      asignadoA: lead.asignadoA,
      venceEl: lead.venceEl ?? "",
      notas: lead.notas,
    });
    setModal({ modo: "editar", lead });
    setError(null);
  }

  function formPayload(): Record<string, unknown> {
    return {
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      canal: form.canal,
      etapa: form.etapa,
      servicio: form.servicio.trim(),
      monto: Number(form.monto) || 0,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      asignadoA: form.asignadoA.trim(),
      venceEl: form.venceEl || null,
      notas: form.notas,
    };
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = formPayload();
      const res =
        modal?.modo === "editar"
          ? await apiFetch("/api/leads", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: modal.lead.id, ...payload }) })
          : await apiFetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar el lead");
      }
      setModal(null);
      await load();
      setToast(modal?.modo === "editar" ? "Lead actualizado" : "Lead creado");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(lead: Lead) {
    if (!window.confirm(`¿Eliminar el lead ${lead.nombre} ${lead.apellido}? Esta acción no se puede deshacer.`)) return;
    const res = await apiFetch(`/api/leads?id=${encodeURIComponent(lead.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "No se pudo eliminar el lead");
      return;
    }
    await load();
    setToast("Lead eliminado");
  }

  async function moverA(leadId: string, etapa: Etapa) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, etapa } : l)));
    const res = await apiFetch("/api/leads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: leadId, etapa }),
    });
    if (!res.ok) {
      setLeads(prev);
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "No se pudo mover el lead");
    }
  }

  async function crearTarea(lead: Lead) {
    const fecha = lead.venceEl
      ? `${lead.venceEl}T12:00:00`
      : new Date(Date.now() + 2 * 86_400_000).toISOString();
    const res = await apiFetch("/api/tareas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: `[Lead] ${lead.nombre} ${lead.apellido} · ${lead.servicio || "seguimiento"}`.trim(),
        descripcion: `Desde Pipeline. Canal: ${canalConf(lead.canal).label}. Monto: ${fmtMoneda(lead.monto)}. Asignado: ${lead.asignadoA || "—"}.`,
        asignadoA: lead.asignadoA,
        fechaLimite: fecha,
        estado: "PENDIENTE",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "No se pudo crear la tarea");
      return;
    }
    setToast("Tarea creada en Work 123");
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Barra superior tipo pipeline */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
          <span className="font-headline-md font-bold text-on-surface">PIPELINE</span>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Búsqueda y filtro"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={canalFiltro}
            onChange={(e) => setCanalFiltro(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            aria-label="Filtrar por canal"
          >
            <option value="all">Todos los canales</option>
            {CANALES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setVerCerrados((v) => !v)}
            className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${verCerrados ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent"}`}
          >
            Cerrados
          </button>
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {filtrados.length} leads: <span className="font-semibold text-on-surface">{fmtMoneda(totalMonto)}</span>
          </span>
          <Link
            href="/automatizaciones"
            title="Configurar reglas y plantillas automáticas"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-on-surface transition-colors hover:bg-accent"
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            AUTOMATIZA
          </Link>
          <button
            type="button"
            onClick={openCrear}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            NUEVO LEAD
          </button>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {toast && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">{toast}</p>}

        {loading ? (
          <div className="flex items-center gap-3 py-16 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            Cargando pipeline…
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[...COLUMNAS, ...(verCerrados
              ? [
                  { value: "GANADO" as Etapa, title: "Ganados", bar: "bg-emerald-500" },
                  { value: "PERDIDO" as Etapa, title: "Perdidos", bar: "bg-rose-500" },
                ]
              : [])].map((col) => {
              const items = filtrados.filter((l) => l.etapa === col.value);
              return (
                <div
                  key={col.value}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setColHover(col.value);
                  }}
                  onDragLeave={() => setColHover((h) => (h === col.value ? null : h))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setColHover(null);
                    const id = dragId ?? e.dataTransfer.getData("text/plain");
                    if (id) void moverA(id, col.value);
                    setDragId(null);
                  }}
                  className={`flex w-[320px] shrink-0 flex-col rounded-xl p-2 transition-colors ${colHover === col.value ? "bg-primary/5 ring-1 ring-primary/30" : "bg-surface-container-low/50"}`}
                >
                  <div className="px-2 pb-2 pt-1">
                    <h2 className="font-headline-md text-sm font-bold uppercase tracking-wide text-on-surface">{col.title}</h2>
                    <div className={`mt-1.5 h-1 w-full rounded ${col.bar}`} />
                  </div>
                  <div className="flex min-h-[120px] flex-col gap-2">
                    {items.map((lead) => {
                      const cc = canalConf(lead.canal);
                      const v = venceInfo(lead.venceEl);
                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => {
                            setDragId(lead.id);
                          }}
                          className="group cursor-grab rounded-xl bg-surface-container-lowest p-3 shadow-sm ring-1 ring-black/5 active:cursor-grabbing dark:ring-white/10"
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="relative">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-surface-variant">
                                {iniciales(lead.nombre, lead.apellido)}
                              </div>
                              <span className={`absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full text-white ${cc.badge}`}>
                                <cc.Icon className="h-2.5 w-2.5" />
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-on-surface">
                                  {lead.nombre} {lead.apellido}
                                </p>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {lead.createdAt ? fmtFecha(lead.createdAt) : "—"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openEditar(lead)}
                                className="block max-w-full truncate text-left text-sm text-primary hover:underline"
                              >
                                {lead.servicio || "Sin servicio"}
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
                            <span className="text-[11px] text-muted-foreground">{fmtMoneda(lead.monto)}</span>
                            {lead.tags.map((tag) => (
                              <span key={tag} className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                                {tag}
                              </span>
                            ))}
                            {lead.asignadoA ? (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{lead.asignadoA}</span>
                            ) : null}
                            <span className={`ml-auto text-[11px] font-semibold ${v.clase}`}>{v.texto}</span>
                          </div>
                          <div className="mt-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button type="button" title="Crear tarea de seguimiento" onClick={() => void crearTarea(lead)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-primary">
                              <CheckSquare className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Editar lead" onClick={() => openEditar(lead)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-primary">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Eliminar lead" onClick={() => void eliminar(lead)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {items.length === 0 ? (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">Arrastra un lead aquí</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-headline-md text-lg font-bold text-primary">
              {modal.modo === "crear" ? "Nuevo lead" : `Editar lead · ${modal.lead.nombre}`}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Nombre *</span>
                <input className="h-9 w-full rounded-lg border border-input bg-background px-2" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Apellidos</span>
                <input className="h-9 w-full rounded-lg border border-input bg-background px-2" value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Canal</span>
                <select className="h-9 w-full rounded-lg border border-input bg-background px-2" value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as Canal })}>
                  {CANALES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Etapa</span>
                <select className="h-9 w-full rounded-lg border border-input bg-background px-2" value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value as Etapa })}>
                  {[...COLUMNAS.map((c) => ({ v: c.value, l: c.title })), { v: "GANADO", l: "Ganado" }, { v: "PERDIDO", l: "Perdido" }].map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Servicio / interés</span>
                <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder='Ej. "Departamento Miraflores" o "Renovación de contrato"' value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Monto estimado (S/)</span>
                <input type="number" min="0" step="0.01" className="h-9 w-full rounded-lg border border-input bg-background px-2" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Vence / seguimiento</span>
                <input type="date" className="h-9 w-full rounded-lg border border-input bg-background px-2" value={form.venceEl} onChange={(e) => setForm({ ...form, venceEl: e.target.value })} />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Etiquetas (separadas por coma)</span>
                <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Urgente, VIP, Demo, Venta adicional" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Asignado a</span>
                <input className="h-9 w-full rounded-lg border border-input bg-background px-2" placeholder="Nombre del asesor" value={form.asignadoA} onChange={(e) => setForm({ ...form, asignadoA: e.target.value })} />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Notas</span>
                <textarea rows={3} className="w-full rounded-lg border border-input bg-background p-2 text-sm" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => void load().then(() => setModal(null))}
                className="text-sm text-muted-foreground hover:underline"
              >
                Cancelar
              </button>
              <button type="button" onClick={() => void guardar()} disabled={saving || !form.nombre.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                {saving ? "Guardando…" : "Guardar lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
