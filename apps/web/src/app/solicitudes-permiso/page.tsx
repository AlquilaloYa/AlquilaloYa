"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AccessControl, Permission } from "@contract/domain/rbac";
import { AlertTriangle, Check, RefreshCw, Send, X } from "lucide-react";

interface PermissionRequest {
  id: string;
  userName: string;
  userRole: string;
  modulo: string;
  detalle: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  comentario: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const inputClass =
  "w-full rounded-md border border-outline bg-surface-container-lowest px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

export default function SolicitudesPermisoPage() {
  const { user } = useAuth();
  const access = user ? AccessControl.forRole(user.role, user.additionalPermissions) : null;
  const canApprove = access?.can(Permission.PERMISSION_REQUEST_APPROVE) ?? false;
  const canReview = access?.can(Permission.PERMISSION_REQUEST_READ) ?? false;
  const canRequest = access?.can(Permission.PERMISSION_REQUEST_CREATE) ?? false;
  const [items, setItems] = useState<PermissionRequest[]>([]);
  const [module, setModule] = useState("");
  const [detail, setDetail] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const response = await apiFetch("/api/solicitudes-permiso");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
    setItems(data.items);
  }, []);

  useEffect(() => {
    load().catch((cause: Error) => setError(cause.message));
  }, [load]);

  const createRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch("/api/solicitudes-permiso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: module, detalle: detail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
      setModule("");
      setDetail("");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resolveRequest = async (item: PermissionRequest, estado: "APROBADA" | "RECHAZADA") => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch("/api/solicitudes-permiso", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, estado, comentario: responses[item.id] ?? "" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="mb-1 font-headline-lg text-primary">Solicitudes de cambio</h2>
            <p className="font-body-sm text-on-surface-variant">
              {canReview
                ? "Bandeja privada para Developer y administradores. Solo el Developer puede aprobar cambios."
                : "Solicita autorización para un cambio. La aprobación cubre únicamente el cambio descrito."}
            </p>
          </div>
          <button onClick={() => load().catch((cause: Error) => setError(cause.message))} className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 text-error-container-foreground">
            <AlertTriangle className="h-5 w-5" /> {error}
          </div>
        ) : null}

        {canRequest ? (
          <section className="space-y-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-5">
            <h3 className="font-headline-md text-on-surface">Pedir autorización</h3>
            <label className="block font-label-md text-on-surface-variant">
              Módulo
              <input value={module} onChange={(event) => setModule(event.target.value)} maxLength={120} className={`${inputClass} mt-1`} placeholder="Ej.: Clientes" />
            </label>
            <label className="block font-label-md text-on-surface-variant">
              Cambio solicitado
              <textarea value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={2000} rows={3} className={`${inputClass} mt-1`} placeholder="Describe exactamente qué necesitas cambiar y por qué." />
            </label>
            <button onClick={createRequest} disabled={busy || !module.trim() || !detail.trim()} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground disabled:opacity-40">
              <Send className="h-4 w-4" /> Enviar solicitud
            </button>
          </section>
        ) : null}

        <section className="space-y-3">
          <h3 className="font-headline-md text-on-surface">{canApprove ? "Bandeja de aprobación" : "Mis solicitudes"}</h3>
          {items.length === 0 ? (
            <p className="rounded-lg bg-surface-container-lowest p-6 text-on-surface-variant">No hay solicitudes.</p>
          ) : items.map((item) => (
            <article key={item.id} className="space-y-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-label-md text-on-surface">{item.modulo} · {item.userName} ({item.userRole})</h4>
                <span className="rounded-full bg-surface-container-high px-2 py-1 font-mono-label text-on-surface">{item.estado}</span>
              </div>
              <p className="whitespace-pre-wrap text-on-surface-variant">{item.detalle}</p>
              <p className="font-mono-label text-on-surface-variant">{new Date(item.createdAt).toLocaleString()}</p>
              {item.estado === "PENDIENTE" && canApprove ? (
                <div className="space-y-2">
                  <textarea value={responses[item.id] ?? ""} onChange={(event) => setResponses({ ...responses, [item.id]: event.target.value })} maxLength={2000} rows={2} className={inputClass} placeholder="Mensaje para el solicitante; indica que la aprobación solo aplica a este cambio." />
                  <div className="flex gap-2">
                    <button onClick={() => resolveRequest(item, "APROBADA")} disabled={busy || !(responses[item.id] ?? "").trim()} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-label-md text-primary-foreground disabled:opacity-40"><Check className="h-4 w-4" /> Aprobar cambio solicitado</button>
                    <button onClick={() => resolveRequest(item, "RECHAZADA")} disabled={busy || !(responses[item.id] ?? "").trim()} className="flex items-center gap-2 rounded-md bg-error-container px-3 py-2 font-label-md text-error-container-foreground disabled:opacity-40"><X className="h-4 w-4" /> Rechazar</button>
                  </div>
                </div>
              ) : item.comentario ? (
                <p className="rounded bg-surface-container-low p-3 text-on-surface"><strong>Mensaje:</strong> {item.comentario}</p>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </DashboardShell>
  );
}
