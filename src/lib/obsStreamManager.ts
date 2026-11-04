"use client";

import { Room, Track } from "livekit-client";

interface ObsSession {
  streamToken: string;
  stopToken: string;
  streamUrl: string;
  serverUrl: string;
  participantToken: string;
}

class ObsStreamManager {
  private room: Room | null = null;
  private session: ObsSession | null = null;
  private relayVideo: HTMLVideoElement | null = null;
  private relayCanvas: HTMLCanvasElement | null = null;
  private relayStream: MediaStream | null = null;
  private animationFrame = 0;

  private stopRelay(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.relayStream?.getTracks().forEach((track) => track.stop());
    this.relayStream = null;
    if (this.relayVideo) {
      this.relayVideo.pause();
      this.relayVideo.srcObject = null;
    }
    this.relayVideo = null;
    this.relayCanvas = null;
  }

  private async createRelayTrack(sourceTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    if (sourceTrack.readyState !== "live") {
      throw new Error("The generated video track has already ended. Start a new live session.");
    }

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([sourceTrack]);
    this.relayVideo = video;

    await video.play();
    await new Promise<void>((resolve, reject) => {
      if (video.videoWidth > 0 && video.videoHeight > 0) return resolve();
      const timeout = window.setTimeout(() => reject(new Error("The generated video is not ready for OBS yet.")), 10000);
      const check = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          window.clearTimeout(timeout);
          resolve();
        } else if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
          requestAnimationFrame(check);
        }
      };
      video.addEventListener("loadedmetadata", check, { once: true });
      requestAnimationFrame(check);
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    this.relayCanvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the OBS video output.");

    const drawFrame = () => {
      if (this.relayVideo !== video) return;
      // Keep polling while the receiver track is warming up. Returning without
      // requesting another frame leaves OBS with a permanently black canvas.
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch {
          // A frame can briefly be unavailable during WebRTC renegotiation.
        }
      }
      if (sourceTrack.readyState === "live") {
        this.animationFrame = requestAnimationFrame(drawFrame);
      }
    };
    this.animationFrame = requestAnimationFrame(drawFrame);
    sourceTrack.addEventListener("ended", () => {
      if (this.relayVideo === video && this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = 0;
      }
    }, { once: true });

    const stream = canvas.captureStream(30);
    this.relayStream = stream;
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("Your browser could not create the OBS video track.");
    return track;
  }

  async start(generatedTrack: MediaStreamTrack): Promise<{ url: string }> {
    await this.stop();

    const response = await fetch("/api/obs/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create the OBS output.");

    const session = data as ObsSession;
    const room = new Room({ adaptiveStream: false, dynacast: false });
    this.session = session;
    this.room = room;

    try {
      // Relay through a canvas rather than forwarding Xmax's WebRTC receiver track
      // directly into a second peer connection. This avoids sender-parameter
      // negotiation failures in Chromium and produces a normal browser video track.
      const obsTrack = await this.createRelayTrack(generatedTrack);
      await room.connect(session.serverUrl, session.participantToken);
      await room.localParticipant.publishTrack(obsTrack, {
        name: "facetime-generated-video",
        source: Track.Source.Camera,
        simulcast: false,
      });
      return { url: session.streamUrl };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const room = this.room;
    const session = this.session;
    this.room = null;
    this.session = null;
    this.stopRelay();

    if (room) {
      try { await room.disconnect(); } catch { /* The output may already have disconnected. */ }
    }

    if (session) {
      await fetch("/api/obs/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamToken: session.streamToken,
          stopToken: session.stopToken,
        }),
        keepalive: true,
      }).catch(() => undefined);
    }
  }
}

export const obsStreamManager = new ObsStreamManager();
