"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  Building2,
  IdCard,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";

type EstadoRh = "ACTIVO" | "INACTIVO" | "LICENCIA";

interface Employee {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  email: string;
  telefono: string;
  cargo: string;
  area: string;
  fechaIngreso: string | null;
  estado: EstadoRh;
  direccion: string;
  notas: string;
  creadoPor: string;
}

const ESTADOS: Array<{ value: EstadoRh; label: string; chip: string }> = [
  { value: "ACTIVO", label: "Activo", chip: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  { value: "INACTIVO", label: "Inactivo", chip: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70" },
  { value: "LICENCIA", label: "Licencia", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
];

function estadoChip(estado: string): string {
  return ESTADOS.find((s) => s.value === estado)?.chip ?? ESTADOS[1]?.chip ?? "";
}
function estadoLabel(estado: string): string {
  return ESTADOS.find((s) => s.value === estado)?.label ?? estado;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const EMPTY = {
  nombres: "",
  apellidos: "",
  dni: "",
  email: "",
  telefono: "",
  cargo: "",
  area: "",
  fechaIngreso: "",
  estado: "ACTIVO" as EstadoRh,
  direccion: "",
  notas: "",
};

export default function RecursosHumanosPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/rrhh");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setRows((await res.json()) as Employee[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.nombres, r.apellidos, r.dni, r.email, r.cargo, r.area].join(" ").toLowerCase().includes(q)
    );
  }, [rows, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }
  function openEdit(r: Employee) {
    setEditing(r);
    setForm({
      nombres: r.nombres,
      apellidos: r.apellidos,
      dni: r.dni,
      email: r.email,
      telefono: r.telefono,
      cargo: r.cargo,
      area: r.area,
      fechaIngreso: r.fechaIngreso ? r.fechaIngreso.slice(0, 10) : "",
      estado: r.estado,
      direccion: r.direccion,
      notas: r.notas,
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.nombres.trim()) {
      setError("Indica los nombres del colaborador");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/rrhh", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing?.id,
          ...form,
          fechaIngreso: form.fechaIngreso ? `${form.fechaIngreso}T00:00:00` : undefined,
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

  async function remove(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/rrhh?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Recursos Humanos</h2>
            <p className="font-body-sm text-on-surface-variant">
              Expedientes del personal · {rows.length} colaboradores
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface hover:bg-surface-variant">
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              Nuevo expediente
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, DNI, correo, cargo o área…"
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-3 font-body-md text-on-surface focus:border-primary focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando expedientes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center shadow-sm">
            <Users className="mx-auto mb-3 h-10 w-10 text-on-surface-variant" />
            <p className="font-body-md text-on-surface">
              {rows.length === 0 ? "Aún no hay expedientes. Crea el primero." : "Sin resultados para tu búsqueda."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => openEdit(r)}
                className="flex flex-col rounded-lg bg-surface-container-lowest p-4 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-headline-md text-primary">
                      {(r.nombres[0] ?? "").toUpperCase()}{(r.apellidos[0] ?? "").toUpperCase()}
                    </span>
                    <div>
                      <p className="font-label-md text-on-surface">{r.nombres} {r.apellidos}</p>
                      <p className="font-body-sm text-on-surface-variant">{r.cargo || "Sin cargo"}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono-label ${estadoChip(r.estado)}`}>
                    {estadoLabel(r.estado)}
                  </span>
                </div>
                <div className="space-y-1 font-mono-label text-on-surface-variant">
                  {r.area ? <p className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {r.area}</p> : null}
                  {r.dni ? <p className="flex items-center gap-1"><IdCard className="h-3 w-3" /> {r.dni}</p> : null}
                  {r.email ? <p className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" /> {r.email}</p> : null}
                  {r.telefono ? <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {r.telefono}</p> : null}
                  <p className="flex items-center gap-1"><User className="h-3 w-3" /> Ingreso: {fmtFecha(r.fechaIngreso)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-surface-container-low p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline-md text-primary">{editing ? "Editar expediente" : "Nuevo expediente"}</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombres *" value={form.nombres} onChange={(v) => setForm({ ...form, nombres: v })} />
                <Field label="Apellidos" value={form.apellidos} onChange={(v) => setForm({ ...form, apellidos: v })} />
                <Field label="DNI" value={form.dni} onChange={(v) => setForm({ ...form, dni: v })} />
                <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
                <Field label="Correo" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <Field label="Cargo" value={form.cargo} onChange={(v) => setForm({ ...form, cargo: v })} />
                <Field label="Área" value={form.area} onChange={(v) => setForm({ ...form, area: v })} />
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Fecha de ingreso</label>
                  <input type="date" value={form.fechaIngreso} onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block font-label-md text-on-surface">Estado</label>
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoRh })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none">
                    {ESTADOS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Dirección</label>
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block font-label-md text-on-surface">Notas del expediente</label>
                <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                {editing ? (
                  <button onClick={() => void remove(editing.id)} disabled={saving} className="flex items-center gap-2 rounded-md bg-error-container px-3 py-2 font-label-md text-error-container-foreground disabled:opacity-40">
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => setModalOpen(false)} className="rounded-md bg-surface-container-high px-4 py-2 font-label-md text-on-surface">Cancelar</button>
                  <button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground disabled:opacity-40">
                    <Pencil className="h-4 w-4" />
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block font-label-md text-on-surface">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-outline-variant bg-surface p-2 font-body-md text-on-surface focus:border-primary focus:outline-none" />
    </div>
  );
}