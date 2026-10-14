"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { BookUser, Search } from "lucide-react";

interface ClienteEliminado {
  id: string;
  nombres: string;
  apellidos: string;
  documentoIdentidad: string;
  telefono: string;
  codigoPais: string;
  eliminadoEn: string | null;
}

function telefonoCompleto(cliente: ClienteEliminado): string {
  if (!cliente.telefono) return "—";
  const prefijo = cliente.codigoPais ? `+${cliente.codigoPais} ` : "";
  return `${prefijo}${cliente.telefono}`;
}

export default function DirectorioPage() {
  const [clientes, setClientes] = useState<ClienteEliminado[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const response = await apiFetch("/api/directorio");
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Error ${response.status}`);
        }
        const items = (await response.json()) as ClienteEliminado[];
        if (activo) setClientes(items);
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

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;
    return clientes.filter((cliente) =>
      `${cliente.nombres} ${cliente.apellidos} ${cliente.documentoIdentidad} ${cliente.telefono}`
        .toLowerCase()
        .includes(termino)
    );
  }, [clientes, busqueda]);

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
                placeholder="Buscar por nombre, teléfono o documento"
                className="w-full bg-transparent font-body-sm text-on-surface outline-none placeholder:text-on-surface-variant"
                aria-label="Buscar en el directorio"
              />
            </label>

            {error ? (
              <p className="rounded-md bg-error-container px-3 py-2 font-body-sm text-error-container-foreground">{error}</p>
            ) : cargando ? (
              <p className="py-10 text-center font-body-sm text-on-surface-variant">Cargando directorio…</p>
            ) : filtrados.length === 0 ? (
              <p className="py-10 text-center font-body-sm text-on-surface-variant">
                {clientes.length === 0 ? "No hay clientes eliminados." : "Sin coincidencias."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Teléfono</th>
                      <th className="px-3 py-2 font-medium">DNI/CE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((cliente) => (
                      <tr key={cliente.id} className="border-t border-outline-variant dark:border-transparent">
                        <td className="px-3 py-2 font-body-sm font-semibold text-on-surface">
                          {[cliente.nombres, cliente.apellidos].filter(Boolean).join(" ")}
                        </td>
                        <td className="px-3 py-2 font-body-sm text-on-surface-variant">{telefonoCompleto(cliente)}</td>
                        <td className="px-3 py-2 font-mono-label text-on-surface">{cliente.documentoIdentidad || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 flex items-center gap-2 font-body-xs text-on-surface-variant">
              <BookUser aria-hidden className="h-3.5 w-3.5" />
              {filtrados.length} de {clientes.length} clientes eliminados
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
