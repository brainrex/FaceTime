"use client";

import { addLog } from "./diagStore";
import type { RotationConfig } from "@/types";

type SDK = typeof import("@xmaxai/web-sdk");
type Client = InstanceType<SDK["XmaxClient"]>;
type Manager = ReturnType<Client["createRealtimeManager"]>;
type LocalStream = Awaited<ReturnType<Manager["createLocalCameraStream"]>>;
type RemoteTrack = Awaited<ReturnType<Manager["startGeneration"]>>["videoTrack"];

interface Slot {
  keyId: string;
  client: Client;
  manager: Manager;
  connectionState: string;
  remoteTrack: RemoteTrack | null;
  startedAt: number | null;
  firstFrameAt: number | null;
  startPromise: Promise<void> | null;
  failed: boolean;
  disconnected: boolean;
}

export interface ManagerState {
  activeKeyId: string | null;
  standbyKeyId: string | null;
  activeRemoteTrack: RemoteTrack | null;
  standbyRemoteTrack: RemoteTrack | null;
  localVideoTrack: RemoteTrack | null;
  outputMode: "live" | "buffered" | "frozen" | "none";
  isSwitching: boolean;
  concurrentSessionResult: "unknown" | "supported" | "unsupported" | "error";
  concurrentSessionNote: string;
  switchingMetrics: { lastSwitchDurationMs: number | null; switchCount: number; interruptionCount: number };
}

const INITIAL: ManagerState = {
  activeKeyId: null, standbyKeyId: null, activeRemoteTrack: null, standbyRemoteTrack: null,
  localVideoTrack: null, outputMode: "none", isSwitching: false,
  concurrentSessionResult: "unknown", concurrentSessionNote: "Not yet tested",
  switchingMetrics: { lastSwitchDurationMs: null, switchCount: 0, interruptionCount: 0 },
};
type Listener = (s: ManagerState) => void;

class XmaxSessionManager {
  private slots = new Map<string, Slot>();
  private order: string[] = [];
  private sharedLocalStream: LocalStream | null = null;
  private state: ManagerState = { ...INITIAL, switchingMetrics: { ...INITIAL.switchingMetrics } };
  private listeners = new Set<Listener>();
  private config: RotationConfig | null = null;
  private referencePath: string | null = null;
  private prompt = "视频中角色替换成参考图中角色";
  private rotationBusy = false;

  subscribe(fn: Listener) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
  private patch(p: Partial<ManagerState>) { this.state = { ...this.state, ...p }; this.listeners.forEach(f => f(this.state)); }
  setRotationConfig(c: RotationConfig) { this.config = c; }
  setPrompt(p: string) { this.prompt = p; }
  setReferenceImageUrl(p: string | null) { this.referencePath = p; }
  getState() { return this.state; }
  isKeyRegistered(id: string) { return this.slots.has(id); }

  async registerKey(keyId: string, apiKey: string) {
    if (this.slots.has(keyId)) return;
    const sdk = await import("@xmaxai/web-sdk");
    const client = new sdk.XmaxClient(new sdk.XmaxConfiguration({ apiKey }));
    const manager = client.createRealtimeManager(new sdk.RealtimeConfiguration({ model: sdk.RealtimeModel.x2_1_1_preview_cn }));
    const slot: Slot = { keyId, client, manager, connectionState: "idle", remoteTrack: null, startedAt: null, firstFrameAt: null, startPromise: null, failed: false, disconnected: false };
    this.slots.set(keyId, slot);
    this.order.push(keyId);
    await manager.setStateListener((raw) => {
      const current = this.slots.get(keyId);
      if (!current) return;
      const state = raw as unknown as { connectionState?: unknown; reason?: { kind?: string; error?: { code?: string; message?: string } } };
      current.connectionState = String(state.connectionState ?? "unknown");
      if (current.connectionState === "generating") {
        if (current.firstFrameAt === null) {
          current.firstFrameAt = Date.now();
          addLog("first_frame", "SDK reached generating state", keyId);
        }
        this.refreshReadiness(keyId);
      }
      if (state.reason?.kind === "failure" || ["failed", "disconnected", "closed"].includes(current.connectionState.toLowerCase())) {
        current.failed = true;
        const msg = state.reason?.error ? `${state.reason.error.code}: ${state.reason.error.message}` : `Live session ended (${current.connectionState})`;
        addLog("error", msg, keyId);
        if (this.state.activeKeyId === keyId) this.patch({ outputMode: "frozen", activeRemoteTrack: null });
      }
    });
  }

