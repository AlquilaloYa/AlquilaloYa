"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AccessControl, Permission } from "@contract/domain/rbac";
import {
  suggestedActionForQueue,
  type WorkflowBoard,
  type WorkflowQueue,
  type WorkflowTask,
} from "@contract/domain/workflow";
import { AlertTriangle, RefreshCw, Workflow } from "lucide-react";

const COLUMNS: Array<{
  key: keyof WorkflowBoard;
  queue: WorkflowQueue;
  title: string;
  hint: string;
}> = [
  {
    key: "pendienteEmision",
    queue: "PENDIENTE_EMISION",
    title: "Pendiente de emisión",
    hint: "Listos para emitir PDF y snapshot",
  },
  {
    key: "emitido",
    queue: "EMITIDO",
    title: "Emitido",
    hint: "Esperan solicitud de firma",
  },
  {
    key: "pendienteFirma",
    queue: "PENDIENTE_FIRMA",
    title: "Pendiente de firma",
    hint: "Firma interna del contrato",
  },
  {
    key: "porVencer",
    queue: "POR_VENCER",
    title: "Por vencer (30 días)",
    hint: "Firmados próximos a finalizar",
  },
];

function canRunAction(role: string | undefined, action: string): boolean {
  if (!role) return false;
  const ac = AccessControl.forRole(role as Parameters<typeof AccessControl.forRole>[0]);
  if (action === "emit") return ac.can(Permission.CONTRACT_EMIT);
  if (action === "requestFirma" || action === "firmar") {
    return ac.can(Permission.CONTRACT_SIGN);
  }
  return ac.can(Permission.CONTRACT_UPDATE);
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-PE");
}

export default function WorkflowPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<WorkflowBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/workflow");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setBoard((await res.json()) as WorkflowBoard);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(task: WorkflowTask, action: string) {
    setBusyId(task.contractId);
    setError(null);
    try {
      const res = await apiFetch(`/api/contracts/${task.contractId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const total = board
    ? board.pendienteEmision.length +
      board.emitido.length +
      board.pendienteFirma.length +
      board.porVencer.length
    : 0;

  return (
    <DashboardShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="font-headline-lg text-primary mb-1">Workflow</h2>
            <p className="font-body-sm text-on-surface-variant">
              Cola operativa de contratos · {total} pendientes
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-md bg-surface-container-low px-4 py-2 font-label-md text-on-surface transition-colors hover:bg-surface-variant"
          >
            <RefreshCw className="h-4 w-4" />
            Refrescar
          </button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-error-container p-4 font-body-sm text-error-container-foreground">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        ) : null}

        {!board && !error ? (
          <div className="flex items-center gap-3 py-16 font-body-md text-on-surface-variant">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
            Cargando tablero…
          </div>
        ) : board ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {COLUMNS.map((col) => {
              const items = board[col.key];
              const suggested = suggestedActionForQueue(col.queue);
              return (
                <section
                  key={col.key}
                  className="flex min-h-[280px] flex-col rounded-lg bg-surface-container-lowest shadow-sm"
                >
                  <header className="border-b border-outline-variant/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-headline-md text-primary">{col.title}</h3>
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-label text-on-surface-variant">
                        {items.length}
                      </span>
                    </div>
                    <p className="mt-1 font-body-sm text-on-surface-variant">{col.hint}</p>
                  </header>
                  <ul className="flex flex-1 flex-col gap-3 p-3">
                    {items.length === 0 ? (
                      <li className="rounded-md border border-dashed border-outline-variant/60 p-4 text-center font-body-sm text-on-surface-variant">
                        Sin contratos en esta cola.
                      </li>
                    ) : (
                      items.map((task) => (
                        <li
                          key={task.id}
                          className="rounded-md bg-surface-container-low p-3 shadow-sm"
                        >
                          <Link
                            href={`/contratos/${task.contractId}`}
                            className="font-label-md text-primary hover:underline"
                          >
                            {task.codigoContrato}
                          </Link>
                          <p className="mt-1 font-body-sm text-on-surface">{task.clienteNombre}</p>
                          <p className="font-mono-label text-on-surface-variant">
                            {task.departamentoNombre}
                          </p>
                          {task.fechaFin ? (
                            <p className="mt-1 font-mono-label text-on-surface-variant">
                              Fin: {fechaCorta(task.fechaFin)}
                            </p>
                          ) : null}
                          {suggested && canRunAction(user?.role, suggested.action) ? (
                            <button
                              disabled={busyId === task.contractId}
                              onClick={() => void runAction(task, suggested.action)}
                              className="mt-3 w-full rounded-md bg-primary px-3 py-1.5 font-label-md text-primary-foreground disabled:opacity-40"
                            >
                              {busyId === task.contractId ? "Procesando…" : suggested.label}
                            </button>
                          ) : col.queue === "POR_VENCER" ? (
                            <Link
                              href={`/contratos/${task.contractId}`}
                              className="mt-3 inline-flex w-full justify-center rounded-md bg-surface-container-high px-3 py-1.5 font-label-md text-on-surface"
                            >
                              Revisar renovación
                            </Link>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : null}

        <p className="flex items-center gap-2 font-body-sm text-on-surface-variant">
          <Workflow className="h-4 w-4" />
          La firma electrónica externa se activa en producción; aquí se registra la firma interna del flujo contractual.
        </p>
      </div>
    </DashboardShell>
  );
}
