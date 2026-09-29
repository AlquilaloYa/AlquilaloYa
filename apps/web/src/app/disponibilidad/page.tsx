"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { RefreshCw, X } from "lucide-react";

interface DisponibilidadDepartment {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  piso: number;
  precio: string;
  disponibilidad: { disponible: false; fechaFin: string; dias: number } | null;
  enMantenimiento?: boolean;
  bloqueado?: boolean;
  estadoManual?: string | null;
  ocupante: { nombres: string; apellidos: string | null; telefono: string | null } | null;
}

function fmtPrecio(val: string | undefined): string {
  const numero = Number(val ?? 0);
  if (!numero) return "";
  return `S/ ${numero.toLocaleString("es-PE", { minimumFractionDigits: 0 })}/mes`;
}

function TarjetaDisponible({ dept }: { dept: DisponibilidadDepartment }) {
  return (
    <Link
      href={`/disponibilidad/${encodeURIComponent(dept.codigo)}`}
      title="Ver propiedad"
      className="flex items-center justify-center rounded-xl border border-green-600/20 bg-green-500/10 border-l-4 border-l-green-600 p-4 transition-colors hover:bg-green-500/15"
    >
      <span className="font-mono-label text-base font-bold text-green-700 dark:text-green-500">{dept.codigo}</span>
    </Link>
  );
}

function TarjetaOcupada({ dept }: { dept: DisponibilidadDepartment }) {
  return (
    <Link
      href={`/disponibilidad/${encodeURIComponent(dept.codigo)}`}
      title="Ver propiedad"
      className="flex items-center justify-center rounded-xl border border-red-600/20 bg-red-500/10 border-l-4 border-l-red-600 p-4 transition-colors hover:bg-red-500/15"
    >
      <span className="font-mono-label text-base font-bold text-red-700 dark:text-red-500">{dept.codigo}</span>
    </Link>
  );
}

function TarjetaMantenimiento({
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
      title="Cambiar estado"
      className="flex items-center justify-center rounded-xl border border-blue-600/20 bg-blue-500/10 border-l-4 border-l-blue-600 p-4 transition-colors hover:bg-blue-500/15"
    >
      <span className="font-mono-label text-base font-bold text-blue-700 dark:text-blue-500">{dept.codigo}</span>
    </button>
  );
}

function TarjetaBloqueada({
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
      title="Cambiar estado"
      className="flex items-center justify-center rounded-xl border border-black bg-black border-l-4 p-4 transition-colors hover:opacity-90"
    >
      <span className="font-mono-label text-base font-bold text-white">{dept.codigo}</span>
    </button>
  );
}