  async acquireCamera(firstKeyId: string, front: boolean) {
    const slot = this.slots.get(firstKeyId);
    if (!slot) throw new Error(`Key not registered: ${firstKeyId}`);
    const sdk = await import("@xmaxai/web-sdk");
    addLog("camera_init", "Requesting camera permission", firstKeyId);
    const stream = await slot.manager.createLocalCameraStream({
      videoFormat: new sdk.RealtimeVideoFormat({ width: 1024, height: 1920, fps: 30 }),
      position: front ? sdk.CameraPosition.front : sdk.CameraPosition.back,
      useMicrophone: false, enableFrameValidation: true,
    });
    this.sharedLocalStream = stream;
    this.patch({ localVideoTrack: stream.videoTrack as unknown as RemoteTrack });
    addLog("camera_init", "Original camera stream acquired once", firstKeyId);
    return stream.videoTrack;
  }

  private async startSlot(keyId: string) {
    const slot = this.slots.get(keyId);
    if (!slot || !this.sharedLocalStream || !this.referencePath) throw new Error("Session prerequisites are missing");
    if (slot.startPromise) return slot.startPromise;
    if (slot.startedAt && !slot.disconnected) return;
    const sdk = await import("@xmaxai/web-sdk");
    slot.startedAt = Date.now(); slot.firstFrameAt = null; slot.failed = false; slot.disconnected = false;
    addLog("session_started", "Starting generation", keyId);
    slot.startPromise = (async () => {
      const remote = await slot.manager.startGeneration({
        localStream: this.sharedLocalStream!,
        context: new sdk.RealtimeContext({ prompt: this.prompt, referencePath: this.referencePath! }),
      });
      // Track assignment happens before readiness is evaluated. State events may arrive earlier.
      slot.remoteTrack = remote.videoTrack as RemoteTrack;
      this.refreshReadiness(keyId);
    })();
    try { await slot.startPromise; } finally { slot.startPromise = null; }
  }

  async startActiveSession(keyId: string) {
    this.patch({ activeKeyId: keyId });
    await this.startSlot(keyId);
    this.refreshReadiness(keyId);
  }

