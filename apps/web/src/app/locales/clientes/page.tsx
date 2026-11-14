"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PersonType } from "@contract/domain/client";
import { Card, CardContent, CardHeader, CardTitle } from "@contract/ui/components/card";
import { DashboardShell } from "@/components/dashboard-shell";
import { TableScroll } from "@/components/table-scroll";
import { BusquedaInput, filtrarFilas, ordenarColumna } from "@/components/tabla-busqueda";
import { LocalAttachmentPreview } from "@/components/locales/local-attachment-preview";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface LocalClientView {
  id: string;
  localId: string;
  contactLocalId: string;
  codigoLocal: string;
  nombres: string;
  apellidos?: string | null;
  documentoIdentidad: string;
  ruc?: string | null;
  tipoPersona: PersonType;
  email?: string | null;
  telefono?: string | null;
  codigoPais?: string | null;
  nacionalidad?: string | null;
  codigoContrato: string;
  contractDocumentId?: string | null;
  contractDocumentName?: string | null;
  contractDocumentMimeType?: string | null;
  fechaInicioContrato?: string | null;
  fechaFinContrato?: string | null;
  fechaInicioAdenda?: string | null;
  fechaFinAdenda?: string | null;
}

type SortKey =
  | "local"
  | "nombre"
  | "documento"
  | "telefono"
  | "inicioContrato"
  | "finContrato"
  | "inicioAdenda"
  | "finAdenda"
  | "tipo"
  | "ruc"
  | null;