function PopupCambiarEstado({
  dept,
  onClose,
  onChanged,
}: {
  dept: DisponibilidadDepartment;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [errorCambio, setErrorCambio] = useState<string | null>(null);
  const manual = dept.estadoManual;

  async function cambiarEstado(estado: "MANTENIMIENTO" | "BLOQUEADO" | "AUTO") {
    if (guardando) return;
    if (estado === "AUTO" && (manual === null || manual === undefined)) return;
    if (estado !== "AUTO" && estado === manual) return;
    setGuardando(true);
    setErrorCambio(null);
    try {
      const res = await apiFetch(`/api/departamentos/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estadoManual: estado === "AUTO" ? "LIBRE" : estado,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      onChanged();
      onClose();
    } catch (e) {
      setErrorCambio((e as Error).message ?? "No se pudo cambiar el estado");
    } finally {
      setGuardando(false);
    }
  }

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
            <p className="text-sm text-muted-foreground">{dept.nombre} · Cambiar modo</p>
            {fmtPrecio(dept.precio) ? (
              <p className="mt-1 text-sm font-semibold text-primary">{fmtPrecio(dept.precio)}</p>
            ) : null}
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
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => void cambiarEstado("MANTENIMIENTO")}
            className={`flex w-full items-center gap-3 rounded-lg border-l-4 border-blue-600 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors dark:text-blue-500 ${
              manual === "MANTENIMIENTO" ? "ring-2 ring-inset ring-blue-600 opacity-80" : "hover:bg-blue-500/15"
            }`}
          >
            Mantenimiento{manual === "MANTENIMIENTO" ? " · actual" : ""}
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void cambiarEstado("BLOQUEADO")}
            className={`flex w-full items-center gap-3 rounded-lg border-l-4 border-black bg-black px-3 py-2 text-sm font-semibold text-white transition-colors ${
              manual === "BLOQUEADO" ? "ring-2 ring-inset ring-neutral-400 opacity-90" : "hover:opacity-90"
            }`}
          >
            Bloqueado{manual === "BLOQUEADO" ? " · actual" : ""}
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void cambiarEstado("AUTO")}
            className={`flex w-full items-center gap-3 rounded-lg border border-dashed border-outline px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted ${
              manual === null || manual === undefined
                ? "ring-2 ring-inset ring-primary/60 text-foreground font-semibold"
                : ""
            }`}
          >
            Automático (según contratos)
            {manual === null || manual === undefined ? " · actual" : ""}
          </button>
        </div>
        {errorCambio ? <p className="mt-3 text-sm text-red-600">{errorCambio}</p> : null}
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

function GrupoDepartamentos({
  titulo,
  departamentos,
  onAbrirCambio,
}: {
  titulo: string;
  departamentos: DisponibilidadDepartment[];
  onAbrirCambio: (dept: DisponibilidadDepartment) => void;
}) {
  const disponibles = departamentos.filter((d) => !d.disponibilidad && !d.enMantenimiento && !d.bloqueado);
  const mantenimiento = departamentos.filter((d) => !d.disponibilidad && d.enMantenimiento && !d.bloqueado);
  const bloqueados = departamentos.filter((d) => !d.disponibilidad && d.bloqueado);
  const ocupados = departamentos.filter((d) => d.disponibilidad);
  const total = mantenimiento.length + disponibles.length + ocupados.length + bloqueados.length;
  const columnas = Math.max(1, Math.ceil(total / 3));

  if (departamentos.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-headline-md text-lg font-bold text-foreground">
        {titulo}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {disponibles.length} libres · {ocupados.length} ocupados
          {mantenimiento.length > 0 && ` · ${mantenimiento.length} en mant.`}
          {bloqueados.length > 0 && ` · ${bloqueados.length} bloqueados`}
        </span>
      </h2>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {disponibles.map((dept) => (
          <TarjetaDisponible key={dept.id} dept={dept} />
        ))}
        {mantenimiento.map((dept) => (
          <TarjetaMantenimiento key={dept.id} dept={dept} onOpen={() => onAbrirCambio(dept)} />
        ))}
        {bloqueados.map((dept) => (
          <TarjetaBloqueada key={dept.id} dept={dept} onOpen={() => onAbrirCambio(dept)} />
        ))}
        {ocupados.map((dept) => (
          <TarjetaOcupada key={dept.id} dept={dept} />
        ))}
      </div>
    </section>
  );
}

export default function DisponibilidadPage() {
  const [departamentos, setDepartamentos] = useState<DisponibilidadDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [popupCambio, setPopupCambio] = useState<DisponibilidadDepartment | null>(null);

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
  const mantenimiento = departamentos.filter((d) => !d.disponibilidad && d.enMantenimiento && !d.bloqueado).length;
  const bloqueados = departamentos.filter((d) => !d.disponibilidad && d.bloqueado).length;

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
              <span className="font-semibold text-[#5A7D00] dark:text-[#A8CC4C]">
                {departamentos.length - ocupados - mantenimiento - bloqueados} disponibles
              </span>{" "}
              ·{" "}
              <span className="font-semibold text-[#C41230] dark:text-[#FF5C77]">
                {ocupados} ocupados
              </span>
              {mantenimiento > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-semibold text-blue-700 dark:text-blue-500">
                    {mantenimiento} en mantenimiento
                  </span>
                </>
              )}
              {bloqueados > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-semibold text-black dark:text-white">
                    {bloqueados} bloqueados
                  </span>
                </>
              )}
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
            <GrupoDepartamentos
            titulo="Benavides 2195"
            departamentos={benavides}
            onAbrirCambio={setPopupCambio}
          />
          <GrupoDepartamentos
            titulo="Angamos 170"
            departamentos={angamos}
            onAbrirCambio={setPopupCambio}
          />
          </div>
        )}
      </div>

      {popupCambio ? (
        <PopupCambiarEstado
          dept={popupCambio}
          onClose={() => setPopupCambio(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </DashboardShell>
  );
}