"use client";

import { useEffect, useRef } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

export default function ObsViewer({ token }: { token: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let room: Room | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (disposed || !mountRef.current) return;

      try {
        const response = await fetch(`/api/obs/viewer?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!response.ok) {
          if (response.status !== 404 && !disposed) {
            retryTimer = setTimeout(connect, 3000);
          }
          return;
        }
        const credentials = await response.json() as { serverUrl: string; participantToken: string };
        if (disposed || !mountRef.current) return;

        room = new Room({ adaptiveStream: false, dynacast: false });
        const activeRoom = room;

        activeRoom.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Video || !mountRef.current) return;
          const video = track.attach() as HTMLVideoElement;
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          video.setAttribute("playsinline", "true");
          video.style.width = "100%";
          video.style.height = "100%";
          video.style.objectFit = "contain";
          video.setAttribute("crossorigin", "anonymous");
          video.style.background = "#000";
          mountRef.current.replaceChildren(video);
          void video.play().catch(() => undefined);
        });

        activeRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
          if (mountRef.current) mountRef.current.replaceChildren();
        });

        activeRoom.on(RoomEvent.Disconnected, () => {
          if (mountRef.current) mountRef.current.replaceChildren();
          if (!disposed) retryTimer = setTimeout(connect, 2500);
        });

        await activeRoom.connect(credentials.serverUrl, credentials.participantToken);
      } catch {
        if (!disposed) retryTimer = setTimeout(connect, 3000);
      }
    };

    void connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (room) void room.disconnect();
      if (mountRef.current) mountRef.current.replaceChildren();
    };
  }, [token]);

  return <main className="obs-viewer-root" aria-label="FaceTime OBS live output"><div ref={mountRef} className="obs-viewer-video" /></main>;
}