function fmtFecha(iso?: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function numeroWhatsApp(telefono?: string | null, codigoPais = "51"): string | null {
  if (!telefono) return null;
  let local = telefono.replace(/[\s\-().]/g, "");
  if (local.startsWith("+")) local = local.slice(1);
  const codigo = codigoPais.replace(/\D/g, "");
  if (!codigo) return null;
  if (local.startsWith(codigo)) return local;
  return codigo + local.replace(/^0+/, "");
}

export default function ClientesLocalesPage() {
  const { user } = useAuth();
  const puedeEliminar = user !== null && user.role !== "ASISTENTE_ADMINISTRATIVO";
  const [clients, setClients] = useState<LocalClientView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [documentPreview, setDocumentPreview] = useState<{
    id: string;
    filename: string;
    mimeType: string;
  } | null>(null);

  const clientesTabla = useMemo(() => {
    let rows = filtrarFilas(clients, busqueda, (client) => [
      client.codigoLocal,
      client.codigoContrato,
      client.nombres,
      client.apellidos,
      client.documentoIdentidad,
      client.ruc,
      client.email,
      client.telefono,
      client.nacionalidad,
      client.tipoPersona === PersonType.NATURAL ? "Natural" : "Jurídica",
    ]);
    const values: Record<string, (client: LocalClientView) => string | number | null | undefined> = {
      local: (client) => client.codigoLocal,
      nombre: (client) => [client.nombres, client.apellidos].filter(Boolean).join(" "),
      documento: (client) => client.documentoIdentidad,
      telefono: (client) => client.telefono,
      inicioContrato: (client) => client.fechaInicioContrato,
      finContrato: (client) => client.fechaFinContrato,
      inicioAdenda: (client) => client.fechaInicioAdenda,
      finAdenda: (client) => client.fechaFinAdenda,
      tipo: (client) => client.tipoPersona === PersonType.NATURAL ? "Natural" : "Jurídica",
      ruc: (client) => client.ruc,
    };
    if (sortKey) rows = ordenarColumna(rows, sortKey, sortDir, values[sortKey]!);
    return rows;
  }, [clients, busqueda, sortKey, sortDir]);

  useEffect(() => {
    async function loadClients() {
      try {
        const response = await apiFetch("/api/locales/clientes");
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${response.status}`);
        }
        setClients((await response.json()) as LocalClientView[]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudieron cargar los clientes de locales.");
      } finally {
        setLoading(false);
      }
    }
    void loadClients();
  }, []);

  function cambiarOrden(key: SortKey) {
    if (sortKey === key) setSortDir((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function eliminarCliente(client: LocalClientView) {
    const nombre = [client.nombres, client.apellidos].filter(Boolean).join(" ");
    if (!window.confirm(`¿Quitar a ${nombre} (${client.codigoLocal}) de Clientes Locales? Se conservarán sus contratos y datos históricos.`)) {
      return;
    }
    try {
      const response = await apiFetch("/api/locales/clientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: client.id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo quitar al cliente local.");
      }
      setClients((current) => current.filter((item) => item.id !== client.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo quitar al cliente local.");
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Clientes que firman contratos de locales</CardTitle>
              <div className="flex items-center gap-3">
                <BusquedaInput value={busqueda} onChange={setBusqueda} placeholder="Buscar cliente…" className="w-64" />
                {loading && <span className="text-sm text-muted-foreground">Cargando…</span>}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : clients.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">
                No hay clientes locales registrados. Aparecerán cuando su contrato esté firmado y notariado.
              </p>
            ) : (
              <TableScroll className="max-h-[32rem] w-full rounded-md border">
                <div className="max-h-[30rem] overflow-y-auto">
                  <table className="w-full min-w-[1280px] text-sm">
                    <thead className="sticky top-0 z-10 bg-[#151a24] text-left text-xs text-white/80">
                      <tr>
                        <th className="px-3 py-2 font-medium">WhatsApp</th>
                        <th onClick={() => cambiarOrden("local")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Código local{sortKey === "local" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th className="px-3 py-2 font-medium">Contrato notariado</th>
                        <th onClick={() => cambiarOrden("nombre")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Nombre{sortKey === "nombre" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th className="px-3 py-2 font-medium">Documento</th>
                        <th onClick={() => cambiarOrden("telefono")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Teléfono{sortKey === "telefono" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("inicioContrato")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Inicio contrato{sortKey === "inicioContrato" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("finContrato")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Fin contrato{sortKey === "finContrato" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("inicioAdenda")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Inicio adenda{sortKey === "inicioAdenda" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("finAdenda")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Fin adenda{sortKey === "finAdenda" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th onClick={() => cambiarOrden("tipo")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          Tipo{sortKey === "tipo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th className="px-3 py-2 font-medium">Nacionalidad</th>
                        <th onClick={() => cambiarOrden("ruc")} className="cursor-pointer select-none px-3 py-2 font-medium hover:bg-white/5">
                          RUC{sortKey === "ruc" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </th>
                        <th className="px-3 py-2 font-medium">Cuenta cliente</th>
                        {puedeEliminar && <th className="px-3 py-2 font-medium">Eliminar</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {clientesTabla.map((client) => {
                        const whatsApp = numeroWhatsApp(client.telefono, client.codigoPais ?? "51");
                        return (
                          <tr key={client.id} className="border-t">
                            <td className="px-3 py-2">
                              {whatsApp ? (
                                <a href={`https://wa.me/${whatsApp}`} target="_blank" rel="noopener noreferrer" title={`Escribir por WhatsApp a ${client.telefono}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-white hover:opacity-90">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.247-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                  </svg>
                                </a>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 font-mono font-medium">
                              <Link href={`/locales/contratos?localId=${encodeURIComponent(client.localId)}`} className="text-primary hover:underline">
                                {client.codigoLocal}
                              </Link>
                            </td>
                            <td className="px-3 py-2">
                              {client.contractDocumentId ? (
                                <button
                                  type="button"
                                  onClick={() => setDocumentPreview({
                                    id: client.contractDocumentId!,
                                    filename: client.contractDocumentName ?? `Contrato ${client.codigoContrato}`,
                                    mimeType: client.contractDocumentMimeType ?? "",
                                  })}
                                  className="whitespace-nowrap rounded-md border px-3 py-1.5 text-xs text-primary hover:bg-muted"
                                >
                                  Ver contrato
                                </button>
                              ) : (
                                <span className="text-muted-foreground">Sin archivo adjunto</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              <Link href={`/locales/contactos?localId=${encodeURIComponent(client.contactLocalId)}`} className="text-primary hover:underline">
                                {[client.nombres, client.apellidos].filter(Boolean).join(" ")}
                              </Link>
                            </td>
                            <td className="px-3 py-2">{client.documentoIdentidad}</td>
                            <td className="px-3 py-2 text-muted-foreground">{client.telefono ?? "—"}</td>
                            <td className="px-3 py-2">{fmtFecha(client.fechaInicioContrato)}</td>
                            <td className="px-3 py-2">{fmtFecha(client.fechaFinContrato)}</td>
                            <td className="px-3 py-2">{fmtFecha(client.fechaInicioAdenda)}</td>
                            <td className="px-3 py-2">{fmtFecha(client.fechaFinAdenda)}</td>
                            <td className="px-3 py-2">{client.tipoPersona === PersonType.NATURAL ? "Natural" : "Jurídica"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{client.nacionalidad ?? "—"}</td>
                            <td className="px-3 py-2">{client.ruc ?? "—"}</td>
                            <td className="px-3 py-2">
                              <Link href="/configuraciones/usuarios" className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-cyan-700 px-2 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-700 hover:text-white">
                                Gestionar en Usuarios
                              </Link>
                            </td>
                            {puedeEliminar && (
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => void eliminarCliente(client)} className="inline-flex h-8 items-center rounded-md border border-red-600 px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white">
                                  Eliminar
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </TableScroll>
            )}
          </CardContent>
        </Card>
        {documentPreview ? (
          <LocalAttachmentPreview
            src={`/api/locales/documentos/${encodeURIComponent(documentPreview.id)}`}
            filename={documentPreview.filename}
            mimeType={documentPreview.mimeType}
            onClose={() => setDocumentPreview(null)}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
