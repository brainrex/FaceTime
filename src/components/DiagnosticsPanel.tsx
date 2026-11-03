"use client";

import { useEffect, useState, useCallback } from "react";
import { getLogs, subscribe, clearLogs, exportLogsAsJson, exportLogsAsText } from "@/lib/diagStore";
import type { DiagLog } from "@/types";

const EVENT_COLOR: Record<string, string> = {
  camera_init: "text-accent",
  key_validated: "text-ok",
  key_invalid: "text-err",
  image_loaded: "text-ok",
  session_started: "text-accent",
  first_frame: "text-ok",
  standby_started: "text-warn",
  standby_ready: "text-ok",
  rotation_initiated: "text-warn",
  rotation_completed: "text-ok",
  session_disconnected: "text-muted",
  credit_check: "text-muted",
  error: "text-err",
  frame_buffer_replay: "text-warn",
  concurrent_session_test: "text-accent",
};

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DiagnosticsPanel() {
  const [logs, setLogs] = useState<DiagLog[]>(getLogs);

  useEffect(() => {
    const unsub = subscribe(() => setLogs(getLogs()));
    return unsub;
  }, []);

  const handleExportJson = useCallback(() => {
    downloadFile(
      exportLogsAsJson(),
      `xmax-diag-${Date.now()}.json`,
      "application/json"
    );
  }, []);

  const handleExportText = useCallback(() => {
    downloadFile(
      exportLogsAsText(),
      `xmax-diag-${Date.now()}.txt`,
      "text/plain"
    );
  }, []);

  return (
    <section className="rounded-lg border border-border bg-panel p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <h2 className="text-sm font-semibold">Diagnostics</h2>
        <div className="flex gap-1.5">
          <button
            onClick={handleExportJson}
            className="text-[10px] px-2 py-0.5 border border-border rounded hover:border-accent text-muted hover:text-accent transition"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportText}
            className="text-[10px] px-2 py-0.5 border border-border rounded hover:border-accent text-muted hover:text-accent transition"
          >
            Export TXT
          </button>
          <button
            onClick={() => { clearLogs(); setLogs([]); }}
            className="text-[10px] px-2 py-0.5 border border-border rounded hover:border-err text-muted hover:text-err transition"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="h-56 overflow-y-auto thin-scroll flex flex-col-reverse gap-0.5 font-mono text-[10px]">
        {logs.length === 0 && (
          <p className="text-muted italic self-start">No events yet.</p>
        )}
        {logs.map((log) => (
          <LogLine key={log.id} log={log} />
        ))}
      </div>
    </section>
  );
}

function LogLine({ log }: { log: DiagLog }) {
  const time = new Date(log.ts).toISOString().slice(11, 23); // HH:MM:SS.mmm
  const colorClass = EVENT_COLOR[log.event] ?? "text-white";

  return (
    <div className="flex gap-2 items-start leading-tight py-0.5">
      <span className="text-muted flex-shrink-0">{time}</span>
      <span className={`flex-shrink-0 w-32 ${colorClass}`}>{log.event}</span>
      <span className="text-white break-all">{log.message}</span>
      {log.keyId && (
        <span className="text-muted flex-shrink-0 ml-auto">
          [{log.keyId.slice(0, 8)}]
        </span>
      )}
    </div>
  );
}
