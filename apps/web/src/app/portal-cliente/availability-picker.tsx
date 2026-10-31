"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import type { ClientAvailabilityInput } from "@/lib/client-portal-availability";

type AvailabilityPickerProps = {
  index: number;
  option: ClientAvailabilityInput;
  today: string;
  onChange: (field: keyof ClientAvailabilityInput, value: string) => void;
};

const WEEK_DAYS = ["L", "M", "M", "J", "V", "S", "D"];

/* ---- selector de hora estilo iPhone (rueda de 12 horas con AM/PM) ---- */

const ITEM_HEIGHT = 40;
const MINUTE_STEP = 5;
const PERIOD_REPEATS = 12; // copias de AM/PM para que la rueda pueda girar centrada

type TimeSelection = { hour: number; minute: number; period: "AM" | "PM" };

function parseTime(value: string): TimeSelection | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || "");
  if (!match) return null;
  const hour24 = Number(match[1]);
  const period: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, minute: Number(match[2]), period };
}

function serializeTime(sel: TimeSelection): string {
  const hour24 =
    sel.period === "PM"
      ? sel.hour === 12 ? 12 : sel.hour + 12
      : sel.hour === 12 ? 0 : sel.hour;
  return `${String(hour24).padStart(2, "0")}:${String(sel.minute).padStart(2, "0")}`;
}

function formatTimeValue(value: string): string {
  const sel = parseTime(value);
  if (!sel) return "--:--";
  return `${sel.hour}:${String(sel.minute).padStart(2, "0")} ${sel.period}`;
}

type WheelItem = { key: string; label: string };

type WheelColumnProps = {
  ariaLabel: string;
  items: WheelItem[];
  initialIndex: number;
  onSettle: (index: number) => void;
};

