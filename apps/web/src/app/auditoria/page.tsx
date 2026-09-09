"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { activityActionCatalog, activityActionLabels } from "@contract/domain/activity";

interface AuditItem {
  id: string;
  usuario: string;
  fecha: string;
  accion: string;
  entidad: string;
  estadoAnterior: Record<string, unknown> | null;
  estadoNuevo: Record<string, unknown> | null;
  resultado: string;
  metadataSegura: Record<string, unknown> | null;
}

interface AuditResponse {
  items: AuditItem[];
  total: number;
  limit: number;
  offset: number;
}

const ACTION_LABELS = activityActionLabels();
const ACTIONS = activityActionCatalog();
const PAGE_SIZE = 20;

function JsonDiff({ value }: { value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) {
    return <span className="font-body-sm text-on-surface-variant">—</span>;
  }
  try {
    return (
      <pre className="whitespace-pre-wrap font-mono-label text-xs leading-snug text-on-surface">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  } catch {
    return <span className="font-body-sm text-on-surface-variant">—</span>;
  }
}

export default function AuditoriaPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [accion, setAccion] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (accion) params.set("accion", accion);
        if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
        if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
        const res = await apiFetch(`/api/audit?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${res.status}`);
        }
        const data = (await res.json()) as AuditResponse;
        setItems(data.items);
        setTotal(data.total);
        setOffset(data.offset);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [accion, from, to]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Auditoría</h2>
            <p className="font-body-sm text-on-surface-variant">
              Registro append-only de cambios de estado · {total} registros
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={accion}
              onChange={(e) => {
                setOffset(0);
                setAccion(e.target.value);
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
            Cargando auditoría…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center font-body-sm text-on-surface-variant">
            Sin registros de auditoría.
          </div>
        ) : (
          <>
            {items.map((it) => (
              <div key={it.id} className="rounded-lg bg-surface-container-lowest p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary-container px-2.5 py-0.5 font-mono-label text-primary-container-foreground">
                    {ACTION_LABELS[it.accion] ?? it.accion}
                  </span>
                  <span className="font-mono-label text-on-surface-variant">
                    {new Date(it.fecha).toLocaleString()}
                  </span>
                  <span className="font-body-sm text-on-surface-variant">por {it.usuario}</span>
                  <span className="font-mono-label text-on-surface-variant">({it.entidad})</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 font-mono-label ${
                      it.resultado === "SUCCESS"
                        ? "bg-secondary-container text-secondary-container-foreground"
                        : "bg-error-container text-error-container-foreground"
                    }`}
                  >
                    {it.resultado}
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <span className="font-label-md text-on-surface-variant uppercase tracking-wider">
                      Estado anterior
                    </span>
                    <div className="mt-1 rounded-md bg-surface-container-high p-3">
                      <JsonDiff value={it.estadoAnterior} />
                    </div>
                  </div>
                  <div>
                    <span className="font-label-md text-on-surface-variant uppercase tracking-wider">
                      Estado nuevo
                    </span>
                    <div className="mt-1 rounded-md bg-surface-container-high p-3">
                      <JsonDiff value={it.estadoNuevo} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-4">
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
          </>
        )}
      </div>
    </DashboardShell>
  );
}