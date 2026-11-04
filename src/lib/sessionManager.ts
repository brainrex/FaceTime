"use client";

type SDK = typeof import("@xmaxai/web-sdk");
type Client = InstanceType<SDK["XmaxClient"]>;
type Manager = ReturnType<Client["createRealtimeManager"]>;
type LocalStream = Awaited<ReturnType<Manager["createLocalCameraStream"]>>;
type RemoteTrack = Awaited<ReturnType<Manager["startGeneration"]>>["videoTrack"];

export type SessionStatus = "idle" | "starting" | "connecting" | "live" | "stopping" | "error" | "stopped";

export interface SessionState {
  status: SessionStatus;
  error: string | null;
  remoteTrack: RemoteTrack | null;
  hasOutput: boolean;
}

type Listener = (state: SessionState) => void;

const INITIAL: SessionState = { status: "idle", error: null, remoteTrack: null, hasOutput: false };

function isPortrait(): boolean {
  return typeof window === "undefined" || window.innerHeight >= window.innerWidth;
}

function createClient(sdk: SDK, apiKey: string): Client {
  return new sdk.XmaxClient(new sdk.XmaxConfiguration({
    apiKey,
    environment: sdk.XmaxEnvironment.global,
  }));
}

class FaceTimeSessionManager {
  private client: Client | null = null;
  private manager: Manager | null = null;
  private localStream: LocalStream | null = null;
  private state: SessionState = { ...INITIAL };
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private patch(changes: Partial<SessionState>): void {
    this.state = { ...this.state, ...changes };
    this.listeners.forEach((listener) => listener(this.state));
  }

  getState(): SessionState { return this.state; }

  async verifyApiKey(apiKey: string): Promise<number> {
    const sdk = await import("@xmaxai/web-sdk");
    const client = createClient(sdk, apiKey);
    const balance = await client.getCreditBalance();
    return balance.currentBalance;
  }

  async uploadReferenceImage(apiKey: string, file: File): Promise<string> {
    const sdk = await import("@xmaxai/web-sdk");
    const client = createClient(sdk, apiKey);
    const storage = client.createStorageService();
    const uploaded = await storage.uploadImage({ data: file, fileName: file.name });
    if (!uploaded.url || typeof uploaded.url !== "string") {
      throw new Error("The image service did not return a usable image URL. Please try again.");
    }
    return uploaded.url;
  }

  async startSession(apiKey: string, referenceUrl: string, useFrontCamera = true): Promise<void> {
    if (!["idle", "stopped", "error"].includes(this.state.status)) {
      throw new Error("A session is already in progress.");
    }

    this.patch({ status: "starting", error: null, remoteTrack: null, hasOutput: false });

    try {
      const sdk = await import("@xmaxai/web-sdk");
      this.client = createClient(sdk, apiKey);
      const manager = this.client.createRealtimeManager(
        new sdk.RealtimeConfiguration({ model: sdk.RealtimeModel.x2_1 })
      );
      this.manager = manager;

      await manager.setStateListener((raw) => {
        // Ignore delayed callbacks from a previous WebRTC manager after it has been closed.
        if (this.manager !== manager) return;
        const state = raw as {
          connectionState?: unknown;
          reason?: { kind?: string; error?: { code?: string; message?: string } };
        };
        const connectionState = String(state.connectionState ?? "unknown").toLowerCase();
        const failed = state.reason?.kind === "failure" || ["failed", "disconnected", "closed"].includes(connectionState);
        if (failed && ["starting", "connecting", "live"].includes(this.state.status)) {
          const detail = state.reason?.error;
          const message = detail ? [detail.code, detail.message].filter(Boolean).join(": ") : "The live session ended unexpectedly.";
          this.patch({ status: "error", error: message, hasOutput: false, remoteTrack: null });
        }
      });

      this.patch({ status: "connecting" });
      const portrait = isPortrait();
      this.localStream = await manager.createLocalCameraStream({
        videoFormat: new sdk.RealtimeVideoFormat({
          width: portrait ? 1080 : 1920,
          height: portrait ? 1920 : 1080,
          fps: 30,
        }),
        position: useFrontCamera ? sdk.CameraPosition.front : sdk.CameraPosition.back,
        useMicrophone: false,
        enableFrameValidation: true,
      });

      const remote = await manager.startGeneration({
        localStream: this.localStream,
        context: new sdk.RealtimeContext({
          prompt: "视频中角色替换成参考图中角色",
          referencePath: referenceUrl,
        }),
      });

      this.patch({ status: "live", remoteTrack: remote.videoTrack as RemoteTrack, hasOutput: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.patch({ status: "error", error: message, hasOutput: false, remoteTrack: null });
      await this.cleanup();
      throw error;
    }
  }

  async stopSession(): Promise<void> {
    if (this.state.status !== "idle" && this.state.status !== "stopped") {
      this.patch({ status: "stopping", hasOutput: false, remoteTrack: null });
    }
    await this.cleanup();
    this.patch({ status: "stopped", error: null, remoteTrack: null, hasOutput: false });
  }

  private async cleanup(): Promise<void> {
    const manager = this.manager;
    const localStream = this.localStream;
    // Clear the active reference first so late state callbacks cannot affect a new session.
    this.manager = null;
    this.client = null;
    this.localStream = null;

    if (manager) {
      try { await manager.close(); } catch { /* SDK cleanup is best effort */ }
    }

    // The SDK close() normally stops capture itself. Explicitly stop the camera
    // track as a final safeguard so Chromium releases its WebRTC sender/capture.
    try {
      const track = localStream?.videoTrack as MediaStreamTrack | undefined;
      if (track && track.readyState !== "ended") track.stop();
    } catch { /* capture may already have been released by the SDK */ }
  }

  async reset(): Promise<void> {
    // Never reset the UI while an old peer connection/camera capture is still alive.
    await this.cleanup();
    this.patch({ ...INITIAL });
  }
}

export const sessionManager = new FaceTimeSessionManager();
