"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

type GEvent = {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
};

type Popup = {
  id: string;
  summary: string;
  description: string;
  label: string;
};

const POLL_MS = 60_000;
const ADVANCE_MIN = 15;
const AUTO_DISMISS_MS = 20_000;

function notifyDesktop(p: Popup) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("AlquilaYa ERP — Cita", {
      body: `${p.label}: ${p.summary}${p.description ? `\n${p.description}` : ""}`,
      icon: "/logo-light.svg",
      tag: `cita-${p.id}`,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = "/agenda";
    };
  } catch {
    /* silencioso */
  }
}

export function AppointmentReminders() {
  const pathname = usePathname();
  const [popups, setPopups] = useState<Popup[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const notifiedRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    dismissedRef.current.add(id);
    setPopups((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    if (pathname === "/agenda") {
      setPopups([]);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    let active = true;

    const tick = async () => {
      try {
        const now = new Date();
        const min = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
        const max = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
        const res = await apiFetch(
          `/api/agenda?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { connected: boolean; events: GEvent[] };
        if (!data.connected || !active) return;

        const due: Popup[] = [];
        for (const ev of data.events ?? []) {
          if (ev.allDay || dismissedRef.current.has(ev.id)) continue;
          const start = new Date(ev.start).getTime();
          const end = new Date(ev.end).getTime();
          const nowT = now.getTime();
          const minsUntil = Math.round((start - nowT) / 60_000);
          if (minsUntil >= 0 && minsUntil <= ADVANCE_MIN) {
            due.push({
              id: ev.id,
              summary: ev.summary,
              description: ev.description,
              label: minsUntil === 0 ? "Empieza ahora" : minsUntil === 1 ? "En 1 min" : `En ${minsUntil} min`,
            });
          } else if (start <= nowT && end >= nowT) {
            due.push({ id: ev.id, summary: ev.summary, description: ev.description, label: "En curso" });
          }
        }
        if (due.length > 0) {
          for (const d of due) {
            if (notifiedRef.current.has(d.id)) continue;
            notifiedRef.current.add(d.id);
            notifyDesktop(d);
          }
          setPopups((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            return [...prev, ...due.filter((d) => !existing.has(d.id))];
          });
        }
      } catch {
        /* silencioso: no molestar si falla la agenda */
      }
    };

    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const first = popups[0];
    if (!first) return;
    const t = setTimeout(() => dismiss(first.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [popups, dismiss]);

  if (pathname === "/agenda" || popups.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {popups.map((p) => (
        <div
          key={p.id}
          className="flex items-start gap-3 rounded-lg border border-primary/30 bg-surface-container-low p-4 shadow-xl"
        >
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono-label text-[10px] font-medium uppercase tracking-wide text-primary">{p.label}</p>
            <p className="mt-0.5 font-label-md text-on-surface">{p.summary}</p>
            {p.description ? <p className="mt-0.5 line-clamp-2 font-body-sm text-on-surface-variant">{p.description}</p> : null}
            <Link
              href="/agenda"
              onClick={() => dismiss(p.id)}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-label-md text-primary-foreground hover:opacity-90"
            >
              Ver agenda
            </Link>
          </div>
          <button
            onClick={() => dismiss(p.id)}
            className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Cerrar recordatorio"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}