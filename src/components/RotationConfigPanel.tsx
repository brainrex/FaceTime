"use client";

import type { RotationConfig } from "@/types";

interface Props {
  config: RotationConfig;
  prompt: string;
  onChange: (cfg: RotationConfig) => void;
  onPromptChange: (p: string) => void;
}

export default function RotationConfigPanel({
  config,
  prompt,
  onChange,
  onPromptChange,
}: Props) {
  return (
    <section className="rounded-lg border border-border bg-panel p-3 text-xs">
      <h2 className="text-sm font-semibold mb-2">Rotation Config</h2>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">
            Prepare standby when ≤ X seconds remain (est.)
          </span>
          <input
            type="number"
            min={10}
            max={600}
            value={config.prepareAtSecondsRemaining}
            onChange={(e) =>
              onChange({ ...config, prepareAtSecondsRemaining: Number(e.target.value) })
            }
            className="w-28 rounded bg-surface border border-border px-2 py-1 focus:outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-muted">
            Switch to standby when ≤ X seconds remain (est.)
          </span>
          <input
            type="number"
            min={5}
            max={300}
            value={config.switchAtSecondsRemaining}
            onChange={(e) =>
              onChange({ ...config, switchAtSecondsRemaining: Number(e.target.value) })
            }
            className="w-28 rounded bg-surface border border-border px-2 py-1 focus:outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-muted">
            Assumed consumption rate (credits / second) — update from observation
          </span>
          <input
            type="number"
            min={0.01}
            step={0.1}
            value={config.consumptionRatePerSecond}
            onChange={(e) =>
              onChange({ ...config, consumptionRatePerSecond: Number(e.target.value) })
            }
            className="w-28 rounded bg-surface border border-border px-2 py-1 focus:outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-muted">Generation prompt (Chinese or English)</span>
          <input
            type="text"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            className="rounded bg-surface border border-border px-2 py-1 focus:outline-none focus:border-accent font-mono text-[11px]"
          />
        </label>
      </div>
    </section>
  );
}
