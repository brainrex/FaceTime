// ─────────────────────────────────────────────────────────────────────────────
// creditEstimator.ts
//
// PURPOSE: Estimate credit consumption based on session duration and a
// configurable consumption rate.
//
// IMPORTANT DISCLOSURE:
//   No documented REST endpoint exists on platform.xmax.ai that returns a
//   credit balance for temporary or standard API keys.  The Xmax changelog
//   mentions "detailed usage data retrieval for temporary API keys" but does
//   not publish or verify a specific endpoint URL for that feature.
//
//   All values from this module are ESTIMATES.  They are never presented as
//   provider-confirmed balances.  Every figure should be displayed with the
//   label "(est.)".
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditEstimate {
  elapsedSeconds: number;
  creditsUsedEstimate: number;
  creditsRemainingEstimate: number | null;
  secondsRemainingEstimate: number | null;
  isEstimate: true; // always true — never fabricated from provider
}

/**
 * @param sessionStartMs  Date.now() at session start
 * @param initialCredits  Starting credit balance (if known; null if unknown)
 * @param ratePerSecond   Credits consumed per second of active generation
 */
export function estimateCredits(
  sessionStartMs: number,
  initialCredits: number | null,
  ratePerSecond: number
): CreditEstimate {
  const elapsedSeconds = (Date.now() - sessionStartMs) / 1000;
  const creditsUsedEstimate = elapsedSeconds * ratePerSecond;

  const creditsRemainingEstimate =
    initialCredits !== null ? Math.max(0, initialCredits - creditsUsedEstimate) : null;

  const secondsRemainingEstimate =
    creditsRemainingEstimate !== null
      ? creditsRemainingEstimate / ratePerSecond
      : null;

  return {
    elapsedSeconds,
    creditsUsedEstimate,
    creditsRemainingEstimate,
    secondsRemainingEstimate,
    isEstimate: true,
  };
}

export function formatSecondsHuman(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
