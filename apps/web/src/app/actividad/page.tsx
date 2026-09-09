"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  ActivityModule,
  activityActionCatalog,
  activityActionLabels,
} from "@contract/domain/activity";

interface ActivityItem {
  id: string;
  timestamp: string;
  user: string | null;
  actorType: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  result: string;
  metadata: Record<string, unknown> | null;
}

interface ActivityResponse {
  items: ActivityItem[];
  total: number;
  limit: number;
  offset: number;
}

const ACTION_LABELS = activityActionLabels();
const ACTIONS = activityActionCatalog();
const MODULES = Object.values(ActivityModule);
const PAGE_SIZE = 20;

export default function ActividadPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<string>("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(
    () => [filter, moduleFilter, resultFilter, from, to].join("|"),
    [filter, moduleFilter, resultFilter, from, to]
  );

  const load = useCallback(
    async (nextOffset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (filter) params.set("action", filter);
        if (moduleFilter) params.set("module", moduleFilter);
        if (resultFilter) params.set("result", resultFilter);
        if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
        if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
        const res = await apiFetch(`/api/activity?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${res.status}`);
        }
        const data = (await res.json()) as ActivityResponse;
        setItems(data.items);
        setTotal(data.total);
        setOffset(data.offset);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [filter, moduleFilter, resultFilter, from, to]
  );

  useEffect(() => {
    load(0);
  }, [load, queryKey]);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Actividad</h2>
            <p className="font-body-sm text-on-surface-variant">
              Eventos del sistema · {total} registros
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filter}
              onChange={(e) => {
                setOffset(0);
                setFilter(e.target.value);
              }}
              className="rounded-md border border-outline bg-surface-container-lowest px-3 py-2 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas las acciones</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a] ?? a}
                </option>
              ))}
            </select>
            <select
              value={moduleFilter}
              onChange={(e) => {
                setOffset(0);
                setModuleFilter(e.target.value);
              }}
              className="rounded-md border border-outline bg-surface-container-lowest px-3 py-2 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todos los módulos</option>
              {MODULES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={resultFilter}
              onChange={(e) => {
                setOffset(0);
                setResultFilter(e.target.value);
              }}
              className="rounded-md border border-outline bg-surface-container-lowest px-3 py-2 font-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todo resultado</option>
              <option value="SUCCESS">Éxito</option>
              <option value="FAILURE">Fallo</option>
              <option value="DENIED">Denegado</option>
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setOffset(0);
                setFrom(e.target.value);
              }}
              className="rounded-md border border-outline bg-surface-container-lowest px-3 py-2 font-label-md text-on-surface"
              aria-label="Desde"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setOffset(0);
                setTo(e.target.value);
              }}
              className="rounded-md border border-outline bg-surface-container-lowest px-3 py-2 font-label-md text-on-surface"
              aria-label="Hasta"
            />
            <button
              onClick={() => load(offset)}
              className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface transition-colors hover:bg-surface-variant"
            >
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando actividad…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center font-body-sm text-on-surface-variant">
            Sin actividad que mostrar.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-high">
                  <tr className="font-label-md text-on-surface-variant">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Acción</th>
                    <th className="px-4 py-3">Módulo</th>
                    <th className="px-4 py-3">Entidad</th>
                    <th className="px-4 py-3">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {items.map((it) => (
                    <tr key={it.id} className="transition-colors hover:bg-surface-container-high">
                      <td className="whitespace-nowrap px-4 py-3 font-mono-label text-on-surface-variant">
                        {new Date(it.timestamp).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-body-sm text-on-surface">
                        {it.user ?? (it.actorType === "system" ? "Sistema" : it.actorType)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-body-sm text-on-surface">
                        {ACTION_LABELS[it.action] ?? it.action}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono-label text-on-surface-variant">
                        {it.module}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono-label text-on-surface-variant">
                        {it.entityType}:{it.entityId}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono-label ${
                            it.result === "SUCCESS"
                              ? "bg-secondary-container text-secondary-container-foreground"
                              : "bg-error-container text-error-container-foreground"
                          }`}
                        >
                          {it.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-outline-variant/50 px-4 py-3">
              <span className="font-mono-label text-on-surface-variant">
                {total === 0 ? "0" : `${offset + 1}-${Math.min(offset + items.length, total)}`} de {total}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => load(Math.max(offset - PAGE_SIZE, 0))}
                  className="rounded-md bg-surface-container-low px-3 py-1.5 font-label-md text-on-surface disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  disabled={offset + items.length >= total}
                  onClick={() => load(offset + PAGE_SIZE)}
                  className="rounded-md bg-surface-container-low px-3 py-1.5 font-label-md text-on-surface disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}