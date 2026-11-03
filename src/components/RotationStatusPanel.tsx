"use client";

import { useEffect, useState } from "react";
import type { ManagerState } from "@/lib/sessionManager";
import { sessionManager } from "@/lib/sessionManager";
import type { KeyEntry } from "@/types";

interface Props {
  keys: KeyEntry[];
}

const CONCURRENT_COLOR: Record<string, string> = {
  unknown: "text-muted",
  supported: "text-ok",
  unsupported: "text-err",
  error: "text-err",
};

export default function RotationStatusPanel({ keys }: Props) {
  const [state, setState] = useState<ManagerState | null>(null);

  useEffect(() => {
  const unsub = sessionManager.subscribe((s) => setState(s));

  return () => {
    unsub();
  };
}, []);

  if (!state) return null;

  const keyLabel = (id: string | null) => {
    if (!id) return "—";
    const idx = keys.findIndex((k) => k.id === id);
    return idx >= 0 ? ["Key A", "Key B", "Key C", "Key D"][idx] ?? `Key ${idx + 1}` : id.slice(0, 8) + "…";
  };

  return (
    <section className="rounded-lg border border-border bg-panel p-3 text-xs">
      <h2 className="text-sm font-semibold mb-2">Rotation Status</h2>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Row label="Active key" value={keyLabel(state.activeKeyId)} highlight />
        <Row label="Standby key" value={keyLabel(state.standbyKeyId)} />
        <Row
          label="Output"
          value={state.outputMode.toUpperCase()}
          cls={state.outputMode === "live" ? "text-ok" : state.outputMode === "none" ? "text-err" : "text-warn"}
        />
        <Row
          label="Switching"
          value={state.isSwitching ? "YES" : "no"}
          cls={state.isSwitching ? "text-warn" : "text-muted"}
        />
        <Row label="Switches total" value={String(state.switchingMetrics.switchCount)} />
        <Row
          label="Last switch"
          value={
            state.switchingMetrics.lastSwitchDurationMs !== null
              ? state.switchingMetrics.lastSwitchDurationMs + "ms"
              : "—"
          }
        />
      </div>

      {/* Concurrent session test result */}
      <div className="mt-3 rounded border border-border bg-surface p-2">
        <p className="font-medium mb-0.5">Concurrent Session Test</p>
        <p className={`font-mono uppercase text-[11px] ${CONCURRENT_COLOR[state.concurrentSessionResult]}`}>
          {state.concurrentSessionResult}
        </p>
        <p className="text-muted text-[10px] mt-0.5 leading-tight">
          {state.concurrentSessionNote}
        </p>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  highlight,
  cls,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  cls?: string;
}) {
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className={cls ?? (highlight ? "text-accent font-medium" : "text-white")}>
        {value}
      </span>
    </>
  );
}
