"use client";

import { useEffect, useRef } from "react";
import type { ManagerState } from "@/lib/sessionManager";
import { sessionManager } from "@/lib/sessionManager";

interface Props {
  cameraAcquired: boolean;
}

export default function CameraPanel({ cameraAcquired }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<unknown>(null);

  useEffect(() => {
    if (!cameraAcquired) return;
    if (!containerRef.current) return;

    let cleanup: (() => void) | undefined;

    // Subscribe to manager state to get local track
    cleanup = sessionManager.subscribe(async (state: ManagerState) => {
      if (!state.localVideoTrack || !containerRef.current) return;

      // Only bind once
      if (viewRef.current) return;

      try {
        const { XmaxRealtimeVideoView, VideoContentMode } = await import("@xmaxai/web-sdk");
        const view = new XmaxRealtimeVideoView();
        view.element.style.width = "100%";
        view.element.style.height = "100%";
        view.attach(containerRef.current);
        view.track = state.localVideoTrack as Parameters<typeof view.track extends infer T ? (arg: T) => void : never>[0];
        view.videoContentMode = VideoContentMode.fit;
        viewRef.current = view;
      } catch {
        // SDK not available (SSR guard)
      }
    });

    return () => {
      cleanup?.();
    };
  }, [cameraAcquired]);

  return (
    <section className="rounded-lg border border-border bg-panel p-3">
      <h2 className="text-sm font-semibold mb-2">Camera Preview (Original)</h2>
      <div
        ref={containerRef}
        className="relative w-full bg-black rounded overflow-hidden"
        style={{ aspectRatio: "9/16", maxHeight: 240 }}
      >
        {!cameraAcquired && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted text-xs gap-1">
            <span className="text-2xl">📷</span>
            <span>Camera not active</span>
          </div>
        )}
      </div>
    </section>
  );
}
