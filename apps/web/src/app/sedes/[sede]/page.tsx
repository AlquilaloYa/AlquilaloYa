"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, LoaderCircle, MapPinned } from "lucide-react";

/** Sedes registradas del sistema (prefix con el que inicia el código del departamento). */
const SEDES: Record<string, { nombre: string; prefix: string; descripcion: string }> = {
  ang170: {
    nombre: "ANG170",
    prefix: "ANG170-",
    descripcion: "Departamentos de la sede ANG170",
  },
  ben2195: {
    nombre: "BEN2195",
    prefix: "BEN2195-",
    descripcion: "Departamentos de la sede BEN2195",
  },
};

interface DepartamentoRowApi {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  tipo: string;
  piso: number;
  personaPago: string;
  precio: string;
  garantia: string;
  mantenimiento: string;
  activo: boolean;
  estadoManual: string | null;
  disponible: null | { disponible: boolean; fechaFin: string; dias: number };
  enMantenimiento: boolean;
  bloqueado: boolean;
  contratoEstado?: string | null;
  ocupante?: null | {
    nombres: string;
    apellidos: string | null;
    telefono: string | null;
  };
}

const moneda = (n: number) =>
  n.toLocaleString("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });

function fechaEs(iso: string): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

type EstadoVisual = "DISPONIBLE" | "OCUPADO" | "MANTENIMIENTO" | "BLOQUEADO";

const META_ESTADO: Record<EstadoVisual, { label: string; clases: string }> = {
  DISPONIBLE: { label: "Disponible", clases: "bg-emerald-600/10 text-emerald-600" },
  OCUPADO: { label: "Ocupado", clases: "bg-primary/10 text-primary" },
  MANTENIMIENTO: { label: "Mantenimiento", clases: "bg-amber-500/10 text-amber-600" },
  BLOQUEADO: { label: "Bloqueado", clases: "bg-destructive/10 text-destructive" },
};

function estadoDe(d: DepartamentoRowApi): EstadoVisual {
  if (d.disponible && !d.disponible.disponible) return "OCUPADO";
  if (d.enMantenimiento) return "MANTENIMIENTO";
  if (d.bloqueado) return "BLOQUEADO";
  return "DISPONIBLE";
}

export default function SedePage() {
  const params = useParams<{ sede: string }>();
  const sedeKey = typeof params.sede === "string" ? params.sede.toLowerCase() : "";
  const sede = SEDES[sedeKey];

  const [filas, setFilas] = useState<DepartamentoRowApi[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/departamentos");
      if (!res.ok) throw new Error("No se pudieron cargar los departamentos.");
      setFilas((await res.json()) as DepartamentoRowApi[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error al cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sede) void cargar();
  }, [sede, cargar]);

  const departamentoDeSede = useMemo(() => {
    if (!filas || !sede) return [];
    return filas.filter((f) => f.codigo.startsWith(sede.prefix));
  }, [filas, sede]);

  if (!sede) {
    return (
      <DashboardShell>
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <AlertTriangle className="h-6 w-6" />
          <p>Sede no encontrada. Usa el menú para elegir ANG170 o BEN2195.</p>
        </div>
      </DashboardShell>
    );
  }

  const resumen = (estado: EstadoVisual) =>
    departamentoDeSede.filter((f) => estadoDe(f) === estado).length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinned className="h-4 w-4" /> Gestión de Sedes
            </div>
            <h1 className="mt-1 font-headline-lg">Sede {sede.nombre}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{sede.descripcion}</p>
          </div>
          {!loading && !error ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                Ocupados: {resumen("OCUPADO")}
              </span>
              <span className="rounded-full bg-emerald-600/10 px-2.5 py-1 font-medium text-emerald-600">
                Disponibles: {resumen("DISPONIBLE")}
              </span>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600">
                Mantenimiento: {resumen("MANTENIMIENTO")}
              </span>
              <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                Bloqueados: {resumen("BLOQUEADO")}
              </span>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground" role="status">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Cargando departamentos…
          </div>
        ) : error ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-destructive" role="alert">
            <AlertTriangle className="h-5 w-5" /> {error}
          </div>
        ) : departamentoDeSede.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay departamentos registrados para la sede {sede.nombre}.
          </p>
        ) : (
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-left text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Unidad</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Piso</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Inquilino</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 font-medium">Canon</th>
                  <th className="px-3 py-2 font-medium">Garantía</th>
                  <th className="px-3 py-2 font-medium">Persona de pago</th>
                </tr>
              </thead>
              <tbody>
                {departamentoDeSede.map((d) => {
                  const estado = estadoDe(d);
                  const meta = META_ESTADO[estado];
                  return (
                    <tr key={d.id} className="border-t border-outline-variant/50">
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{d.codigo}</td>
                      <td className="whitespace-nowrap px-3 py-2">{d.nombre || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{d.tipo}</td>
                      <td className="whitespace-nowrap px-3 py-2">{d.piso}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.clases}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {d.ocupante
                          ? [d.ocupante.nombres, d.ocupante.apellidos].filter(Boolean).join(" ")
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {d.disponible && !d.disponible.disponible
                          ? fechaEs(d.disponible.fechaFin)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {moneda(Number(d.precio))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {moneda(Number(d.garantia))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{d.personaPago}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}

        <div className="text-sm text-muted-foreground">
          <Link href="/departamentos" className="font-medium text-primary hover:underline">
            Ver todos los departamentos →
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
