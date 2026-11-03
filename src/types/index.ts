// ─────────────────────────────────────────────────────────────────────────────
// Application-level types for the Xmax Key-Rotation Tester
// ─────────────────────────────────────────────────────────────────────────────

export type KeyStatus =
  | "idle"       // entered, not yet validated
  | "validating" // validation in progress
  | "available"  // validated, unused
  | "active"     // currently driving the live generation output
  | "standby"    // session started; waiting for first generated frame
  | "exhausted"  // credits too low / session ended due to usage
  | "invalid"    // rejected by Xmax (bad key, revoked, etc.)
  | "error";     // network or SDK error

export interface KeyEntry {
  id: string;             // uuid assigned by us
  value: string;          // the raw API key string (never logged)
  show: boolean;          // whether the input is revealed
  status: KeyStatus;
  // Credit info — NEVER fabricated; labelled as estimate when not provider-reported
  creditsReported: number | null;   // from provider if endpoint exists
  creditsEstimate: number | null;   // locally computed from session duration
  creditsIsEstimate: boolean;
  // Timing
  sessionStartedAt: number | null;  // ms since epoch
  firstFrameAt: number | null;
  error: string | null;
}

// ─── Diagnostic event log ────────────────────────────────────────────────────

export type DiagEvent =
  | "camera_init"
  | "key_validated"
  | "key_invalid"
  | "image_loaded"
  | "session_started"
  | "first_frame"
  | "standby_started"
  | "standby_ready"
  | "rotation_initiated"
  | "rotation_completed"
  | "session_disconnected"
  | "credit_check"
  | "error"
  | "frame_buffer_replay"
  | "concurrent_session_test";

export interface DiagLog {
  id: string;
  ts: number;         // Date.now()
  event: DiagEvent;
  message: string;
  // keyId omits the key value; only the ID is recorded
  keyId?: string;
}

// ─── Frame buffer state ───────────────────────────────────────────────────────

export type OutputMode =
  | "live"     // genuine generated frames from the active key
  | "buffered" // replaying recent frames while switching
  | "frozen"   // last known frame; no update
  | "none";    // no output at all

// ─── Rotation config ─────────────────────────────────────────────────────────

export interface RotationConfig {
  /** Start preparing standby key when active key has this many estimated seconds left */
  prepareAtSecondsRemaining: number;
  /** Switch to standby key when active key has this many estimated seconds left */
  switchAtSecondsRemaining: number;
  /** Consumption rate in credits/second – used for estimation only */
  consumptionRatePerSecond: number;
}

export const DEFAULT_ROTATION_CONFIG: RotationConfig = {
  prepareAtSecondsRemaining: 90,
  switchAtSecondsRemaining: 30,
  consumptionRatePerSecond: 1, // placeholder; replace from observation
};
