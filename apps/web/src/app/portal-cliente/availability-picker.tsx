"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import type { ClientAvailabilityInput } from "@/lib/client-portal-availability";

type AvailabilityPickerProps = {
  index: number;
  option: ClientAvailabilityInput;
  today: string;
  onChange: (field: keyof ClientAvailabilityInput, value: string) => void;
};

type ClockStep = "hour" | "minute";

const WEEK_DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const CLOCK_NUMBERS = Array.from({ length: 12 }, (_, index) => index);

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
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatClockTime(value: string): string {
  if (!/^\d{2}:\d{2}$/.test(value)) return "Elegir hora";
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date(2020, 0, 1, hour, minute);
  return new Intl.DateTimeFormat("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clockPosition(index: number): { left: string; top: string } {
  const angle = (index / 12) * Math.PI * 2;
  const radius = 41;
  return {
    left: `${50 + Math.sin(angle) * radius}%`,
    top: `${50 - Math.cos(angle) * radius}%`,
  };
}

function parseTime(value: string): { hour: number; minute: number } | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3, 5));
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function periodForHour(hour: number): "AM" | "PM" {
  return hour >= 12 ? "PM" : "AM";
}

function displayHour(hour: number): number {
  const value = hour % 12;
  return value === 0 ? 12 : value;
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
  const [openPicker, setOpenPicker] = useState<"calendar" | "clock" | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseLocalDate(option.date);
    const current = parseLocalDate(today) ?? new Date();
    return selected ?? current;
  });
  const [clockStep, setClockStep] = useState<ClockStep>("hour");
  const [selectedHour, setSelectedHour] = useState(() => {
    const parsed = parseTime(option.time);
    return parsed ? displayHour(parsed.hour) : 9;
  });
  const [selectedMinute, setSelectedMinute] = useState(() => {
    const parsed = parseTime(option.time);
    return parsed ? Math.floor(parsed.minute / 5) * 5 : 0;
  });
  const [period, setPeriod] = useState<"AM" | "PM">(() => {
    const parsed = parseTime(option.time);
    return parsed ? periodForHour(parsed.hour) : "AM";
  });

  const selectedDate = parseLocalDate(option.date);
  const selectedDateTime = localDateTime(option.date, option.time);
  const now = new Date();
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
  const clockHour24 = selectedHour % 12 + (period === "PM" ? 12 : 0);
  const displayedMinute = String(selectedMinute).padStart(2, "0");
  const minuteOptions = CLOCK_NUMBERS.map((number) => number * 5);

  function setDate(value: string) {
    onChange("date", value);
    setOpenPicker(null);
    if (option.time) {
      const startsAt = localDateTime(value, option.time);
      if (startsAt && startsAt <= new Date()) onChange("time", "");
    }
  }

  function openClock() {
    const parsed = parseTime(option.time);
    setSelectedHour(parsed ? displayHour(parsed.hour) : 9);
    setSelectedMinute(parsed ? Math.floor(parsed.minute / 5) * 5 : 0);
    setPeriod(parsed ? periodForHour(parsed.hour) : "AM");
    setClockStep(parsed ? "minute" : "hour");
    setOpenPicker((current) => current === "clock" ? null : "clock");
  }

  function chooseHour(hour: number) {
    setSelectedHour(hour);
    setClockStep("minute");
  }

  function chooseMinute(minute: number) {
    const nextHour = selectedHour % 12 + (period === "PM" ? 12 : 0);
    const nextTime = `${String(nextHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const startsAt = localDateTime(option.date, nextTime);
    if (!startsAt || startsAt <= new Date()) return;
    setSelectedMinute(minute);
    onChange("time", nextTime);
    setOpenPicker(null);
  }

  function isHourInPast(hour: number): boolean {
    if (option.date !== today) return false;
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour % 12 + (period === "PM" ? 12 : 0),
      55,
    );
    return candidate <= now;
  }

  function isMinuteInPast(minute: number): boolean {
    if (option.date !== today) return false;
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      clockHour24,
      minute,
    );
    return candidate <= now;
  }

  return (
    <div className="portal-availability-option">
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
          <span><Clock3 aria-hidden /> Hora</span>
          <button
            type="button"
            className="portal-picker-trigger"
            aria-label={`Elegir hora para la opción ${index + 1}`}
            aria-haspopup="dialog"
            aria-expanded={openPicker === "clock"}
            disabled={!option.date}
            onClick={openClock}
          >
            <Clock3 aria-hidden />
            <span>{formatClockTime(option.time)}</span>
          </button>
          {openPicker === "clock" && (
            <div
              className="portal-picker-popover portal-clock-popover"
              role="dialog"
              aria-label={`Reloj para la opción ${index + 1}`}
            >
              <div className="portal-clock-heading">
                <div>
                  <p>{clockStep === "hour" ? "Elige la hora" : "Elige los minutos"}</p>
                  <strong>{selectedHour}:{displayedMinute} {period}</strong>
                </div>
                <div className="portal-clock-period" aria-label="Período del día">
                  {(["AM", "PM"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={period === item}
                      className={period === item ? "active" : ""}
                      onClick={() => setPeriod(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="portal-clock-face" aria-label="Esfera del reloj">
                <span
                  className="portal-clock-hand"
                  style={{
                    transform: `rotate(${clockStep === "hour" ? (selectedHour % 12) * 30 : selectedMinute * 6}deg)`,
                  }}
                  aria-hidden="true"
                />
                {clockStep === "hour"
                  ? CLOCK_NUMBERS.map((number) => {
                      const hour = number === 0 ? 12 : number;
                      const isSelected = selectedHour === hour;
                      const isDisabled = isHourInPast(hour);
                      return (
                        <button
                          key={hour}
                          type="button"
                          className={[
                            "portal-clock-number",
                            isSelected ? "selected" : "",
                          ].filter(Boolean).join(" ")}
                          style={clockPosition(number)}
                          disabled={isDisabled}
                          aria-label={`${hour} ${period}`}
                          aria-pressed={isSelected}
                          onClick={() => chooseHour(hour)}
                        >
                          {hour}
                        </button>
                      );
                    })
                  : minuteOptions.map((minute, number) => {
                      const isSelected = selectedMinute === minute;
                      const isDisabled = isMinuteInPast(minute);
                      return (
                        <button
                          key={minute}
                          type="button"
                          className={[
                            "portal-clock-number",
                            isSelected ? "selected" : "",
                          ].filter(Boolean).join(" ")}
                          style={clockPosition(number)}
                          disabled={isDisabled}
                          aria-label={`${minute} minutos`}
                          aria-pressed={isSelected}
                          onClick={() => chooseMinute(minute)}
                        >
                          {String(minute).padStart(2, "0")}
                        </button>
                      );
                    })}
                <span className="portal-clock-center" aria-hidden="true" />
              </div>
              {clockStep === "hour" ? (
                <p className="portal-clock-hint">Selecciona una hora para continuar</p>
              ) : (
                <button
                  type="button"
                  className="portal-clock-back"
                  onClick={() => setClockStep("hour")}
                >
                  Cambiar hora
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <span className="portal-visually-hidden" aria-live="polite">
        Fecha seleccionada: {formatDate(option.date)}. Hora seleccionada: {formatClockTime(option.time)}.
      </span>
      {selectedDateTime && selectedDateTime <= new Date() && (
        <p className="portal-picker-validation">Selecciona una hora futura.</p>
      )}
    </div>
  );
}
