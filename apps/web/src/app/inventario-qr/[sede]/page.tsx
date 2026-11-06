"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { toDataURL } from "qrcode";
import {
  cargarInventarios,
  gruposDesdeItems,
} from "@/lib/inventarios-departamento";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  LoaderCircle,
  QrCode,
  Search,
  X,
} from "lucide-react";

/** Sedes disponibles en el módulo de inventario QR. */
const SEDES: Record<string, { nombre: string; prefix: string; descripcion: string }> = {
  ang170: {
    nombre: "ANG170",
    prefix: "ANG170-",
    descripcion: "Inventario con código QR de los departamentos de la sede ANG170",
  },
  ben2195: {
    nombre: "BEN2195",
    prefix: "BEN2195-",
    descripcion: "Inventario con código QR de los departamentos de la sede BEN2195",
  },
};

interface DepartamentoRowApi {
  id: string;
  codigo: string;
  nombre: string;
  numero: string;
  piso: number;
  tipo: string;
}

function fechaEs(iso: string): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function InventarioQrSedePage() {
  const params = useParams<{ sede: string }>();
  const sedeKey = typeof params.sede === "string" ? params.sede.toLowerCase() : "";
  const sede = SEDES[sedeKey];

  const [departamentos, setDepartamentos] = useState<DepartamentoRowApi[] | null>(null);
  const [porDepartamento, setPorDepartamento] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [qrDe, setQrDe] = useState<{ depto: DepartamentoRowApi; dataUrl: string; url: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [resDep, inv] = await Promise.all([
        apiFetch("/api/departamentos"),
        cargarInventarios(true),
      ]);
      if (!resDep.ok) throw new Error("No se pudieron cargar los departamentos.");
      setPorDepartamento(inv);
      const deps = (await resDep.json()) as DepartamentoRowApi[];
      setDepartamentos(deps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error al cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sede) void cargar();
  }, [sede, cargar]);

  const filas = useMemo(() => {
    if (!departamentos || !sede) return [];
    const deSede = departamentos
      .filter((d) => d.codigo.startsWith(sede.prefix))
      .map((d) => ({ depto: d, items: porDepartamento[d.id] ?? [] }));
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return deSede;
    return deSede.filter(({ depto, items }) => {
      const contenido = `${depto.codigo} ${depto.nombre} ${items.length}`.toLowerCase();
      if (contenido.includes(texto)) return true;
      return items.some((id) => id.toLowerCase().includes(texto));
    });
  }, [departamentos, porDepartamento, sede, busqueda]);

  const totales = useMemo(() => {
    if (!departamentos || !sede) return { deptos: 0, items: 0, conQr: 0 };
    const deSede = departamentos.filter((d) => d.codigo.startsWith(sede.prefix));
    return {
      deptos: deSede.length,
      items: deSede.reduce((s, d) => s + (porDepartamento[d.id]?.length ?? 0), 0),
      conQr: deSede.filter((d) => (porDepartamento[d.id]?.length ?? 0) > 0).length,
    };
  }, [departamentos, porDepartamento, sede]);

  async function abrirQr(depto: DepartamentoRowApi) {
    const url = `${window.location.origin}/inventario-qr/d/${depto.id}`;
    const dataUrl = await toDataURL(url, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    setQrDe({ depto, dataUrl, url });
  }

  function descargarQr() {
    if (!qrDe) return;
    const a = document.createElement("a");
    a.href = qrDe.dataUrl;
    a.download = `qr-inventario-${qrDe.depto.codigo}.png`;
    a.click();
  }

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

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <QrCode className="h-4 w-4" /> Operatividad · Inventario QR
            </div>
            <h1 className="mt-1 font-headline-lg">Inventario QR · Sede {sede.nombre}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{sede.descripcion}</p>
          </div>
          {!loading && !error ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                Departamentos: {totales.deptos}
              </span>
              <span className="rounded-full bg-emerald-600/10 px-2.5 py-1 font-medium text-emerald-600">
                Con inventario: {totales.conQr}
              </span>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600">
                Bienes totales: {totales.items}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex max-w-md flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar departamento o bien (ej. cocina)…"
              className="h-10 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm"
              aria-label="Buscar en el inventario"
            />
            {busqueda ? (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground" role="status">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Cargando inventario…
          </div>
        ) : error ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-destructive" role="alert">
            <AlertTriangle className="h-5 w-5" /> {error}
          </div>
        ) : filas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {busqueda
              ? "Sin resultados para la búsqueda."
              : `No hay departamentos registrados para la sede ${sede.nombre}.`}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-outline-variant">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-left text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="px-3 py-2 font-medium">Departamento</th>
                  <th className="px-3 py-2 font-medium">Piso</th>
                  <th className="px-3 py-2 font-medium">Bienes registrados</th>
                  <th className="px-3 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ depto, items }) => {
                  const grupos = gruposDesdeItems(items);
                  const totalItems = items.length;
                  return (
                    <tr key={depto.id} className="border-t border-outline-variant/50">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="font-mono font-medium">{depto.codigo}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{depto.nombre}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{depto.piso}</td>
                      <td className="px-3 py-2.5">
                        {totalItems === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Sin inventario registrado
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {totalItems} bienes
                            </span>
                            {grupos.map((grupo) => (
                              <span
                                key={grupo.categoria}
                                className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant"
                              >
                                {grupo.categoria}: {grupo.items.length}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void abrirQr(depto)}
                          disabled={totalItems === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <QrCode className="h-4 w-4" /> QR
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {qrDe ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-xl dark:border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-md font-semibold">
                  {qrDe.depto.codigo}
                </h3>
                <button
                  type="button"
                  onClick={() => setQrDe(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <img
                src={qrDe.dataUrl}
                alt={`Código QR del inventario de ${qrDe.depto.codigo}`}
                className="mx-auto mt-4 h-72 w-72 rounded-lg bg-white p-2"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Escanéa para ver el inventario de {qrDe.depto.codigo} · generado {fechaEs(new Date().toISOString())}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <a
                  href={qrDe.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" /> Abrir vista
                </a>
                <button
                  type="button"
                  onClick={descargarQr}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> Descargar PNG
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/departamentos" className="font-medium text-primary hover:underline">
            editar inventario por departamento →
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
