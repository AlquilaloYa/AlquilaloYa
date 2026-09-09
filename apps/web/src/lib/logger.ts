/**
 * Logger estructurado JSON (Fase 7 - observabilidad).
 * - Salida en una línea por evento (JSON) apta para agregadores (Loki/CloudWatch).
 * - Filtrado por nivel vía LOG_LEVEL (debug < info < warn < error).
 * - Sink inyectable para testear sin tocar la consola real.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogRecord {
  level: LogLevel;
  msg: string;
  time: string;
  ctx?: Record<string, unknown>;
}

export type LogSink = (line: string, level: LogLevel) => void;

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const defaultSink: LogSink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  /** Crea un sub-logger que fusiona contexto persistente (p. ej. requestId). */
  child(extra: Record<string, unknown>): Logger;
}

export function createLogger(opts?: {
  sink?: LogSink;
  base?: Record<string, unknown>;
}): Logger {
  const sink = opts?.sink ?? defaultSink;
  const base = opts?.base ?? {};

  function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
    const record: LogRecord = {
      level,
      msg,
      time: new Date().toISOString(),
      ...(Object.keys(base).length || ctx
        ? { ctx: { ...base, ...(ctx ?? {}) } }
        : {}),
    };
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      line = JSON.stringify({ level, msg: "[unserializable log]", time: record.time });
    }
    sink(line, level);
  }

  return {
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
    child: (extra) => createLogger({ sink, base: { ...base, ...extra } }),
  };
}

/** Logger por defecto de la aplicación. */
export const logger = createLogger();
