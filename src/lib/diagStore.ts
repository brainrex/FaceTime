import type { DiagEvent, DiagLog } from "@/types";

let logs: DiagLog[] = [];
let listeners: (() => void)[] = [];

export function addLog(event: DiagEvent, message: string, keyId?: string): void {
  const entry: DiagLog = {
    id: Math.random().toString(36).slice(2),
    ts: Date.now(),
    event,
    message,
    keyId,
  };
  logs = [entry, ...logs].slice(0, 500); // cap at 500 entries
  listeners.forEach((fn) => fn());
}

export function getLogs(): DiagLog[] {
  return logs;
}

export function clearLogs(): void {
  logs = [];
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function exportLogsAsJson(): string {
  return JSON.stringify(
    logs.map((l) => ({
      time: new Date(l.ts).toISOString(),
      event: l.event,
      message: l.message,
      keyId: l.keyId ?? null,
    })),
    null,
    2
  );
}

export function exportLogsAsText(): string {
  return logs
    .map(
      (l) =>
        `[${new Date(l.ts).toISOString()}] ${l.event.padEnd(28)} ${l.message}${
          l.keyId ? " (key:" + l.keyId + ")" : ""
        }`
    )
    .join("\n");
}