function WheelColumn({ ariaLabel, items, initialIndex, onSettle }: WheelColumnProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const [active, setActive] = useState(initialIndex);

  // Posiciona la rueda en el valor inicial al abrir el popover.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = initialIndex * ITEM_HEIGHT;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // Los items y el indice inicial no cambian entre montajes del popover.
  }, []);

  function handleScroll() {
    const el = scroller.current;
    if (!el) return;
    const top = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop));
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      setActive(Math.round(top / ITEM_HEIGHT));
    });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const index = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
      // Empareja exactamente la rueda con el item elegido.
      el.scrollTo({ top: index * ITEM_HEIGHT, behavior: "auto" });
      onSettle(index);
    }, 140);
  }

  return (
    <div
      ref={scroller}
      className="portal-wheel"
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
    >
      {items.map((item, idx) => (
        <button
          key={item.key}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className={`portal-wheel-item${idx === active ? " active" : ""}`}
          onClick={() => {
            scroller.current?.scrollTo({
              top: idx * ITEM_HEIGHT,
              behavior: "smooth",
            });
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

type TimeWheelPickerProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
};

function TimeWheelPicker({ value, onChange, onClose }: TimeWheelPickerProps) {
  const initial = parseTime(value) ?? { hour: 9, minute: 0, period: "AM" as const };
  const hourItems: WheelItem[] = Array.from({ length: 12 }, (_, idx) => ({
    key: `h${idx + 1}`,
    label: `${idx + 1}`,
  }));
  const minuteItems: WheelItem[] = Array.from(
    { length: 60 / MINUTE_STEP },
    (_, idx) => ({
      key: `m${idx * MINUTE_STEP}`,
      label: String(idx * MINUTE_STEP).padStart(2, "0"),
    }),
  );
  const periodItems: WheelItem[] = Array.from(
    { length: PERIOD_REPEATS * 2 },
    (_, idx) => ({
      key: `p${idx}`,
      label: idx % 2 === 0 ? "AM" : "PM",
    }),
  );

  function commitHour(idx: number) {
    const next = { ...currentRef.current, hour: idx + 1 };
    currentRef.current = next;
    onChange(serializeTime(next));
  }

  function commitMinute(idx: number) {
    const next = { ...currentRef.current, minute: idx * MINUTE_STEP };
    currentRef.current = next;
    onChange(serializeTime(next));
  }

  function commitPeriod(idx: number) {
    const next: TimeSelection = {
      ...currentRef.current,
      period: idx % 2 === 0 ? "AM" : "PM",
    };
    currentRef.current = next;
    onChange(serializeTime(next));
  }

  const currentRef = useRef<TimeSelection>(initial);

  return (
    <div
      className="portal-picker-popover portal-time-popover"
      role="dialog"
      aria-label="Elegir hora de la visita"
    >
      <div className="portal-time-wheel-header">
        <p>Elige la hora</p>
        <button type="button" onClick={onClose}>
          Listo
        </button>
      </div>
      <div className="portal-time-wheel">
        <WheelColumn
          ariaLabel="Hora"
          items={hourItems}
          initialIndex={initial.hour - 1}
          onSettle={commitHour}
        />
        <WheelColumn
          ariaLabel="Minutos"
          items={minuteItems}
          initialIndex={initial.minute / MINUTE_STEP}
          onSettle={commitMinute}
        />
        <WheelColumn
          ariaLabel="Periodo AM o PM"
          items={periodItems}
          initialIndex={
            initial.period === "AM" ? (PERIOD_REPEATS - 1) * 2 : (PERIOD_REPEATS - 1) * 2 + 1
          }
          onSettle={commitPeriod}
        />
      </div>
    </div>
  );
}

/* ---- ---- picker de fecha + hora ---- ---- */

function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
    12,
  );
  return dateKey(date) === value ? date : null;
}

function formatDate(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return "Elegir día";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function AvailabilityPicker({
  index,
  option,
  today,
  onChange,
}: AvailabilityPickerProps) {
  const [openPicker, setOpenPicker] = useState<"calendar" | "time" | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseLocalDate(option.date);
    const current = parseLocalDate(today) ?? new Date();
    return selected ?? current;
  });
  const optionRef = useRef<HTMLDivElement>(null);

  // Cierra cualquier popover tocando cualquier parte fuera de la tarjeta.
  useEffect(() => {
    if (!openPicker) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        optionRef.current &&
        target instanceof Node &&
        !optionRef.current.contains(target)
      ) {
        setOpenPicker(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPicker(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openPicker]);

  const selectedDate = parseLocalDate(option.date);
  const selectedDateTime = localDateTime(option.date, option.time);
  const firstOfMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
    12,
  );
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const currentMonth = parseLocalDate(today) ?? new Date();
  const previousMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() - 1,
    1,
    12,
  );
  const isPreviousMonthDisabled =
    previousMonth.getFullYear() < currentMonth.getFullYear() ||
    (previousMonth.getFullYear() === currentMonth.getFullYear() &&
      previousMonth.getMonth() < currentMonth.getMonth());
  function setDate(value: string) {
    onChange("date", value);
    setOpenPicker(null);
    if (option.time) {
      const startsAt = localDateTime(value, option.time);
      if (startsAt && startsAt <= new Date()) onChange("time", "");
    }
  }

  return (
    <div className="portal-availability-option" ref={optionRef}>
      <p className="portal-availability-number">Opción {index + 1}</p>
      <div className="portal-date-time-fields">
        <div className="portal-picker-field">
          <span><CalendarDays aria-hidden /> Fecha</span>
          <button
            type="button"
            className="portal-picker-trigger"
            aria-label={`Elegir fecha para la opción ${index + 1}`}
            aria-haspopup="dialog"
            aria-expanded={openPicker === "calendar"}
            onClick={() => {
              if (selectedDate) setVisibleMonth(selectedDate);
              setOpenPicker((current) => current === "calendar" ? null : "calendar");
            }}
          >
            <CalendarDays aria-hidden />
            <span>{formatDate(option.date)}</span>
          </button>
          {openPicker === "calendar" && (
            <div
              className="portal-picker-popover portal-calendar-popover"
              role="dialog"
              aria-label={`Calendario para la opción ${index + 1}`}
            >
              <div className="portal-calendar-header">
                <button
                  type="button"
                  aria-label="Mes anterior"
                  disabled={isPreviousMonthDisabled}
                  onClick={() => setVisibleMonth(previousMonth)}
                >
                  <ChevronLeft aria-hidden />
                </button>
                <h4>{formatMonth(visibleMonth)}</h4>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  onClick={() => setVisibleMonth(
                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1, 12),
                  )}
                >
                  <ChevronRight aria-hidden />
                </button>
              </div>
              <div className="portal-calendar-grid">
                {WEEK_DAYS.map((day, dayIndex) => (
                  <span className="portal-calendar-weekday" key={`${day}-${dayIndex}`}>
                    {day}
                  </span>
                ))}
                {Array.from({ length: firstWeekday }, (_, dayIndex) => (
                  <span className="portal-calendar-empty" key={`empty-${dayIndex}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, dayIndex) => {
                  const day = dayIndex + 1;
                  const value = dateKey(new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth(),
                    day,
                    12,
                  ));
                  const isDisabled = value < today;
                  const isSelected = value === option.date;
                  const isToday = value === today;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isDisabled}
                      aria-label={new Intl.DateTimeFormat("es-PE", {
                        dateStyle: "full",
                      }).format(new Date(
                        visibleMonth.getFullYear(),
                        visibleMonth.getMonth(),
                        day,
                        12,
                      ))}
                      aria-pressed={isSelected}
                      className={[
                        "portal-calendar-day",
                        isSelected ? "selected" : "",
                        isToday ? "today" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => setDate(value)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="portal-picker-field">
          <span><Clock aria-hidden /> Hora (12 horas, AM/PM)</span>
          <button
            type="button"
            className="portal-picker-trigger"
            aria-label={`Elegir hora para la opción ${index + 1}`}
            aria-haspopup="dialog"
            aria-expanded={openPicker === "time"}
            disabled={!option.date}
            onClick={() =>
              setOpenPicker((current) => current === "time" ? null : "time")
            }
          >
            <Clock aria-hidden />
            <span>{option.time ? formatTimeValue(option.time) : "--:--"}</span>
          </button>
          {openPicker === "time" && (
            <TimeWheelPicker
              value={option.time}
              onChange={(value) => onChange("time", value)}
              onClose={() => setOpenPicker(null)}
            />
          )}
        </div>
      </div>
      <span className="portal-visually-hidden" aria-live="polite">
        Fecha seleccionada: {formatDate(option.date)}. Hora seleccionada:{" "}
        {option.time ? `${formatTimeValue(option.time)}` : "Elegir hora"}.
      </span>
      {selectedDateTime && selectedDateTime <= new Date() && (
        <p className="portal-picker-validation">Selecciona una hora futura.</p>
      )}
    </div>
  );
}
