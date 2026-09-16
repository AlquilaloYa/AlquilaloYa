"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { RefreshCw, X } from "lucide-react";

interface DisponibilidadDepartment {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  piso: number;
  disponibilidad: { disponible: false; fechaFin: string; dias: number } | null;
  ocupante: { nombres: string; apellidos: string | null; telefono: string | null } | null;
}

function PopupDepartamento({
  dept,
  onClose,
}: {
  dept: DisponibilidadDepartment;
  onClose: () => void;
}) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-mono-label text-lg font-bold text-foreground">{dept.codigo}</h3>
            <p className="text-sm text-muted-foreground">{dept.nombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
            Ocupado
            {dept.disponibilidad!.dias === 0
              ? " · se libera hoy"
              : ` · libre en ~${dept.disponibilidad!.dias} d`}
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
            <span className="text-muted-foreground">Ocupante</span>
            <span className="font-medium text-foreground">
              {dept.ocupante?.nombres} {dept.ocupante?.apellidos ?? ""}
            </span>
            <span className="text-muted-foreground">Teléfono</span>
            <span className="font-medium text-foreground">{dept.ocupante?.telefono || "—"}</span>
            <span className="text-muted-foreground">Hasta</span>
            <span className="font-medium text-foreground">{fechaCorta}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-9 w-full rounded-lg bg-foreground font-medium text-background hover:opacity-90"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

function TarjetaDisponible({ dept }: { dept: DisponibilidadDepartment }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-green-600 p-4 text-white">
      <span className="font-mono-label text-base font-bold">{dept.codigo}</span>
      <span className="text-sm font-semibold">Disponible</span>
    </div>
  );
}

function TarjetaOcupada({
  dept,
  onOpen,
}: {
  dept: DisponibilidadDepartment;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Ver información"
      className="flex items-center justify-between gap-2 rounded-xl bg-red-600 p-4 text-white transition-colors hover:bg-red-700"
    >
      <span className="font-mono-label text-base font-bold">{dept.codigo}</span>
      <span className="text-sm font-semibold underline decoration-white/60 underline-offset-4">
        Ocupado
      </span>
    </button>
  );
}

function GrupoDepartamentos({
  titulo,
  departamentos,
  onAbrirPopup,
}: {
  titulo: string;
  departamentos: DisponibilidadDepartment[];
  onAbrirPopup: (dept: DisponibilidadDepartment) => void;
}) {
  const disponibles = departamentos.filter((d) => !d.disponibilidad);
  const ocupados = departamentos.filter((d) => d.disponibilidad);
  const columnas = Math.max(1, Math.ceil(departamentos.length / 3));

  if (departamentos.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-headline-md text-lg font-bold text-foreground">
        {titulo}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {disponibles.length} libres · {ocupados.length} ocupados
        </span>
      </h2>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {disponibles.map((dept) => (
          <TarjetaDisponible key={dept.id} dept={dept} />
        ))}
        {ocupados.map((dept) => (
          <TarjetaOcupada key={dept.id} dept={dept} onOpen={() => onAbrirPopup(dept)} />
        ))}
      </div>
    </section>
  );
}

export default function DisponibilidadPage() {
  const [departamentos, setDepartamentos] = useState<DisponibilidadDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<DisponibilidadDepartment | null>(null);

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
    const clave = (codigo: string): [number, string] => {
      const match = /(\d+)([A-Z]*)$/.exec(codigo);
      return match ? [Number(match[1]), match[2] ?? ""] : [0, codigo];
    };
    const orden = [...departamentos].sort((a, b) => {
      const [na, sa] = clave(a.codigo);
      const [nb, sb] = clave(b.codigo);
      return na - nb || sa.localeCompare(sb);
    });
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
            <GrupoDepartamentos titulo="Benavides 2195" departamentos={benavides} onAbrirPopup={setPopup} />
            <GrupoDepartamentos titulo="Angamos 170" departamentos={angamos} onAbrirPopup={setPopup} />
          </div>
        )}
      </div>

      {popup ? <PopupDepartamento dept={popup} onClose={() => setPopup(null)} /> : null}
    </DashboardShell>
  );
}