"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Play, RefreshCw, X } from "lucide-react";
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
    url: string | null;
  }>;
};

type Employee = {
  id: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  area: string;
  equipo: string;
};

type Priority = "BAJA" | "MEDIA" | "ALTA" | "URGENTE";

type PreviewAttachment = ClientRequest["attachments"][number] & { url: string };

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [formValues, setFormValues] = useState<
    Record<string, { priority: Priority; assignedEmployeeId: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<PreviewAttachment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/client-requests", { cache: "no-store" });
      const body = (await response.json()) as { items?: ClientRequest[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
      setItems(body.items ?? []);
      if (canConvert) {
        const employeesResponse = await apiFetch("/api/operaciones/empleados", {
          cache: "no-store",
        });
        const employeesBody = (await employeesResponse.json()) as
          | Employee[]
          | { error?: string };
        if (!employeesResponse.ok || !Array.isArray(employeesBody)) {
          throw new Error(
            !Array.isArray(employeesBody)
              ? employeesBody.error ?? "No se pudo cargar el equipo de mantenimiento."
              : "No se pudo cargar el equipo de mantenimiento.",
          );
        }
        setEmployees(employeesBody);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }, [canConvert]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!previewAttachment) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewAttachment(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewAttachment]);

  async function convert(
    item: ClientRequest,
    values: { priority: Priority; assignedEmployeeId: string },
  ) {
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/client-requests/${item.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
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
                  <div className="flex flex-wrap gap-3">
                    {item.attachments.map((attachment) => {
                      const url = attachment.url;
                      if (!url) {
                        return (
                          <span
                            key={attachment.id}
                            title={`${attachment.fileName}: el archivo no está disponible en Storage`}
                            className="flex h-24 w-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-amber-300 bg-amber-50 px-2 text-center text-xs text-amber-900 sm:h-28 sm:w-28"
                          >
                            <ClipboardList aria-hidden className="h-5 w-5" />
                            <span>Archivo no disponible</span>
                            <span className="w-full truncate font-medium">{attachment.fileName}</span>
                          </span>
                        );
                      }
                      const preview = { ...attachment, url };
                      return (
                        <button
                          key={attachment.id}
                          type="button"
                          onClick={() => setPreviewAttachment(preview)}
                          aria-label={`Ver ${attachment.mimeType.startsWith("image/") ? "imagen" : "video"}: ${attachment.fileName}`}
                          className="group relative h-24 w-24 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:h-28 sm:w-28"
                        >
                          {attachment.mimeType.startsWith("image/") ? (
                            <img
                              src={url}
                              alt={attachment.fileName}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                          ) : (
                            <>
                              <video
                                src={url}
                                muted
                                playsInline
                                preload="metadata"
                                aria-hidden="true"
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                                <Play aria-hidden className="h-8 w-8 fill-current" />
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {item.status === "PENDING" && canConvert ? (
                  <div className="space-y-4 border-t border-outline-variant/50 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5 font-body-sm">
                        <span className="font-medium text-on-surface">Prioridad de la tarea</span>
                        <select
                          value={formValues[item.id]?.priority ?? "MEDIA"}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              [item.id]: {
                                priority: event.target.value as Priority,
                                assignedEmployeeId:
                                  current[item.id]?.assignedEmployeeId ?? "",
                              },
                            }))
                          }
                          disabled={busyId === item.id}
                          className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-on-surface"
                        >
                          <option value="BAJA">Baja</option>
                          <option value="MEDIA">Media</option>
                          <option value="ALTA">Alta</option>
                          <option value="URGENTE">Urgente</option>
                        </select>
                      </label>
                      <label className="block space-y-1.5 font-body-sm">
                        <span className="font-medium text-on-surface">Asignar a mantenimiento</span>
                        <select
                          value={formValues[item.id]?.assignedEmployeeId ?? ""}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              [item.id]: {
                                priority: current[item.id]?.priority ?? "MEDIA",
                                assignedEmployeeId: event.target.value,
                              },
                            }))
                          }
                          disabled={busyId === item.id}
                          className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-on-surface"
                        >
                          <option value="">Sin asignar</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {`${employee.nombres} ${employee.apellidos}`.trim()}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          void convert(item, {
                            priority: formValues[item.id]?.priority ?? "MEDIA",
                            assignedEmployeeId:
                              formValues[item.id]?.assignedEmployeeId ?? "",
                          })
                        }
                        disabled={busyId === item.id}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-label-md text-primary-foreground hover:opacity-90 disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {busyId === item.id ? "Creando orden…" : "Derivar a orden de trabajo"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </main>
      {previewAttachment ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-8"
          onClick={() => setPreviewAttachment(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Vista previa: ${previewAttachment.fileName}`}
            className="relative flex max-h-full w-full max-w-5xl flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewAttachment(null)}
              aria-label="Cerrar vista previa"
              className="absolute -top-12 right-0 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            >
              <X aria-hidden className="h-6 w-6" />
            </button>
            {previewAttachment.mimeType.startsWith("image/") ? (
              <img
                src={previewAttachment.url}
                alt={previewAttachment.fileName}
                className="max-h-[80vh] max-w-full rounded-lg object-contain"
              />
            ) : (
              <video
                src={previewAttachment.url}
                controls
                autoPlay
                playsInline
                className="max-h-[80vh] max-w-full rounded-lg"
              />
            )}
            <p className="max-w-full truncate text-sm text-white">{previewAttachment.fileName}</p>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
