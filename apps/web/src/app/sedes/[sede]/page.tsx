"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  MapPinned,
  Search,
} from "lucide-react";

/** Sedes registradas del sistema (prefix con el que inicia el código del departamento). */
const SEDES: Record<string, { nombre: string; prefix: string }> = {
  ang170: {
    nombre: "ANG170",
    prefix: "ANG170-",
  },
  ben2195: {
    nombre: "BEN2195",
    prefix: "BEN2195-",
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
  const [busqueda, setBusqueda] = useState("");
  const [tablaContraida, setTablaContraida] = useState(false);

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

  const departamentosOrdenados = useMemo(() => {
    if (!filas || !sede) return [];
    const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
    return filas
      .filter((fila) => fila.codigo.startsWith(sede.prefix))
      .sort((a, b) => collator.compare(a.codigo, b.codigo));
  }, [filas, sede]);

  const departamentosFiltrados = useMemo(() => {
    const query = busqueda.trim().toLocaleLowerCase("es");
    if (!query) return departamentosOrdenados;
    return departamentosOrdenados.filter((d) => {
      const ocupante = d.ocupante
        ? [d.ocupante.nombres, d.ocupante.apellidos].filter(Boolean).join(" ")
        : "";
      const estado = META_ESTADO[estadoDe(d)].label;
      return [d.codigo, d.nombre, d.piso, estado, ocupante, d.disponible?.fechaFin]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query);
    });
  }, [busqueda, departamentosOrdenados]);

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
    departamentosOrdenados.filter((f) => estadoDe(f) === estado).length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinned className="h-4 w-4" /> Gestión de Sedes
            </div>
            <h1 className="mt-1 font-headline-lg">Sede {sede.nombre}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Departamentos de la sede {sede.nombre}, ordenados por código.
            </p>
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
        ) : departamentosOrdenados.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay departamentos registrados.
          </p>
        ) : (
          <div className="space-y-2">
            <label className="relative block w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar código, piso, estado o inquilino…"
                className="h-10 w-full rounded-md border border-outline-variant bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
                aria-label="Buscar departamentos"
              />
            </label>

            {departamentosFiltrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No se encontraron departamentos para “{busqueda}”.
              </p>
            ) : (
              <TableScroll contentClassName="max-h-80">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b border-outline-variant text-left text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="px-3 py-2 font-medium">Código</th>
                      <th className="px-3 py-2 font-medium">Piso</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium">Inquilino</th>
                      <th className="px-3 py-2 font-medium">Vence</th>
                    </tr>
                  </thead>
                  {!tablaContraida ? (
                    <tbody>
                      {departamentosFiltrados.map((d) => {
                        const estado = estadoDe(d);
                        const meta = META_ESTADO[estado];
                        return (
                          <tr key={d.id} className="border-t border-outline-variant/50">
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono">{d.codigo}</td>
                            <td className="whitespace-nowrap px-3 py-1.5">{d.piso}</td>
                            <td className="whitespace-nowrap px-3 py-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.clases}`}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5">
                              {d.ocupante
                                ? [d.ocupante.nombres, d.ocupante.apellidos].filter(Boolean).join(" ")
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5">
                              {d.disponible && !d.disponible.disponible
                                ? fechaEs(d.disponible.fechaFin)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ) : null}
                </table>
              </TableScroll>
            )}

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {departamentosFiltrados.length} de {departamentosOrdenados.length} departamentos
              </span>
              <button
                type="button"
                onClick={() => setTablaContraida((contraida) => !contraida)}
                aria-expanded={!tablaContraida}
                className="inline-flex items-center gap-1 rounded-md border border-outline-variant px-3 py-1.5 text-sm font-medium hover:bg-surface-variant/50"
              >
                {tablaContraida ? (
                  <>
                    <ChevronDown className="h-4 w-4" /> Expandir tabla
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-4 w-4" /> Contraer tabla
                  </>
                )}
              </button>
            </div>
          </div>
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
