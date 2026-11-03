"use client";

import { useEffect, useRef } from "react";
import type { KeyEntry, RotationConfig } from "@/types";
import { estimateCredits, formatSecondsHuman } from "@/lib/creditEstimator";

const STATUS_COLOR: Record<string, string> = {
  idle: "text-muted",
  validating: "text-warn animate-pulse",
  available: "text-ok",
  active: "text-accent",
  standby: "text-warn",
  exhausted: "text-err",
  invalid: "text-err",
  error: "text-err",
};

const STATUS_DOT: Record<string, string> = {
  idle: "bg-muted",
  validating: "bg-warn animate-pulse",
  available: "bg-ok",
  active: "bg-accent animate-pulse",
  standby: "bg-warn animate-pulse",
  exhausted: "bg-err",
  invalid: "bg-err",
  error: "bg-err",
};

interface Props {
  keys: KeyEntry[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<KeyEntry>) => void;
  rotationConfig: RotationConfig;
}

export default function KeyPanel({ keys, onAdd, onRemove, onUpdate, rotationConfig }: Props) {
  // Ticker to refresh estimates every second
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => {
      keys.forEach((k) => {
        if (!k.sessionStartedAt) return;
        const est = estimateCredits(
          k.sessionStartedAt,
          k.creditsReported ?? 600,
          rotationConfig.consumptionRatePerSecond
        );
        onUpdate(k.id, {
          creditsEstimate: est.creditsUsedEstimate,
          creditsIsEstimate: true,
        });
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [keys, rotationConfig.consumptionRatePerSecond, onUpdate]);

  return (
    <section className="rounded-lg border border-border bg-panel p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">API Keys</h2>
        <button
          onClick={onAdd}
          className="text-xs px-2 py-1 rounded border border-border hover:border-accent hover:text-accent transition"
        >
          + Add Key
        </button>
      </div>

      {keys.length === 0 && (
        <p className="text-xs text-muted italic">No keys added. Click "+ Add Key" to start.</p>
      )}

      <div className="flex flex-col gap-2">
        {keys.map((k, idx) => (
          <KeyRow
            key={k.id}
            entry={k}
            index={idx}
            rotationConfig={rotationConfig}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))}
      </div>

      <p className="mt-2 text-[10px] text-muted leading-tight">
        ⚠ Keys are used directly in the browser (testing mode). Never use keys with production
        credits in untrusted environments.
      </p>
    </section>
  );
}

function KeyRow({
  entry,
  index,
  rotationConfig,
  onUpdate,
  onRemove,
}: {
  entry: KeyEntry;
  index: number;
  rotationConfig: RotationConfig;
  onUpdate: (id: string, patch: Partial<KeyEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const est =
    entry.sessionStartedAt
      ? estimateCredits(
          entry.sessionStartedAt,
          600,
          rotationConfig.consumptionRatePerSecond
        )
      : null;

  const label = ["Key A", "Key B", "Key C", "Key D"][index] ?? `Key ${index + 1}`;

  return (
    <div className="rounded border border-border bg-surface p-2">
      <div className="flex items-center gap-2 mb-1.5">
        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[entry.status] ?? "bg-muted"}`}
        />
        <span className="text-xs font-medium">{label}</span>
        <span className={`text-[10px] ml-auto ${STATUS_COLOR[entry.status] ?? "text-muted"}`}>
          {entry.status.toUpperCase()}
        </span>
        <button
          onClick={() => onRemove(entry.id)}
          className="text-muted hover:text-err text-xs transition"
          title="Remove key"
        >
          ✕
        </button>
      </div>

      {/* Input */}
      <div className="flex gap-1">
        <input
          type={entry.show ? "text" : "password"}
          value={entry.value}
          placeholder="Paste Xmax API key…"
          onChange={(e) => onUpdate(entry.id, { value: e.target.value, status: "idle" })}
          className="flex-1 rounded bg-[#0a0c14] border border-border text-xs px-2 py-1 font-mono focus:outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onClick={() => onUpdate(entry.id, { show: !entry.show })}
          className="text-muted hover:text-white text-[10px] px-2 border border-border rounded transition"
        >
          {entry.show ? "hide" : "show"}
        </button>
      </div>

      {/* Credit / timing info */}
      {entry.status !== "idle" && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[10px] text-muted">
          {est && (
            <>
              <span>
                Used (est.):{" "}
                <span className="text-white">{est.creditsUsedEstimate.toFixed(1)} cr</span>
              </span>
              <span>
                Remaining (est.):{" "}
                <span className="text-white">
                  {formatSecondsHuman(est.secondsRemainingEstimate)}
                </span>
              </span>
            </>
          )}
          {entry.creditsReported !== null && (
            <span className="col-span-2">
              Balance (provider):{" "}
              <span className="text-ok">{entry.creditsReported} cr</span>
            </span>
          )}
          {entry.firstFrameAt && entry.sessionStartedAt && (
            <span className="col-span-2">
              Time-to-first-frame:{" "}
              <span className="text-white">
                {entry.firstFrameAt - entry.sessionStartedAt}ms
              </span>
            </span>
          )}
          {entry.error && (
            <span className="col-span-2 text-err">{entry.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
