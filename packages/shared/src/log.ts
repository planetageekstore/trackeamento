// Logging estruturado mínimo (JSON) — isomórfico. Não registra segredos.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentThreshold(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const lvl = (env?.LOG_LEVEL as LogLevel) ?? "info";
  return LEVEL_ORDER[lvl] ?? LEVEL_ORDER.info;
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < currentThreshold()) return;
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (m, c) => emit("debug", m, { ...bindings, ...c }),
    info: (m, c) => emit("info", m, { ...bindings, ...c }),
    warn: (m, c) => emit("warn", m, { ...bindings, ...c }),
    error: (m, c) => emit("error", m, { ...bindings, ...c }),
    child: (b) => createLogger({ ...bindings, ...b }),
  };
}

export const log = createLogger();
