"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { BarChart } from "@/components/bar-chart";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput } from "@/components/tabla-busqueda";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { Button } from "@contract/ui/components/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AccessControl, Permission } from "@contract/domain/rbac";
import { SCORE_BANDS, type ScoreBand } from "@contract/domain/scoring";
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";

interface Breakdown {
  base: number;
  penalizacionTardanza: number;
  penalizacionIncidencias: number;
  detalleIncidencias: { severidad: string; cantidad: number; penalizacion: number }[];
  cuotasPagadasConAtraso: number;
  cuotasVencidasPendientes: number;
  diasAtrasoPromedio: number;
  diasVencidoMaximo: number;
}

interface TenantScore {
  clienteId: string;
  nombre: string;
  documentoIdentidad: string;
  telefono: string | null;
  contratosActivos: number;
  departamentos: string[];
  score: number;
  band: { band: ScoreBand; label: string; min: number; max: number; color: string };
  breakdown: Breakdown;
}

interface Incident {
  id: string;
  clienteId: string;
  tipo: string;
  severidad: string;
  descripcion: string;
  departamentoCodigo: string | null;
  creadoPor: string | null;
  createdAt: string;
}

const TIPO_LABEL: Record<string, string> = {
  CONVIVENCIA: "Convivencia",
  PAGO: "Pago",
  DANOS: "Daños",
  OTRO: "Otro",
};

const SEVERIDAD_ORDER = ["LEVE", "MEDIA", "GRAVE"];

