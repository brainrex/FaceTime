"use client";

import { useEffect, useRef, useState } from "react";
import type { ManagerState } from "@/lib/sessionManager";
import { sessionManager } from "@/lib/sessionManager";

interface Props {
  running: boolean;
  onStop: () => void;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
}

export default function VideoOutputPanel({ running, onStop, expanded, onExpandedChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<unknown>(null);
  const [hasOutput, setHasOutput] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isMobileFullscreen, setIsMobileFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const unsub = sessionManager.subscribe(async (state: ManagerState) => {
      if (!alive || !containerRef.current) return;
      // Never leave the original camera or a stale generated frame visible after failure.
      if (state.outputMode !== "live" || !state.activeRemoteTrack) {
        setHasOutput(false);
        return;
      }
      try {
        const { XmaxRealtimeVideoView, VideoContentMode } = await import("@xmaxai/web-sdk");
        if (!alive || !containerRef.current) return;
        if (!viewRef.current) {
          const view = new XmaxRealtimeVideoView();
          view.element.style.width = "100%";
          view.element.style.height = "100%";
          view.attach(containerRef.current);
          view.videoContentMode = VideoContentMode.fill;
          viewRef.current = view;
        }
        const view = viewRef.current as InstanceType<typeof XmaxRealtimeVideoView>;
        view.track = state.activeRemoteTrack as Parameters<typeof view.track extends infer T ? (arg: T) => void : never>[0];
        setHasOutput(true);
      } catch {
        setHasOutput(false);
      }
    });
    return () => { alive = false; unsub(); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  useEffect(() => {
    const update = () => setIsMobileFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const showControlsTemporarily = () => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 5000);
  };

  const enterMobileFullscreen = async () => {
    if (!shellRef.current) return;
    try {
      await shellRef.current.requestFullscreen();
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setControlsVisible(false), 5000);
    } catch {
      // Fullscreen can be unavailable in some embedded browsers; keep normal view.
    }
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    setControlsVisible(true);
  };

  const enterPictureInPicture = async () => {
    const video = containerRef.current?.querySelector("video") as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> }) | null;
    if (!video?.requestPictureInPicture) {
      window.alert("Picture-in-Picture is not available in this browser. Try Chrome or Edge on desktop.");
      return;
    }
    try { await video.requestPictureInPicture(); }
    catch { window.alert("The browser could not open Picture-in-Picture. Make sure the live video is playing."); }
  };

  return (
    <div ref={shellRef} className={`output-shell ${isMobileFullscreen ? "mobile-fullscreen" : ""} ${expanded ? "output-expanded" : ""}`} onClick={isMobileFullscreen ? showControlsTemporarily : undefined}>
      <div ref={containerRef} className="output-stage">
        {!hasOutput && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-2xl">◉</div>
          <p className="text-sm font-medium text-slate-300">{running ? "Connecting to live output…" : "Your live output will appear here"}</p>
          <p className="mt-1 text-xs text-slate-600">The original camera feed is never shown in this viewer.</p>
        </div>}
        {isMobileFullscreen && controlsVisible && (
          <div className="fullscreen-controls">
            <button className="fullscreen-control danger-btn" onClick={e => {e.stopPropagation(); onStop(); void exitFullscreen();}}>Stop live</button>
            <button className="fullscreen-control secondary-btn" onClick={e => {e.stopPropagation(); void exitFullscreen();}}>Exit</button>
          </div>
        )}
      </div>
      {!isMobileFullscreen && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button className="secondary-btn" onClick={enterMobileFullscreen} disabled={!running}>Full screen</button>
          <button className="secondary-btn desktop-only" onClick={() => onExpandedChange(!expanded)} disabled={!running}>{expanded ? "Restore window" : "Expand view"}</button>
          <button className="secondary-btn desktop-only" onClick={enterPictureInPicture} disabled={!running}>Picture in Picture</button>
        </div>
      )}
      {isMobileFullscreen && <p className="sr-only">Tap the video to show controls. Controls hide automatically after five seconds.</p>}
    </div>
  );
}
