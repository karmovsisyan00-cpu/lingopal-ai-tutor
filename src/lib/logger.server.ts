// Structured logging with per-request IDs for external API monitoring.
// Use `withRequestLog(scope, fn)` to wrap any external API call — it emits
// a start / success / error line tagged with a unique request ID and
// duration in ms, so failures can be traced quickly in server logs.

type LogFields = Record<string, unknown>;

function newRequestId(): string {
  // Short random ID — enough entropy for correlation across a single request.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

function fmt(level: "info" | "warn" | "error", scope: string, reqId: string, fields: LogFields) {
  const payload = { level, scope, reqId, ts: new Date().toISOString(), ...fields };
  const line = `[${scope}] ${reqId} ${JSON.stringify(payload)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(scope: string, reqId: string, fields: LogFields = {}) {
  fmt("info", scope, reqId, fields);
}
export function logWarn(scope: string, reqId: string, fields: LogFields = {}) {
  fmt("warn", scope, reqId, fields);
}
export function logError(scope: string, reqId: string, error: unknown, fields: LogFields = {}) {
  const err =
    error instanceof Error
      ? { message: error.message, name: error.name, stack: error.stack?.split("\n").slice(0, 4).join(" | ") }
      : { message: String(error) };
  fmt("error", scope, reqId, { ...fields, error: err });
}

export async function withRequestLog<T>(
  scope: string,
  fn: (reqId: string) => Promise<T>,
  meta: LogFields = {},
): Promise<T> {
  const reqId = newRequestId();
  const start = Date.now();
  logInfo(scope, reqId, { phase: "start", ...meta });
  try {
    const result = await fn(reqId);
    logInfo(scope, reqId, { phase: "success", durationMs: Date.now() - start });
    return result;
  } catch (error) {
    logError(scope, reqId, error, { phase: "error", durationMs: Date.now() - start, ...meta });
    throw error;
  }
}
