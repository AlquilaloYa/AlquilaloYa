"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { PersonType } from "@contract/domain/client";
import { apiFetch } from "@/lib/api";

interface ClientView {
  id: string;
  nombres: string;
  apellidos?: string | null;
  documentoIdentidad: string;
  ruc?: string | null;
  tipoPersona: PersonType;
  email?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  codigoDepartamento?: string | null;
  activo: boolean;
}

export default function ClientesPage() {
  const [clients, setClients] = useState<ClientView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await apiFetch("/api/clients");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${res.status}`);
        }
        const lista = (await res.json()) as ClientView[];
        setClients(lista);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    cargar();
  }, []);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Clientes que firman el contrato final</CardTitle>
              {loading && <span className="text-sm text-muted-foreground">Cargando…</span>}
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay clientes registrados. Los clientes aparecen aquí una vez que firman el contrato final.
              </p>
            ) : (
              <TableScroll className="max-h-[32rem] w-full rounded-md border">
                <div className="max-h-[30rem] overflow-y-auto">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead className="sticky top-0 z-10 bg-[#151a24] text-left text-xs text-white/80">
                      <tr>
                        <th className="px-3 py-2 font-medium">ID departamento</th>
                        <th className="px-3 py-2 font-medium">Nombre</th>
                        <th className="px-3 py-2 font-medium">Documento</th>
                        <th className="px-3 py-2 font-medium">RUC</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Teléfono</th>
                        <th className="px-3 py-2 font-medium">Domicilio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="px-3 py-2 font-mono font-medium">
                            <Link
                              href={`/contratos/clientes/${c.id}`}
                              className="text-primary hover:underline"
                              title="Ver toda la información del cliente"
                            >
                              {c.codigoDepartamento ?? "—"}
                            </Link>
                          </td>
                          <td className="px-3 py-2 font-medium">
                            <Link
                              href={`/contratos/clientes/${c.id}`}
                              className="text-primary hover:underline"
                            >
                              {[c.nombres, c.apellidos].filter(Boolean).join(" ")}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{c.documentoIdentidad}</td>
                          <td className="px-3 py-2">{c.ruc ?? "—"}</td>
                          <td className="px-3 py-2">
                            {c.tipoPersona === PersonType.NATURAL ? "Natural" : "Jurídica"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.telefono ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.domicilio ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TableScroll>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
