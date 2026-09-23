"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AccessControl, Permission, USER_ROLES } from "@contract/domain/rbac";
import type { UserRole } from "@contract/domain/rbac";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  SUPERVISOR: "Supervisor",
  AUDITOR: "Auditor",
  FIRMANTE: "Firmante",
};

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: "bg-primary-container text-primary-container-foreground",
  SUPERVISOR: "bg-secondary-container text-secondary-container-foreground",
  OPERADOR: "bg-surface-container-high text-on-surface",
  AUDITOR: "bg-surface-container-high text-on-surface-variant",
  FIRMANTE: "bg-surface-container-high text-on-surface-variant",
};

const inputCls =
  "w-full rounded-md border border-outline bg-surface-container-lowest px-3 py-2 font-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

interface CreatedResult {
  email: string;
  password?: string;
  message?: string;
}

export default function UsuariosConfiguracionPage() {
  const { user } = useAuth();
  const canManage = !!user && AccessControl.forRole(user.role).can(Permission.USER_MANAGE);

  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "OPERADOR" as UserRole,
    active: true,
    password: "",
  });

  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await apiFetch(`/api/users?${params.toString()}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as { items: UserItem[] };
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  const resetForm = () => {
    setForm({ name: "", email: "", role: "OPERADOR", active: true, password: "" });
    setEditId(null);
    setFormError(null);
  };

  const save = async () => {
    setFormError(null);
    setBusy(true);
    try {
      if (editId) {
        const res = await apiFetch(`/api/users/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            role: form.role,
            active: form.active,
            ...(form.password ? { password: form.password } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        setCreated({
          email: form.email,
          message: form.password ? "Contraseña actualizada." : "Usuario actualizado.",
        });
      } else {
        const res = await apiFetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        setCreated({
          email: data.user.email,
          ...(data.passwordGenerated ? { password: data.password } : {}),
          ...(data.passwordGenerated
            ? {}
            : { message: "Usuario creado con la contraseña indicada." }),
        });
      }
      setShowForm(false);
      resetForm();
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (item: UserItem) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/users/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (item: UserItem) => {
    setForm({
      name: item.name,
      email: item.email,
      role: item.role,
      active: item.active,
      password: "",
    });
    setEditId(item.id);
    setShowForm(true);
  };

  const deactivate = async (item: UserItem) => {
    if (!confirm(`¿Desactivar a ${item.name}? Dejará de poder iniciar sesión.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/users/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Usuarios</h2>
            <p className="font-body-sm text-on-surface-variant">
              Crea usuarios del sistema y asígnales roles · {items.length} usuario(s)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o email…"
              aria-label="Buscar usuario"
              className={`${inputCls} w-64`}
            />
            <button
              onClick={() => load()}
              className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface transition-colors hover:bg-surface-variant"
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
            {canManage ? (
              <button
                onClick={() => {
                  resetForm();
                  setCreated(null);
                  setShowForm((v) => !v);
                }}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground transition-opacity hover:opacity-90"
              >
                <UserPlus className="h-4 w-4" />
                Nuevo usuario
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        ) : null}

        {created ? (
          <div className="rounded-lg border border-outline-variant/50 bg-secondary-container p-5 font-body-sm text-secondary-container-foreground">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="flex items-center gap-2 font-label-md">
                  <ShieldCheck className="h-4 w-4" />
                  {created.email}
                </p>
                {created.password ? (
                  <CopyField label="Contraseña generada (no se volverá a mostrar)" value={created.password} />
                ) : (
                  <p>{created.message}</p>
                )}
              </div>
              <button onClick={() => setCreated(null)} aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : null}

        {showForm && canManage ? (
          <div className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline-md text-on-surface">
                {editId ? "Editar usuario" : "Nuevo usuario"}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5 text-on-surface-variant" />
              </button>
            </div>
            {formError ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-error-container p-3 font-body-sm text-error-container-foreground">
                <AlertTriangle className="h-4 w-4" />
                {formError}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nombre completo">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Juan Pérez"
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="juan@sistema.com"
                  type="email"
                  className={inputCls}
                />
              </Field>
              <Field label="Rol">
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className={inputCls}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]} ({r})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={editId ? "Nueva contraseña (opcional)" : "Contraseña (déjala vacía para generar una)"}>
                <input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editId ? "Dejar vacío = no cambiar" : "Dejar vacío = auto-generar"}
                  type="password"
                  className={inputCls}
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-label-md text-on-surface">Usuario activo</span>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface hover:bg-surface-variant"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {editId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editId ? "Guardar" : "Crear usuario"}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando usuarios…
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center font-body-sm text-on-surface-variant">
            Sin usuarios. {canManage ? "Crea el primero con «Nuevo usuario»." : ""}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-high font-label-md text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Creado</th>
                    {canManage ? <th className="px-4 py-3 text-right">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {sorted.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-surface-container-high">
                      <td className="whitespace-nowrap px-4 py-3 font-body-sm text-on-surface">
                        {item.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono-label text-on-surface-variant">
                        {item.email}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 font-mono-label ${ROLE_COLORS[item.role]}`}>
                          {ROLE_LABELS[item.role] ?? item.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono-label ${
                            item.active
                              ? "bg-secondary-container text-secondary-container-foreground"
                              : "bg-error-container text-error-container-foreground"
                          }`}
                        >
                          {item.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono-label text-on-surface-variant">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      {canManage ? (
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => openEdit(item)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md bg-surface-container-low px-2 py-1.5 font-label-md text-on-surface hover:bg-surface-variant disabled:opacity-40"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" /> Editar
                            </button>
                            <button
                              onClick={() => toggleActive(item)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md bg-surface-container-low px-2 py-1.5 font-label-md text-on-surface hover:bg-surface-variant disabled:opacity-40"
                              title={item.active ? "Desactivar" : "Reactivar"}
                            >
                              <KeyRound className="h-4 w-4" /> {item.active ? "Desactivar" : "Reactivar"}
                            </button>
                            {item.active ? (
                              <button
                                onClick={() => deactivate(item)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded-md bg-error-container px-2 py-1.5 font-label-md text-error-container-foreground hover:opacity-90 disabled:opacity-40"
                                title="Eliminar (desactivar)"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-label-md text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin permiso de portapapeles: el usuario puede copiarla manualmente */
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div>
        <p className="font-label-md text-secondary-container-foreground">{label}</p>
        <code className="mt-1 block rounded bg-surface-container-high px-3 py-2 font-mono-label text-on-surface">
          {value}
        </code>
      </div>
      <button
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-md bg-surface-container-low px-2.5 py-1.5 font-label-md text-on-surface hover:bg-surface-variant"
        title="Copiar"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copiada" : "Copiar"}
      </button>
    </div>
  );
}