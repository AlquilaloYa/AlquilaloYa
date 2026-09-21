"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AlertTriangle, Plus, RefreshCw, Send, Plug, Power, Settings2, ShieldCheck, Trash2, X } from "lucide-react";

interface Connector {
  id: string;
  type: string;
  provider: string;
  name: string;
  description: string | null;
  status: string;
  enabled: boolean;
  config: Record<string, unknown>;
  credentialId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConnectorResponse {
  items: Connector[];
  total: number;
}

const AUTH_TYPES = [
  { value: "NONE", label: "Sin auth" },
  { value: "API_KEY", label: "API Key" },
  { value: "BASIC", label: "Basic" },
  { value: "BEARER", label: "Bearer" },
  { value: "OAUTH2", label: "OAuth2" },
];

const METHODS = ["GET", "POST", "PUT", "PATCH"];

const CONNECTOR_TYPES = [
  { value: "REST", label: "REST genérico" },
  { value: "WHATSAPP", label: "WhatsApp Business" },
];

export default function IntegracionesPage() {
  const { user } = useAuth();
  const canManage = !!user && ["ADMIN", "SUPERVISOR"].includes(user.role);

  const [items, setItems] = useState<Connector[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<Record<string, string> | null>(null);

  const [form, setForm] = useState({
    name: "",
    provider: "",
    description: "",
    type: "REST" as "REST" | "WHATSAPP",
    baseUrl: "",
    method: "POST",
    path: "/webhook",
    authType: "NONE",
    apiKeyHeader: "X-API-Key",
    token: "",
    phoneNumberId: "",
    apiVersion: "v20.0",
    idempotencyKey: "",
    payloadJson: "{}",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/integrations");
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as ConnectorResponse;
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (
    id: string,
    actionName: string,
    body: Record<string, unknown> = {}
  ) => {
    setBusyId(id);
    setDispatchResult(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/integrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      if (actionName === "test") {
        const r = data.result ?? {};
        setDispatchResult({ type: r.ok ? "ok" : "error", text: r.error ?? r.providerMessage ?? (r.ok ? "Conexión OK" : "Fallo") });
      } else {
        setDispatchResult({ type: "ok", text: actionName === "dispatch" ? "Despacho enviado." : "Actualizado." });
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    setError(null);
    try {
      const isWhatsApp = form.type === "WHATSAPP";
      if (editId) {
        const res = await apiFetch(`/api/integrations/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: isWhatsApp
              ? { phoneNumberId: form.phoneNumberId, apiVersion: form.apiVersion || "v20.0" }
              : {
                  baseUrl: form.baseUrl,
                  method: form.method,
                  path: form.path,
                  authType: form.authType,
                  apiKeyHeader: form.apiKeyHeader,
                },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        if (form.token) {
          const resC = await apiFetch(`/api/integrations/${editId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "credentials",
              credentials: { authType: isWhatsApp ? "BEARER" : form.authType, token: form.token },
            }),
          });
          const dataC = await resC.json().catch(() => ({}));
          if (!resC.ok) throw new Error(dataC.error ?? `Error ${resC.status}`);
        }
      } else {
        const res = await apiFetch("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: form.type,
            provider: isWhatsApp ? form.provider || "whatsapp-cloud" : form.provider || "rest",
            name: form.name,
            description: form.description || null,
            config: isWhatsApp
              ? { phoneNumberId: form.phoneNumberId, apiVersion: form.apiVersion || "v20.0" }
              : {
                  baseUrl: form.baseUrl,
                  method: form.method,
                  path: form.path,
                  authType: form.authType,
                  apiKeyHeader: form.apiKeyHeader,
                },
            credentials:
              form.authType === "NONE" && !isWhatsApp
                ? null
                : {
                    authType: isWhatsApp ? "BEARER" : form.authType,
                    token: form.token || undefined,
                  },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      }
      setShowForm(false);
      setEditId(null);
      setForm((f) => ({
        ...f,
        name: "", provider: "", description: "", baseUrl: "", method: "POST",
        path: "/webhook", authType: "NONE", apiKeyHeader: "X-API-Key", token: "",
        phoneNumberId: "", apiVersion: "v20.0", idempotencyKey: "", payloadJson: "{}",
      }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este conector? Las credenciales asociadas se borrarán.")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/integrations/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const dispatch = async (id: string) => {
    const payload = form.payloadJson ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("El payload debe ser JSON válido.");
      return;
    }
    await action(id, "dispatch", {
      outboundAction: "DISPATCH",
      payload: parsed,
      idempotencyKey: form.idempotencyKey || undefined,
    });
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Integraciones</h2>
            <p className="font-body-sm text-on-surface-variant">
              Conectores externos (REST) · {total} configuración(es)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => load()}
              className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface transition-colors hover:bg-surface-variant"
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
            {canManage && (
              <button
                onClick={() => {
                  setEditId(null);
                  setShowForm((v) => !v);
                }}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Nuevo conector
              </button>
            )}
          </div>
        </div>

        {dispatchResult && (
          <div
            className={`flex items-center gap-2 rounded-lg p-4 font-body-sm ${
              dispatchResult.type === "ok"
                ? "bg-secondary-container text-secondary-container-foreground"
                : "bg-error-container text-error-container-foreground"
            }`}
          >
            <ShieldCheck className="h-5 w-5" />
            {dispatchResult.text}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        )}

        {showForm && canManage && (
          <div className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline-md text-on-surface">
                {editId ? "Configurar conector" : "Nuevo conector"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditId(null); }} aria-label="Cerrar">
                <X className="h-5 w-5 text-on-surface-variant" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tipo">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "REST" | "WHATSAPP" })} className={inputCls}>
                  {CONNECTOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Proveedor">
                <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder={form.type === "WHATSAPP" ? "whatsapp-cloud" : "sistema-asistencia"} className={inputCls} />
              </Field>
              <Field label="Nombre">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sistema de Asistencia" className={inputCls} />
              </Field>
              <Field label="Descripción" full>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción opcional" className={inputCls} />
              </Field>

              {form.type === "WHATSAPP" ? (
                <>
                  <Field label="Phone Number ID (WhatsApp Business)">
                    <input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} placeholder="11383872334..." className={inputCls} />
                  </Field>
                  <Field label="Versión API">
                    <select value={form.apiVersion} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} className={inputCls}>
                      {["v20.0", "v21.0", "v22.0"].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Token de acceso (Bearer)" full>
                    <input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="EAAG..." type="password" className={inputCls} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Base URL">
                    <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.ejemplo.com" className={inputCls} />
                  </Field>
                  <Field label="Método">
                    <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inputCls}>
                      {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="Ruta">
                    <input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/webhook" className={inputCls} />
                  </Field>
                  <Field label="Autenticación">
                    <select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })} className={inputCls}>
                      {AUTH_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </Field>
                  {form.authType === "API_KEY" && (
                    <Field label="Header de API Key">
                      <input value={form.apiKeyHeader} onChange={(e) => setForm({ ...form, apiKeyHeader: e.target.value })} placeholder="X-API-Key" className={inputCls} />
                    </Field>
                  )}
                  {form.authType !== "NONE" && (
                    <Field label={form.authType === "BASIC" ? "Usuario/Tenant" : "Token"} full>
                      <input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="Secreto" type="password" className={inputCls} />
                    </Field>
                  )}
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={create} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4" />
                {editId ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-container-lowest p-4 md:flex-row md:items-end">
            <label className="flex-1">
              <span className="mb-1 block font-label-md text-on-surface-variant">Payload del despacho (JSON)</span>
              <input
                value={form.payloadJson}
                onChange={(e) => setForm({ ...form, payloadJson: e.target.value })}
                placeholder='{"empleado":"Juan"}'
                className={`${inputCls} font-mono-text`}
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block font-label-md text-on-surface-variant">Idempotency key (opcional)</span>
              <input
                value={form.idempotencyKey}
                onChange={(e) => setForm({ ...form, idempotencyKey: e.target.value })}
                placeholder="clave-unica"
                className={inputCls}
              />
            </label>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando integraciones…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center font-body-sm text-on-surface-variant">
            No hay conectores configurados. {canManage ? "Crea uno para conectar un sistema externo." : ""}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((c) => (
              <div key={c.id} className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <BrandIcon provider={c.provider} name={c.name} />
                    <div>
                      <h3 className="font-headline-md text-on-surface">{c.name}</h3>
                      <p className="font-mono-label text-on-surface-variant">{c.provider} · {c.type}</p>
                      {c.description ? (
                        <p className="mt-1 font-body-sm text-on-surface-variant">{c.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono-label ${
                      c.enabled ? "bg-secondary-container text-secondary-container-foreground" : "bg-error-container text-error-container-foreground"
                    }`}
                  >
                    {c.enabled ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip label="Método" value={String((c.config as { method?: string }).method ?? "POST")} />
                  <Chip label="Base URL" value={String((c.config as { baseUrl?: string }).baseUrl ?? "-")} />
                  <Chip label="Auth" value={String((c.config as { authType?: string }).authType ?? "NONE")} />
                  {c.type === "WHATSAPP" ? (
                    <Chip label="Phone" value={String((c.config as { phoneNumberId?: string }).phoneNumberId ?? "-")} />
                  ) : null}
                  {c.credentialId ? <Chip label="Credencial" value="cifrada ✓" /> : null}
                </div>

                {canManage && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant/30 pt-3">
                    <button
                      onClick={() => {
                        const cfg = (c.config ?? {}) as Record<string, unknown>;
                        setForm((f) => ({
                          ...f,
                          name: c.name,
                          provider: c.provider,
                          description: (c.description as string) ?? "",
                          type: c.type === "WHATSAPP" ? "WHATSAPP" : "REST",
                          baseUrl: String(cfg.baseUrl ?? f.baseUrl),
                          method: String(cfg.method ?? "POST"),
                          path: String(cfg.path ?? "/webhook"),
                          authType: String(cfg.authType ?? "NONE"),
                          apiKeyHeader: String(cfg.apiKeyHeader ?? "X-API-Key"),
                          phoneNumberId: String(cfg.phoneNumberId ?? ""),
                          apiVersion: String(cfg.apiVersion ?? "v20.0"),
                          token: "",
                          payloadJson: f.payloadJson,
                        }));
                        setEditId(c.id);
                        setShowForm(true);
                      }}
                      disabled={busyId === c.id}
                      className={btnCls}
                      title="Configurar"
                    >
                      <Settings2 className="h-4 w-4" /> Configurar
                    </button>
                    <button onClick={() => action(c.id, "test")} disabled={busyId === c.id} className={btnCls}>
                      <ShieldCheck className="h-4 w-4" /> Probar
                    </button>
                    <button onClick={() => action(c.id, c.enabled ? "disable" : "enable")} disabled={busyId === c.id} className={btnCls}>
                      <Power className="h-4 w-4" /> {c.enabled ? "Desactivar" : "Activar"}
                    </button>
                    <button onClick={() => dispatch(c.id)} disabled={busyId === c.id} className={`${btnCls} bg-primary text-primary-foreground`}>
                      <Send className="h-4 w-4" /> Despachar
                    </button>
                    <button onClick={() => remove(c.id)} disabled={busyId === c.id} className={`${btnCls} bg-error-container text-error-container-foreground`}>
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

const inputCls =
  "w-full rounded-md border border-outline bg-surface-container-lowest px-3 py-2 font-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

const btnCls =
  "inline-flex items-center gap-2 rounded-md bg-surface-container-low px-3 py-1.5 font-label-md text-on-surface transition-colors hover:bg-surface-variant disabled:opacity-40";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? "md:col-span-2" : ""}>
      <span className="mb-1 block font-label-md text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-surface-container-high px-3 py-1 font-mono-label text-on-surface-variant">
      {label}: <span className="text-on-surface">{value}</span>
    </span>
  );
}

const BRAND_SLUGS: Record<string, string> = {
  gmail: "gmail",
  "whatsapp-cloud": "whatsapp",
  bcp: "bcp",
  bbva: "bbva",
  interbank: "interbank",
  telegram: "telegram",
  "google-calendar": "googlecalendar",
  "google-cloud": "googlecloud",
  "google-drive": "googledrive",
  "microsoft-drive": "microsoft",
};

const BRAND_COLORS: Record<string, string> = {
  gmail: "#EA4335",
  "whatsapp-cloud": "#25D366",
  bcp: "#0066B3",
  bbva: "#072146",
  interbank: "#00A3E0",
  telegram: "#229ED9",
  "google-calendar": "#4285F4",
  "google-cloud": "#4285F4",
  "google-drive": "#0F9D58",
  "microsoft-drive": "#5E5CE6",
};

function BrandIcon({ provider, name }: { provider: string; name: string }) {
  const slug = BRAND_SLUGS[provider];
  const color = BRAND_COLORS[provider] ?? "#163B65";
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-high font-headline-md font-bold"
      style={{ color }}
      title={`${name} · icono de marca`}
    >
      {slug ? (
        <img
          src={`https://cdn.simpleicons.org/${slug}/${encodeURIComponent(color.slice(1))}`}
          alt={`${name} logo`}
          className="h-7 w-7 object-contain"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.nextElementSibling?.removeAttribute("hidden");
          }}
        />
      ) : null}
      <span hidden={Boolean(slug)} aria-hidden={Boolean(slug)}>{initials || <Plug className="h-5 w-5" />}</span>
    </div>
  );
}