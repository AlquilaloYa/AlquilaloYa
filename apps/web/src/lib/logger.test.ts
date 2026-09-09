import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "./logger";

let prevLevel: string | undefined;
beforeEach(() => {
  prevLevel = process.env.LOG_LEVEL;
});
afterEach(() => {
  if (prevLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = prevLevel;
});

describe("logger estructurado", () => {
  it("emite JSON con level, msg, time y ctx", () => {
    process.env.LOG_LEVEL = "info";
    const lines: string[] = [];
    const log = createLogger({ sink: (l: string) => lines.push(l) });
    log.info("contrato emitido", { contratoId: "c1" });
    const rec = JSON.parse(lines[0]!);
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("contrato emitido");
    expect(rec.ctx.contratoId).toBe("c1");
    expect(typeof rec.time).toBe("string");
  });

  it("filtra por debajo del nivel configurado", () => {
    process.env.LOG_LEVEL = "warn";
    const seen: LogLevel[] = [];
    const log = createLogger({ sink: (_l, lvl) => seen.push(lvl) });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(seen).toEqual(["warn", "error"]);
  });

  it("child fusiona contexto persistente", () => {
    process.env.LOG_LEVEL = "debug";
    const lines: string[] = [];
    const log = createLogger({ sink: (l: string) => lines.push(l), base: { app: "erp" } });
    const child = log.child({ requestId: "r-9" });
    child.error("boom", { extra: 1 });
    const rec = JSON.parse(lines[lines.length - 1]!);
    expect(rec.ctx).toEqual({ app: "erp", requestId: "r-9", extra: 1 });
  });
});
