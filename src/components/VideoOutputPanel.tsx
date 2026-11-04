"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sessionManager } from "@/lib/sessionManager";
import type { SessionState } from "@/lib/sessionManager";

interface Props {
  isLive: boolean;
  onStop: () => void;
}

type PipVideo = HTMLVideoElement & {
  webkitSetPresentationMode?: (mode: "inline" | "picture-in-picture") => void;
  webkitPresentationMode?: string;
};

export default function VideoOutputPanel({ isLive, onStop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<PipVideo | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewRef = useRef<any>(null);
  const [hasOutput, setHasOutput] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pipSupported, setPipSupported] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px) and (pointer: fine)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const updatePipSupport = () => {
      const video = containerRef.current?.querySelector("video") as PipVideo | null;
      videoRef.current = video;
      setPipSupported(Boolean(video && (video.requestPictureInPicture || video.webkitSetPresentationMode)));
    };
    updatePipSupport();
    const observer = new MutationObserver(updatePipSupport);
    if (containerRef.current) observer.observe(containerRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hasOutput]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    let alive = true;
    const unsub = sessionManager.subscribe(async (state: SessionState) => {
      if (!alive || !containerRef.current) return;
      if (state.status !== "live" || !state.remoteTrack) {
        setHasOutput(false);
        if (viewRef.current) {
          try {
            if (typeof viewRef.current.detach === "function") viewRef.current.detach();
          } catch { /* ignore */ }
          viewRef.current = null;
        }
        return;
      }
      try {
        const { XmaxRealtimeVideoView, VideoContentMode } = await import("@xmaxai/web-sdk");
        if (!alive || !containerRef.current) return;
        if (!viewRef.current) {
          const view = new XmaxRealtimeVideoView();
          view.element.style.width = "100%";
          view.element.style.height = "100%";
          view.element.style.display = "block";
          view.attach(containerRef.current);
          view.videoContentMode = VideoContentMode.fill;
          viewRef.current = view;
        }
        viewRef.current.track = state.remoteTrack;
        setHasOutput(true);
      } catch {
        setHasOutput(false);
      }
    });
    return () => {
      alive = false;
      unsub();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 5000);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  const enterFullscreen = useCallback(async () => {
    if (!shellRef.current) return;
    setIsFullscreen(true);
    setControlsVisible(true);
    scheduleHideControls();
    if (window.matchMedia("(min-width: 900px) and (pointer: fine)").matches) return;
    try {
      if (shellRef.current.requestFullscreen && !/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        await shellRef.current.requestFullscreen();
      }
      // CSS fullscreen is the fallback for iOS Safari and browsers without
      // Fullscreen API support on regular page elements.
    } catch {
      // Keep the CSS fullscreen view active when native fullscreen is refused.
    }
  }, [scheduleHideControls]);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* CSS fallback below */ }
    }
    setIsFullscreen(false);
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const enterPiP = useCallback(async () => {
    const video = (containerRef.current?.querySelector("video") as PipVideo | null) ?? videoRef.current;
    if (!video) return;
    try {
      if (video.webkitSetPresentationMode) {
        video.webkitSetPresentationMode("picture-in-picture");
        return;
      }
      if (!video.requestPictureInPicture) return;
      if (video.paused) await video.play();
      await video.requestPictureInPicture();
    } catch {
      // PiP can be denied by browser policy, for example before a user gesture
      // or when the video track is no longer playing.
    }
  }, []);

  const handleStopFromFullscreen = useCallback(async () => {
    await exitFullscreen();
    onStop();
  }, [exitFullscreen, onStop]);

  return (
    <div
      ref={shellRef}
      className={isFullscreen ? (isDesktop ? "viewer-wrap viewer-desktop-expanded" : "viewer-wrap viewer-fullscreen") : "viewer-wrap"}
      onClick={isFullscreen ? revealControls : undefined}
      aria-label={isFullscreen ? "Tap to show controls" : undefined}
    >
      <div className="output-stage">
        <div ref={containerRef} className="video-mount" />
        {!hasOutput && <OutputPlaceholder isLive={isLive} />}
        {isFullscreen && (
          <div className={`fullscreen-controls${controlsVisible ? "" : " hidden"}`}>
            <button className="icon-control" type="button" onClick={(e) => { e.stopPropagation(); void exitFullscreen(); }} aria-label="Exit fullscreen" title="Exit fullscreen">
              <FullscreenExitIcon />
            </button>
            <button className="icon-control icon-control-stop" type="button" onClick={(e) => { e.stopPropagation(); void handleStopFromFullscreen(); }} aria-label="Stop live session" title="Stop">
              <StopIcon />
            </button>
          </div>
        )}
      </div>

      {!isFullscreen && (
        <div className="output-actions" aria-label="Video controls">
          <button className="icon-control" type="button" onClick={() => void enterFullscreen()} disabled={!isLive} aria-label="Fullscreen" title="Fullscreen">
            <FullscreenIcon />
          </button>
          <button className="icon-control" type="button" onClick={() => void enterPiP()} disabled={!hasOutput || !pipSupported} aria-label="Picture in Picture" title="Picture in Picture">
            <PipIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function OutputPlaceholder({ isLive }: { isLive: boolean }) {
  return (
    <div className="output-placeholder">
      <div className="output-placeholder-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <span>{isLive ? "Connecting to live output…" : "Output will appear here"}</span>
    </div>
  );
}

function FullscreenIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></svg>;
}
function FullscreenExitIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M3 15h6v6M21 15h-6v6" /></svg>;
}
function PipIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1" /></svg>;
}
function StopIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
}
