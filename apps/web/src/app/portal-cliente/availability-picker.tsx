"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ClientAvailabilityInput } from "@/lib/client-portal-availability";

type AvailabilityPickerProps = {
  index: number;
  option: ClientAvailabilityInput;
  today: string;
  onChange: (field: keyof ClientAvailabilityInput, value: string) => void;
};

const WEEK_DAYS = ["L", "M", "M", "J", "V", "S", "D"];

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
  const [openPicker, setOpenPicker] = useState<"calendar" | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseLocalDate(option.date);
    const current = parseLocalDate(today) ?? new Date();
    return selected ?? current;
  });
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
    <div className="portal-availability-option">
      <p className="portal-availability-number">Opción {index + 1}</p>
      <div className="portal-date-time-fields">
        <div className="portal-picker-field">
          <span><CalendarDays aria-hidden /> Fecha (DD/MM/AAAA)</span>
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
          <label htmlFor={`portal-availability-time-${index}`}>
            Hora (formato 24 horas)
          </label>
          <input
            id={`portal-availability-time-${index}`}
            type="time"
            step={300}
            aria-label={`Elegir hora para la opción ${index + 1}`}
            value={option.time}
            disabled={!option.date}
            onChange={(event) => onChange("time", event.target.value)}
          />
        </div>
      </div>
      <span className="portal-visually-hidden" aria-live="polite">
        Fecha seleccionada: {formatDate(option.date)}. Hora seleccionada: {option.time || "Elegir hora"}.
      </span>
      {selectedDateTime && selectedDateTime <= new Date() && (
        <p className="portal-picker-validation">Selecciona una hora futura.</p>
      )}
    </div>
  );
}
