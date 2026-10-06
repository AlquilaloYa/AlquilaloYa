"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { BookUser, Search } from "lucide-react";

interface EntradaDirectorio {
  id: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  email: string;
  estado: string;
}

export default function DirectorioPage() {
  const [personas, setPersonas] = useState<EntradaDirectorio[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const response = await apiFetch("/api/rrhh/asignables");
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Error ${response.status}`);
        }
        const items = (await response.json()) as EntradaDirectorio[];
        if (activo) setPersonas(items);
      } catch (reason) {
        if (activo) setError((reason as Error).message);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return personas;
    return personas.filter((persona) =>
      `${persona.nombres} ${persona.apellidos} ${persona.cargo} ${persona.email}`.toLowerCase().includes(termino)
    );
  }, [personas, busqueda]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Directorio</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="mb-4 flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 dark:border-transparent">
              <Search aria-hidden className="h-4 w-4 shrink-0 text-on-surface-variant" />
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar por nombre, cargo o correo"
                className="w-full bg-transparent font-body-sm text-on-surface outline-none placeholder:text-on-surface-variant"
                aria-label="Buscar en el directorio"
              />
            </label>

            {error ? (
              <p className="rounded-md bg-error-container px-3 py-2 font-body-sm text-error-container-foreground">{error}</p>
            ) : cargando ? (
              <p className="py-10 text-center font-body-sm text-on-surface-variant">Cargando directorio…</p>
            ) : filtradas.length === 0 ? (
              <p className="py-10 text-center font-body-sm text-on-surface-variant">
                {personas.length === 0 ? "No hay trabajadores activos." : "Sin coincidencias."}
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant dark:divide-transparent">
                {filtradas.map((persona) => (
                  <li key={persona.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-label-md text-primary">
                      {persona.nombres.charAt(0)}
                      {persona.apellidos.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body-sm font-semibold text-on-surface">
                        {persona.nombres} {persona.apellidos}
                      </span>
                      <span className="block truncate font-body-xs text-on-surface-variant">
                        {persona.cargo || "Sin cargo"}
                        {persona.email ? ` · ${persona.email}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 flex items-center gap-2 font-body-xs text-on-surface-variant">
              <BookUser aria-hidden className="h-3.5 w-3.5" />
              {filtradas.length} de {personas.length} trabajadores activos · no se muestran documentos ni datos sensibles
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