  async startStandbySession(keyId: string) {
    if (keyId === this.state.activeKeyId) throw new Error("Active key cannot also be standby");
    if (!this.state.activeKeyId) throw new Error("Start the primary session first");
    this.patch({ standbyKeyId: keyId, concurrentSessionResult: "unknown", concurrentSessionNote: "Testing second live generation" });
    addLog("standby_started", "Starting standby with the original camera stream", keyId);
    try {
      await this.startSlot(keyId);
      this.refreshReadiness(keyId);
      const active = this.slots.get(this.state.activeKeyId);
      const standby = this.slots.get(keyId);
      if (active?.connectionState === "generating" && active.remoteTrack && standby?.connectionState === "generating" && standby.remoteTrack) {
        this.patch({ concurrentSessionResult: "supported", concurrentSessionNote: "Both sessions reached generating and exposed remote video tracks concurrently." });
        addLog("concurrent_session_test", "CONFIRMED: both sessions generating with remote tracks", keyId);
      } else {
        this.patch({ concurrentSessionNote: "Second start returned; waiting for both sessions to reach generating with tracks." });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.patch({ concurrentSessionResult: "unsupported", concurrentSessionNote: `Second session failed to start: ${msg}` });
      addLog("concurrent_session_test", `Second session start failed: ${msg}`, keyId);
      throw e;
    }
  }

  private refreshReadiness(keyId: string) {
    const slot = this.slots.get(keyId);
    if (!slot || slot.connectionState !== "generating" || !slot.remoteTrack) return;
    if (this.state.activeKeyId === keyId) this.patch({ activeRemoteTrack: slot.remoteTrack, outputMode: "live" });
    if (this.state.standbyKeyId === keyId) {
      this.patch({ standbyRemoteTrack: slot.remoteTrack });
      addLog("standby_ready", "Standby has generating state and a remote video track", keyId);
      const active = this.slots.get(this.state.activeKeyId ?? "");
      if (active?.connectionState === "generating" && active.remoteTrack) {
        this.patch({ concurrentSessionResult: "supported", concurrentSessionNote: "Both sessions reached generating and exposed remote video tracks concurrently." });
        addLog("concurrent_session_test", "CONFIRMED concurrent generation", keyId);
      }
    }
  }

  async prepareNext() {
    if (this.state.standbyKeyId || !this.state.activeKeyId) return false;
    const activeIndex = this.order.indexOf(this.state.activeKeyId);
    const nextId = this.order.slice(activeIndex + 1).find(id => {
      const s = this.slots.get(id); return s && !s.failed && !s.startedAt && !s.disconnected;
    });
    if (!nextId) return false;
    try { await this.startStandbySession(nextId); return true; }
    catch { return false; }
  }

  async switchToStandby(): Promise<boolean> {
    if (this.rotationBusy) return false;
    const nextId = this.state.standbyKeyId;
    const oldId = this.state.activeKeyId;
    if (!nextId || !oldId || nextId === oldId) return false;
    const next = this.slots.get(nextId);
    if (!next || next.failed || next.connectionState !== "generating" || !next.remoteTrack) {
      addLog("rotation_initiated", "Switch refused: standby has no confirmed live output", nextId); return false;
    }
    this.rotationBusy = true;
    const started = Date.now();
    this.patch({ isSwitching: true, outputMode: "buffered" });
    // Swap display first; only disconnect old generation after the new output is selected.
    this.patch({ activeKeyId: nextId, activeRemoteTrack: next.remoteTrack, standbyKeyId: null, standbyRemoteTrack: null, outputMode: "live", isSwitching: false });
    const old = this.slots.get(oldId);
    if (old && !old.disconnected) {
      try { await old.manager.disconnect(); old.disconnected = true; addLog("session_disconnected", "Previous generation disconnected; camera retained", oldId); }
      catch (e) { addLog("error", `Previous session disconnect failed: ${e instanceof Error ? e.message : String(e)}`, oldId); }
    }
    const duration = Date.now() - started;
    this.patch({ switchingMetrics: { lastSwitchDurationMs: duration, switchCount: this.state.switchingMetrics.switchCount + 1, interruptionCount: this.state.switchingMetrics.interruptionCount } });
    addLog("rotation_completed", `Output switched to next key in ${duration}ms`, nextId);
    this.rotationBusy = false;
    return true;
  }

  async autoRotate() {
    if (!this.config || !this.state.activeKeyId || this.rotationBusy) return;
    const active = this.slots.get(this.state.activeKeyId);
    if (!active?.startedAt || active.disconnected) return;
    const rate = Math.max(0.0001, this.config.consumptionRatePerSecond);
    const remaining = Math.max(0, 600 - ((Date.now() - active.startedAt) / 1000) * rate);
    if (!this.state.standbyKeyId && remaining <= this.config.prepareAtSecondsRemaining) await this.prepareNext();
    if (this.state.standbyKeyId && remaining <= this.config.switchAtSecondsRemaining) {
      const switched = await this.switchToStandby();
      if (switched) await this.prepareNext();
    }
  }

  async stopAll() {
    for (const [id, slot] of this.slots) {
      try { await slot.manager.close(); } catch (e) { addLog("error", `Close failed: ${e instanceof Error ? e.message : String(e)}`, id); }
    }
    this.slots.clear(); this.order = []; this.sharedLocalStream = null; this.rotationBusy = false;
    this.state = { ...INITIAL, switchingMetrics: { ...INITIAL.switchingMetrics } };
    this.listeners.forEach(f => f(this.state));
  }
}

export const sessionManager = new XmaxSessionManager();
