"use client";

/**
 * sessionManager.ts
 *
 * Single-key session manager for FaceTime.
 * Handles: camera acquisition, live generation, cleanup.
 *
 * Camera resolution fix:
 *   The original code passed width:1024, height:1920 which is not a supported
 *   resolution for model x2.1.  Supported resolutions are:
 *     1920×1080, 1080×1920, 1408×1408, 1152×1536, 1536×1152
 *
 *   We now pick 1080×1920 (portrait) or 1920×1080 (landscape) based on the
 *   device orientation at session-start time.  The browser will not necessarily
 *   honour the exact requested resolution but will use the closest the camera
 *   supports; the SDK then validates the encoded frame size.
 */

type SDK = typeof import("@xmaxai/web-sdk");
type Client = InstanceType<SDK["XmaxClient"]>;
type Manager = ReturnType<Client["createRealtimeManager"]>;
type LocalStream = Awaited<ReturnType<Manager["createLocalCameraStream"]>>;
type RemoteTrack = Awaited<ReturnType<Manager["startGeneration"]>>["videoTrack"];

export type SessionStatus =
  | "idle"
  | "starting"
  | "connecting"
  | "live"
  | "stopping"
  | "error"
  | "stopped";

export interface SessionState {
  status: SessionStatus;
  error: string | null;
  remoteTrack: RemoteTrack | null;
  /** true when the generated output is available */
  hasOutput: boolean;
}

type Listener = (state: SessionState) => void;

function isPortrait(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerHeight >= window.innerWidth;
}

const INITIAL: SessionState = {
  status: "idle",
  error: null,
  remoteTrack: null,
  hasOutput: false,
};

class FaceTimeSessionManager {
  private client: Client | null = null;
  private manager: Manager | null = null;
  private localStream: LocalStream | null = null;
  private state: SessionState = { ...INITIAL };
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private patch(p: Partial<SessionState>): void {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((f) => f(this.state));
  }

  getState(): SessionState {
    return this.state;
  }

  async startSession(
    apiKey: string,
    referenceUrl: string,
    useFrontCamera = true
  ): Promise<void> {
    if (this.state.status !== "idle" && this.state.status !== "stopped" && this.state.status !== "error") {
      throw new Error("A session is already in progress.");
    }

    this.patch({ status: "starting", error: null, remoteTrack: null, hasOutput: false });

    try {
      const sdk = await import("@xmaxai/web-sdk");

      // ── Build client + manager ──────────────────────────────────────────
      this.client = new sdk.XmaxClient(
        new sdk.XmaxConfiguration({ apiKey })
      );
      this.manager = this.client.createRealtimeManager(
        new sdk.RealtimeConfiguration({ model: sdk.RealtimeModel.x2_1 })
      );

      // ── State listener ──────────────────────────────────────────────────
      await this.manager.setStateListener((raw) => {
        const s = raw as {
          connectionState?: unknown;
          reason?: { kind?: string; error?: { code?: string; message?: string } };
        };
        const cs = String(s.connectionState ?? "unknown").toLowerCase();

        if (cs === "generating") {
          // Don't re-patch if we already have output — just let it run.
        }

        const isFailure =
          s.reason?.kind === "failure" ||
          ["failed", "disconnected", "closed"].includes(cs);

        if (isFailure && this.state.status === "live") {
          const msg = s.reason?.error
            ? `${s.reason.error.code}: ${s.reason.error.message}`
            : "The live session ended unexpectedly.";
          this.patch({ status: "error", error: msg, hasOutput: false, remoteTrack: null });
        }
      });

      // ── Camera acquisition ──────────────────────────────────────────────
      this.patch({ status: "connecting" });

      // Pick supported resolution based on device orientation.
      const portrait = isPortrait();
      const videoWidth = portrait ? 1080 : 1920;
      const videoHeight = portrait ? 1920 : 1080;

      this.localStream = await this.manager.createLocalCameraStream({
        videoFormat: new sdk.RealtimeVideoFormat({
          width: videoWidth,
          height: videoHeight,
          fps: 30,
        }),
        position: useFrontCamera
          ? sdk.CameraPosition.front
          : sdk.CameraPosition.back,
        useMicrophone: false,
        enableFrameValidation: true,
      });

      // ── Start generation ────────────────────────────────────────────────
      const remote = await this.manager.startGeneration({
        localStream: this.localStream,
        context: new sdk.RealtimeContext({
          prompt: "视频中角色替换成参考图中角色",
          referencePath: referenceUrl,
        }),
      });

      this.patch({
        status: "live",
        remoteTrack: remote.videoTrack as RemoteTrack,
        hasOutput: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.patch({ status: "error", error: msg, hasOutput: false, remoteTrack: null });
      await this._cleanup();
      throw e;
    }
  }

  async stopSession(): Promise<void> {
    this.patch({ status: "stopping", hasOutput: false, remoteTrack: null });
    await this._cleanup();
    this.patch({ status: "stopped", error: null });
  }

  private async _cleanup(): Promise<void> {
    if (this.manager) {
      try { await this.manager.close(); } catch { /* ignore */ }
      this.manager = null;
    }
    this.client = null;
    this.localStream = null;
  }

  reset(): void {
    this.patch({ ...INITIAL });
  }
}

export const sessionManager = new FaceTimeSessionManager();
