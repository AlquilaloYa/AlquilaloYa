"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { ETIQUETA_ESTADO_MANUAL } from "@/lib/estado-departamento";

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

function estadoDe(dept: DisponibilidadDepartment): {
  label: string;
  badge: string;
} {
  if (dept.disponibilidad) {
    return {
      label: "Ocupado",
      badge: "bg-[#DC143C]/10 text-[#C41230] dark:text-[#FF5C77]",
    };
  }
  if (dept.bloqueado) return { label: "Bloqueado", badge: "bg-black text-white" };
  if (dept.enMantenimiento) {
    return {
      label: "En mantenimiento",
      badge: "bg-blue-500/10 text-blue-700 dark:text-blue-500",
    };
  }
  return { label: "Disponible", badge: "bg-green-500/10 text-green-700 dark:text-green-500" };
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 py-2 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-medium text-foreground">{valor || "—"}</span>
    </div>
  );
}

export default function PropiedadPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [dept, setDept] = useState<DisponibilidadDepartment | null>(null);
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
      const encontrado = data.find(
        (d) => d.codigo.toLowerCase() === (codigo ?? "").toLowerCase()
      );
      if (!encontrado) throw new Error(`No se encontró la propiedad ${codigo}`);
      setDept(encontrado);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [codigo]);

  useEffect(() => {
    void load();
  }, [load]);

  const est = dept ? estadoDe(dept) : null;
  const plazo = dept?.disponibilidad?.fechaFin;
  const fechaCorta = plazo
    ? new Date(`${plazo}T12:00:00`).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <DashboardShell>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <Link
            href="/disponibilidad"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Disponibilidad
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-input bg-background p-6 text-sm text-red-600">
            {error}
          </div>
        ) : loading || !dept || !est ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando propiedad…
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-background p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-mono-label text-2xl font-bold text-foreground">
                    {dept.codigo}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {dept.nombre} · N° {dept.numero}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${est.badge}`}
                >
                  {est.label}
                  {dept.disponibilidad
                    ? dept.disponibilidad.dias === 0
                      ? " · se libera hoy"
                      : ` · libre en ~${dept.disponibilidad.dias} d`
                    : ""}
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-5 shadow-sm">
                <h2 className="mb-2 font-headline-md text-base font-semibold text-foreground">
                  Datos de la propiedad
                </h2>
                <div className="divide-y divide-border">
                  <Fila etiqueta="Precio" valor={fmtPrecio(dept.precio) || "—"} />
                  <Fila etiqueta="Piso" valor={dept.piso} />
                  <Fila etiqueta="Número" valor={dept.numero} />
                  <Fila
                    etiqueta="Estado manual"
                    valor={ETIQUETA_ESTADO_MANUAL[dept.estadoManual ?? ""] ?? "Automático"}
                  />
                </div>
              </div>

              {dept.disponibilidad ? (
                <div className="rounded-xl border bg-background p-5 shadow-sm">
                  <h2 className="mb-2 font-headline-md text-base font-semibold text-foreground">
                    Ocupante actual
                  </h2>
                  <div className="divide-y divide-border">
                    <Fila
                      etiqueta="Cliente"
                      valor={`${dept.ocupante?.nombres ?? ""} ${dept.ocupante?.apellidos ?? ""}`.trim()}
                    />
                    <Fila etiqueta="Teléfono" valor={dept.ocupante?.telefono} />
                    <Fila etiqueta="Ocupado hasta" valor={fechaCorta} />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border bg-background p-5 shadow-sm">
                  <h2 className="mb-2 font-headline-md text-base font-semibold text-foreground">
                    Disponibilidad
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Propiedad {dept.enMantenimiento ? "en mantenimiento" : dept.bloqueado ? "bloqueada" : "liberada y disponible para alquilar"}.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}