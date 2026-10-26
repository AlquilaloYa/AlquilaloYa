"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, ExternalLink, RefreshCw } from "lucide-react";
import { AccessControl, Permission } from "@contract/domain/rbac";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type ClientRequest = {
  id: string;
  clientName: string;
  departmentCode: string | null;
  departmentName: string | null;
  issueType: string;
  description: string;
  customerPresentAtVisit: boolean;
  availabilityOptions: Array<{ startsAt: string; endsAt: string }>;
  status: "PENDING" | "CONVERTED" | "REJECTED";
  workOrderId: string | null;
  workOrderCode: string | null;
  createdAt: string;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  }>;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ClientRequestsPage() {
  const { user } = useAuth();
  const canRead = !!user && AccessControl.forRole(user.role, user.additionalPermissions).can(Permission.WORK_ORDER_READ);
  const canConvert = !!user && AccessControl.forRole(user.role, user.additionalPermissions).can(Permission.WORK_ORDER_CREATE);
  const [items, setItems] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/client-requests", { cache: "no-store" });
      const body = (await response.json()) as { items?: ClientRequest[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
      setItems(body.items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function convert(item: ClientRequest) {
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/client-requests/${item.id}/convert`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        workOrder?: { code: string };
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
      setNotice(`Solicitud convertida en la orden ${body.workOrder?.code ?? ""}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la orden de trabajo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-headline-lg text-primary">Pedidos de clientes</h1>
            <p className="mt-1 font-body-sm text-on-surface-variant">
              Revisa los reportes enviados por los inquilinos y deriva los aprobados a órdenes de trabajo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface hover:bg-surface-variant disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </header>

        {!canRead ? (
          <div role="alert" className="rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            No tienes permiso para consultar los pedidos de clientes.
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="rounded-lg bg-secondary-container p-4 font-body-sm text-secondary-container-foreground">
            {notice}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center font-body-sm text-on-surface-variant">
            Cargando solicitudes…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-surface-container-lowest p-10 text-center font-body-sm text-on-surface-variant">
            <ClipboardList className="mx-auto mb-3 h-8 w-8 text-on-surface-variant" />
            No hay solicitudes de clientes.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article key={item.id} className="space-y-4 rounded-lg bg-surface-container-lowest p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono-label text-on-surface-variant">
                      {item.departmentCode ?? "Sin departamento"} · {item.clientName}
                    </p>
                    <h2 className="mt-1 font-headline-md text-on-surface">{item.issueType}</h2>
                    <p className="mt-1 font-body-sm text-on-surface-variant">
                      {item.departmentName ? `${item.departmentName} · ` : ""}
                      Recibido {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 font-label-md ${
                      item.status === "PENDING"
                        ? "bg-amber-100 text-amber-900"
                        : item.status === "CONVERTED"
                          ? "bg-secondary-container text-secondary-container-foreground"
                          : "bg-error-container text-error-container-foreground"
                    }`}
                  >
                    {item.status === "PENDING"
                      ? "Pendiente de revisión"
                      : item.status === "CONVERTED"
                        ? `Orden ${item.workOrderCode ?? "creada"}`
                        : "Rechazada"}
                  </span>
                </div>

                <p className="whitespace-pre-wrap rounded-md bg-surface-container-low p-4 font-body-sm text-on-surface">
                  {item.description}
                </p>

                <div className="flex flex-wrap gap-x-6 gap-y-2 font-body-sm text-on-surface-variant">
                  <span>
                    Presencia del inquilino: {item.customerPresentAtVisit ? "Sí" : "No"}
                  </span>
                  {item.availabilityOptions.map((option, index) => (
                    <span key={`${option.startsAt}-${index}`}>
                      Opción {index + 1}: {formatDate(option.startsAt)} – {formatDate(option.endsAt)}
                    </span>
                  ))}
                </div>

                {item.attachments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {item.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-outline-variant px-3 py-2 font-body-sm text-primary hover:bg-surface-container-low"
                      >
                        {attachment.fileName}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                ) : null}

                {item.status === "PENDING" && canConvert ? (
                  <div className="flex justify-end border-t border-outline-variant/50 pt-4">
                    <button
                      type="button"
                      onClick={() => void convert(item)}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {busyId === item.id ? "Creando orden…" : "Derivar a orden de trabajo"}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </main>
    </DashboardShell>
  );
}
