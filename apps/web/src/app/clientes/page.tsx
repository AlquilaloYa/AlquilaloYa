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
  fechaFinContrato?: string | null;
  fechaInicioAdenda?: string | null;
  fechaFinAdenda?: string | null;
}

function fmtFecha(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function numeroWhatsApp(telefono?: string | null): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, "");
  return digitos.length > 0 ? digitos : null;
}

function WhatsAppButton({ telefono }: { telefono?: string | null }) {
  const numero = numeroWhatsApp(telefono);
  if (!numero) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`https://wa.me/${numero}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Escribir por WhatsApp a ${telefono}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-white transition-opacity hover:opacity-90"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
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
                  <table className="w-full min-w-[1080px] text-sm">
                    <thead className="sticky top-0 z-10 bg-[#151a24] text-left text-xs text-white/80">
                      <tr>
                        <th className="px-3 py-2 font-medium">ID departamento</th>
                        <th className="px-3 py-2 font-medium">Nombre</th>
                        <th className="px-3 py-2 font-medium">Documento</th>
                        <th className="px-3 py-2 font-medium">Fin contrato</th>
                        <th className="px-3 py-2 font-medium">Inicio adenda</th>
                        <th className="px-3 py-2 font-medium">Fin adenda</th>
                        <th className="px-3 py-2 font-medium">RUC</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Teléfono</th>
                        <th className="px-3 py-2 font-medium">WhatsApp</th>
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
                          <td className="px-3 py-2">{fmtFecha(c.fechaFinContrato)}</td>
                          <td className="px-3 py-2">{fmtFecha(c.fechaInicioAdenda)}</td>
                          <td className="px-3 py-2">{fmtFecha(c.fechaFinAdenda)}</td>
                          <td className="px-3 py-2">{c.ruc ?? "—"}</td>
                          <td className="px-3 py-2">
                            {c.tipoPersona === PersonType.NATURAL ? "Natural" : "Jurídica"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.telefono ?? "—"}</td>
                          <td className="px-3 py-2">
                            <WhatsAppButton telefono={c.telefono ?? null} />
                          </td>
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
