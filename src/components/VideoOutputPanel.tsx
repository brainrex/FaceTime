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

type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

const CONTROLS_HIDE_DELAY = 3000;

export default function VideoOutputPanel({ isLive, onStop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<PipVideo | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewRef = useRef<any>(null);
  const [hasOutput, setHasOutput] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

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

  // Keep the Xmax view attached to one stable DOM node. Fullscreen only changes
  // CSS on its wrapper; it never portals or reparents the WebRTC video.
  useEffect(() => {
    let alive = true;
    let revision = 0;

    const unsubscribe = sessionManager.subscribe((state: SessionState) => {
      const currentRevision = ++revision;
      if (!containerRef.current) return;

      if (state.status !== "live" || !state.remoteTrack) {
        setHasOutput(false);
        const existingView = viewRef.current;
        viewRef.current = null;
        if (existingView) {
          try {
            if (typeof existingView.detach === "function") existingView.detach();
          } catch { /* The SDK may already have detached the view. */ }
        }
        return;
      }

      void (async () => {
        try {
          const { XmaxRealtimeVideoView, VideoContentMode } = await import("@xmaxai/web-sdk");
          if (!alive || currentRevision !== revision || !containerRef.current) return;

          let view = viewRef.current;
          if (!view) {
            view = new XmaxRealtimeVideoView();
            view.element.style.width = "100%";
            view.element.style.height = "100%";
            view.element.style.display = "block";
            view.attach(containerRef.current);
            view.videoContentMode = VideoContentMode.fill;
            viewRef.current = view;
          }

          view.track = state.remoteTrack;
          if (alive && currentRevision === revision) setHasOutput(true);
        } catch {
          if (alive && currentRevision === revision) setHasOutput(false);
        }
      })();
    });

    return () => {
      alive = false;
      revision += 1;
      unsubscribe();
      const existingView = viewRef.current;
      viewRef.current = null;
      if (existingView) {
        try {
          if (typeof existingView.detach === "function") existingView.detach();
        } catch { /* Best-effort SDK cleanup. */ }
      }
    };
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // In fullscreen on touch devices, controls auto-fade after a few seconds and
  // reappear on tap so the live/expanded video isn't permanently obstructed.
  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    if (!isDesktop) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    }
  }, [isDesktop, clearHideTimer]);

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) void lock.release().catch(() => {});
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock) return;
      const lock = await nav.wakeLock.request("screen");
      wakeLockRef.current = lock;
    } catch {
      // Wake Lock can be refused (e.g. low battery, unsupported browser); the
      // screen may dim in that case, but the live session itself is unaffected.
    }
  }, []);

  const enterFullscreen = useCallback(() => {
    // In-page expanded view, not the browser Fullscreen API. Browser tabs,
    // toolbars and the operating-system taskbar remain available.
    setIsFullscreen(true);
    showControlsTemporarily();
    void requestWakeLock();
  }, [showControlsTemporarily, requestWakeLock]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    clearHideTimer();
    setControlsVisible(true);
    releaseWakeLock();
  }, [clearHideTimer, releaseWakeLock]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, exitFullscreen]);

  // Re-acquire the wake lock if the tab regains visibility while still in the
  // expanded view (the OS/browser releases it automatically on background).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && isFullscreen && !wakeLockRef.current) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isFullscreen, requestWakeLock]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      releaseWakeLock();
    };
  }, [clearHideTimer, releaseWakeLock]);

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
      // Picture-in-Picture can be blocked by browser policy or unsupported tracks.
    }
  }, []);

  const handleStopFromFullscreen = useCallback(() => {
    exitFullscreen();
    onStop();
  }, [onStop, exitFullscreen]);

  const viewerClass = isFullscreen
    ? isDesktop ? "viewer-wrap viewer-desktop-expanded" : "viewer-wrap viewer-fullscreen"
    : "viewer-wrap";

  return (
    <div
      className={viewerClass}
      aria-label={isFullscreen ? "Expanded live video preview" : "Live video preview"}
      onPointerDown={isFullscreen && !isDesktop ? showControlsTemporarily : undefined}
    >
      <div className="output-stage">
        <div ref={containerRef} className="video-mount" />
        {!hasOutput && <OutputPlaceholder isLive={isLive} />}
      </div>

      {isFullscreen ? (
        <div
          className={`fullscreen-controls${!controlsVisible ? " is-hidden" : ""}`}
          aria-label="Expanded video controls"
        >
          <button className="icon-control" type="button" onClick={exitFullscreen} aria-label="Exit expanded view" title="Exit expanded view">
            <FullscreenExitIcon />
          </button>
          <button className="icon-control icon-control-stop" type="button" onClick={handleStopFromFullscreen} aria-label="Stop live session" title="Stop live session">
            <StopIcon />
          </button>
        </div>
      ) : (
        <div className="output-actions" aria-label="Video controls">
          <button className="icon-control" type="button" onClick={enterFullscreen} disabled={!isLive} aria-label="Expand video" title="Expand video">
            <FullscreenIcon />
          </button>
          {isDesktop && (
            <button className="icon-control" type="button" onClick={() => void enterPiP()} disabled={!hasOutput || !pipSupported} aria-label="Picture in Picture" title="Picture in Picture">
              <PipIcon />
            </button>
          )}
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
