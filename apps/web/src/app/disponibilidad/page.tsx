"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { RefreshCw } from "lucide-react";

interface DisponibilidadDepartment {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  piso: number;
  disponibilidad: { disponible: false; fechaFin: string; dias: number } | null;
  ocupante: { nombres: string; apellidos: string | null; telefono: string | null } | null;
}

function DepartamentoCard({ dept }: { dept: DisponibilidadDepartment }) {
  const ocupado = Boolean(dept.disponibilidad);
  const plazo = dept.disponibilidad?.fechaFin;
  const fechaCorta = plazo
    ? new Date(`${plazo}T12:00:00`).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className={`flex min-w-[190px] flex-1 flex-col gap-2 rounded-xl border-2 p-4 ${
        ocupado
          ? "border-red-500 bg-red-500/10"
          : "border-green-600 bg-green-500/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-label text-base font-bold text-foreground">
          {dept.codigo}
        </span>
        <span
          className={`h-3 w-3 shrink-0 rounded-full ${
            ocupado ? "bg-red-500" : "bg-green-600"
          }`}
          title={ocupado ? "Ocupado" : "Disponible"}
        />
      </div>
      {ocupado ? (
        <>
          <p className="text-sm font-medium text-foreground">
            {dept.ocupante?.nombres} {dept.ocupante?.apellidos ?? ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {dept.ocupante?.telefono || "—"}
          </p>
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">
            {dept.disponibilidad!.dias === 0
              ? "Se libera hoy"
              : `Libre en ~${dept.disponibilidad!.dias} d · hasta ${fechaCorta}`}
          </p>
        </>
      ) : (
        <p className="text-sm font-semibold text-green-700 dark:text-green-500">
          Disponible
        </p>
      )}
    </div>
  );
}

function GrupoDepartamentos({
  titulo,
  departamentos,
  filas = 3,
}: {
  titulo: string;
  departamentos: DisponibilidadDepartment[];
  filas?: number;
}) {
  const porFila = Math.max(1, Math.ceil(departamentos.length / filas));
  const filasRender = useMemo(() => {
    const resultado: DisponibilidadDepartment[][] = [];
    for (let i = 0; i < departamentos.length; i += porFila) {
      resultado.push(departamentos.slice(i, i + porFila));
    }
    return resultado;
  }, [departamentos, porFila]);

  if (departamentos.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-headline-md text-lg font-bold text-foreground">
        {titulo}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {departamentos.length}
        </span>
      </h2>
      <div className="flex flex-col gap-3">
        {filasRender.map((fila, i) => (
          <div key={i} className="flex flex-wrap gap-3">
            {fila.map((dept) => (
              <DepartamentoCard key={dept.id} dept={dept} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DisponibilidadPage() {
  const [departamentos, setDepartamentos] = useState<DisponibilidadDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/departamentos");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as DisponibilidadDepartment[];
      setDepartamentos(data.filter((d) => !d.codigo.startsWith("EXT")));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { benavides, angamos } = useMemo(() => {
    const orden = [...departamentos].sort(
      (a, b) =>
        Number(a.numero.split("-")[0] || 0) - Number(b.numero.split("-")[0] || 0) ||
        a.codigo.localeCompare(b.codigo)
    );
    return {
      benavides: orden.filter((d) => d.codigo.startsWith("BEN")),
      angamos: orden.filter((d) => d.codigo.startsWith("ANG")),
    };
  }, [departamentos]);

  const ocupados = departamentos.filter((d) => d.disponibilidad).length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-headline-lg text-2xl font-bold text-foreground">
              Disponibilidad
            </h1>
            <p className="text-sm text-muted-foreground">
              {departamentos.length} departamentos ·{" "}
              <span className="font-semibold text-green-700 dark:text-green-500">
                {departamentos.length - ocupados} disponibles
              </span>{" "}
              ·{" "}
              <span className="font-semibold text-red-600 dark:text-red-400">
                {ocupados} ocupados
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : loading ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando disponibilidad…
          </div>
        ) : (
          <div className="space-y-8">
            <GrupoDepartamentos titulo="Benavides 2195" departamentos={benavides} filas={3} />
            <GrupoDepartamentos titulo="Angamos 170" departamentos={angamos} filas={1} />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}