export default function ScoringPage() {
  const { user } = useAuth();
  const canManage = user
    ? AccessControl.forRole(user.role, user.additionalPermissions).can(
        Permission.SCORING_MANAGE,
      )
    : false;

  const [items, setItems] = useState<TenantScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TenantScore | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/scoring/tenants", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo cargar el scoring");
      const data = (await res.json()) as { items: TenantScore[] };
      setItems(data.items ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) =>
      `${t.nombre} ${t.documentoIdentidad}`.toLowerCase().includes(q),
    );
  }, [items, search]);

  const resumen = useMemo(() => {
    const total = items.length;
    if (total === 0) {
      return { total: 0, promedio: 0, criticos: 0, conIncidencias: 0 };
    }
    const suma = items.reduce((acc, t) => acc + t.score, 0);
    const criticos = items.filter((t) => t.score < 50).length;
    const conIncidencias = items.filter(
      (t) => t.breakdown.penalizacionIncidencias > 0,
    ).length;
    return {
      total,
      promedio: Math.round(suma / total),
      criticos,
      conIncidencias,
    };
  }, [items]);

  const distribucion = useMemo(
    () =>
      SCORE_BANDS.map((b) => ({
        label: b.label,
        value: items.filter((t) => t.band.band === b.band).length,
        color: b.color,
      })).reverse(),
    [items],
  );

  return (
    <DashboardShell>
      <div className="space-y-6 p-4 2xl:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-headline-lg text-on-surface">Scoring de inquilinos</h1>
            <p className="font-body-sm text-on-surface-variant">
              Puntaje de 1 a 100: −1 punto por día de retraso y penalización por reportes de clientes.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </Button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-error/40 bg-error-container/40 px-4 py-3 text-sm text-on-error-container">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Inquilinos evaluados" value={String(resumen.total)} />
          <KpiCard label="Puntaje promedio" value={`${resumen.promedio}`} />
          <KpiCard label="En riesgo o crítico" value={String(resumen.criticos)} tone="danger" />
          <KpiCard label="Con reportes" value={String(resumen.conIncidencias)} tone="warn" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Distribución por banda</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={distribucion} height={180} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Ranking</CardTitle>
            <BusquedaInput value={search} onChange={setSearch} placeholder="Buscar inquilino..." />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-on-surface-variant">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando...
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-on-surface-variant">
                No hay inquilinos con contrato firmado.
              </p>
            ) : (
              <TableScroll>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-on-surface-variant">
                      <th className="px-3 py-2 font-medium">Inquilino</th>
                      <th className="px-3 py-2 font-medium">Departamento</th>
                      <th className="px-3 py-2 font-medium">Documento</th>
                      <th className="px-3 py-2 font-medium">Contratos</th>
                      <th className="px-3 py-2 font-medium">Reportes</th>
                      <th className="w-64 px-3 py-2 font-medium">Puntaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr
                        key={t.clienteId}
                        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                        onClick={() => setSelected(t)}
                      >
                        <td className="px-3 py-2 text-on-surface">{t.nombre}</td>
                        <td className="px-3 py-2 text-on-surface-variant">
                          {t.departamentos.length > 0 ? t.departamentos.join(", ") : "—"}
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">{t.documentoIdentidad}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{t.contratosActivos}</td>
                        <td className="px-3 py-2 text-on-surface-variant">
                          {t.breakdown.penalizacionIncidencias > 0 ? "Sí" : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <ScoreBar score={t.score} color={t.band.color} label={t.band.label} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </CardContent>
        </Card>
      </div>

      {selected ? (
        <TenantPanel
          tenant={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </DashboardShell>
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "warn";
}) {
  const color =
    tone === "danger"
      ? "text-error"
      : tone === "warn"
        ? "text-[hsl(35_100%_45%)]"
        : "text-on-surface";
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="font-label-md uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className={`mt-1 font-display ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ScoreBar({
  score,
  color,
  label,
}: {
  score: number;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-variant">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right font-mono-label text-on-surface">{score}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {label}
      </span>
    </div>
  );
}

function TenantPanel({
  tenant,
  canManage,
  onClose,
  onChanged,
}: {
  tenant: TenantScore;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [tipo, setTipo] = useState("CONVIVENCIA");
  const [severidad, setSeveridad] = useState("MEDIA");
  const [descripcion, setDescripcion] = useState("");

  const loadIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    try {
      const res = await apiFetch(
        `/api/scoring/incidents?clienteId=${encodeURIComponent(tenant.clienteId)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { items: Incident[] };
        setIncidents(data.items ?? []);
      }
    } finally {
      setLoadingIncidents(false);
    }
  }, [tenant.clienteId]);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  async function submit() {
    setSaving(true);
    setFormError("");
    try {
      const res = await apiFetch("/api/scoring/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: tenant.clienteId,
          tipo,
          severidad,
          descripcion,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "No se pudo registrar el reporte");
      }
      setDescripcion("");
      setShowForm(false);
      await loadIncidents();
      onChanged();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await apiFetch(`/api/scoring/incidents/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadIncidents();
      onChanged();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-md text-on-surface">{tenant.nombre}</h2>
            <p className="font-body-sm text-on-surface-variant">
              {tenant.documentoIdentidad}
            </p>
            <p className="font-body-sm text-on-surface-variant">
              Departamento:{" "}
              {tenant.departamentos.length > 0 ? tenant.departamentos.join(", ") : "—"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-4 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="font-label-md uppercase tracking-wider text-on-surface-variant">
              Puntaje actual
            </span>
            <span className="font-display" style={{ color: tenant.band.color }}>
              {tenant.score}
            </span>
          </div>
          <ScoreBar score={tenant.score} color={tenant.band.color} label={tenant.band.label} />

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Metric label="Penalización reportes" value={`-${tenant.breakdown.penalizacionIncidencias}`} />
            <Metric
              label="Reportes registrados"
              value={String(
                tenant.breakdown.detalleIncidencias.reduce((s, d) => s + d.cantidad, 0),
              )}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h3 className="font-headline-md text-on-surface">Reportes de clientes</h3>
          {canManage ? (
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" /> Registrar
            </Button>
          ) : null}
        </div>

        {showForm ? (
          <div className="mt-3 space-y-3 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-on-surface-variant">Tipo</span>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="field h-10"
                >
                  {Object.entries(TIPO_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-on-surface-variant">Severidad</span>
                <select
                  value={severidad}
                  onChange={(e) => setSeveridad(e.target.value)}
                  className="field h-10"
                >
                  {SEVERIDAD_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-on-surface-variant">
                Descripción (qué ocurrió, con qué vecino, etc.)
              </span>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                className="field h-auto py-2"
              />
            </label>
            <p className="text-xs text-on-surface-variant">
              El departamento se toma automáticamente del contrato del cliente.
            </p>
            {formError ? <p className="text-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void submit()}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {loadingIncidents ? (
            <p className="py-4 text-center text-sm text-on-surface-variant">Cargando...</p>
          ) : incidents.length === 0 ? (
            <p className="py-4 text-center text-sm text-on-surface-variant">
              Sin reportes registrados.
            </p>
          ) : (
            incidents.map((inc) => (
              <div key={inc.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-on-surface">
                    {TIPO_LABEL[inc.tipo] ?? inc.tipo} · {inc.severidad}
                  </span>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Eliminar reporte"
                      onClick={() => void remove(inc.id)}
                    >
                      <Trash2 className="h-4 w-4 text-error" />
                    </Button>
                  ) : null}
                </div>
                {inc.departamentoCodigo ? (
                  <p className="text-xs text-on-surface-variant">
                    Dpto. {inc.departamentoCodigo}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-on-surface-variant">{inc.descripcion}</p>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  {new Date(inc.createdAt).toLocaleString("es-PE")}
                  {inc.creadoPor ? ` · ${inc.creadoPor}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="font-mono-label text-on-surface">{value}</p>
    </div>
  );
}
