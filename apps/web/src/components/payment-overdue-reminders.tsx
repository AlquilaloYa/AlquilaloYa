"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

type OverduePayment = {
  id: string;
  contractId: string;
  codigoContrato: string;
  cliente: string;
  periodo: string;
  diasAtraso: number;
};

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
const STORAGE_KEY = "payment-overdue-reminder-times";

function readReminderTimes(): Map<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Estado de recordatorios guardado inválido");
    }
    return new Map(
      Object.entries(parsed).flatMap(([id, value]) =>
        typeof value === "number" && Number.isFinite(value) ? [[id, value]] : [],
      ),
    );
  } catch (error) {
    console.error("No se pudieron leer los intervalos de alerta de cobranza:", error);
    return new Map();
  }
}

export function PaymentOverdueReminders() {
  const { user, loading } = useAuth();
  const [alerts, setAlerts] = useState<OverduePayment[]>([]);
  const reminderTimes = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    if (loading || !user) {
      setAlerts([]);
      return;
    }
    let active = true;
    reminderTimes.current = readReminderTimes();

    const check = async () => {
      try {
        const response = await apiFetch("/api/payments/overdue", {
          cache: "no-store",
          sesionCritica: false,
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : `Error ${response.status}`;
          throw new Error(message);
        }
        if (
          typeof body !== "object" ||
          body === null ||
          !("overdue" in body) ||
          !Array.isArray(body.overdue)
        ) {
          throw new Error("La respuesta de pagos vencidos no tiene el formato esperado.");
        }
        if (!active) return;

        const overdue = body.overdue as OverduePayment[];
        const overdueIds = new Set(overdue.map((payment) => payment.id));
        const now = Date.now();
        const times = reminderTimes.current ?? new Map<string, number>();
        const dueForReminder = overdue.filter((payment) => {
          const lastReminder = times.get(payment.id) ?? 0;
          if (now - lastReminder < REMINDER_INTERVAL_MS) return false;
          times.set(payment.id, now);
          return true;
        });

        if (dueForReminder.length > 0) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(times)));
          } catch (error) {
            console.error("No se pudieron guardar los intervalos de alerta de cobranza:", error);
          }
        }
        reminderTimes.current = times;

        setAlerts((current) => {
          const remaining = current.filter((payment) => overdueIds.has(payment.id));
          const existingIds = new Set(remaining.map((payment) => payment.id));
          return [
            ...remaining,
            ...dueForReminder.filter((payment) => !existingIds.has(payment.id)),
          ];
        });
      } catch (error) {
        if (active) console.error("No se pudieron consultar los pagos vencidos:", error);
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loading, user]);

  if (alerts.length === 0) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 left-4 z-[60] w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-red-300 bg-red-50 text-red-950 shadow-2xl dark:border-red-900 dark:bg-red-950 dark:text-red-50"
    >
      <div className="flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Pago pendiente</p>
          <p className="mt-1 text-sm">Pago que vence hoy o sigue sin voucher:</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
            {alerts.map((payment) => (
              <li key={payment.id}>
                <span className="font-semibold">{payment.cliente}</span>
                <span className="block text-xs opacity-80">
                  {payment.codigoContrato} ·{" "}
                  {payment.diasAtraso === 0
                    ? "pago vence hoy"
                    : `${payment.diasAtraso} ${
                        payment.diasAtraso === 1 ? "día" : "días"
                      } de atraso`}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/pagos"
            onClick={() => setAlerts([])}
            className="mt-3 inline-flex rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 dark:bg-red-300 dark:text-red-950 dark:hover:bg-red-200"
          >
            Ir a Cobranza
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setAlerts([])}
          className="rounded p-1 text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900"
          aria-label="Cerrar alerta temporalmente"
          title="Se repetirá cada hora mientras el pago siga pendiente"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 bg-red-600 dark:bg-red-400" />
    </aside>
  );
}
