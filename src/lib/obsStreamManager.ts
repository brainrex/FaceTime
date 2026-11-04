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

  async start(generatedTrack: MediaStreamTrack): Promise<{ url: string }> {
    await this.stop();

    const response = await fetch("/api/obs/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not create the OBS output.");
    }

    const session = data as ObsSession;
    const room = new Room({ adaptiveStream: true, dynacast: true });

    try {
      await room.connect(session.serverUrl, session.participantToken);
      await room.localParticipant.publishTrack(generatedTrack, {
        name: "facetime-generated-video",
        source: Track.Source.Camera,
        simulcast: false,
      });
      this.room = room;
      this.session = session;
      return { url: session.streamUrl };
    } catch (error) {
      await room.disconnect();
      await fetch("/api/obs/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamToken: session.streamToken,
          stopToken: session.stopToken,
        }),
      }).catch(() => undefined);
      throw error;
    }
  }

  async stop(): Promise<void> {
    const room = this.room;
    const session = this.session;
    this.room = null;
    this.session = null;

    if (room) {
      try {
        await room.disconnect();
      } catch {
        // The output may already have disconnected.
      }
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
