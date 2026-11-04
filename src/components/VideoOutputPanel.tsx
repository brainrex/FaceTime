"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sessionManager } from "@/lib/sessionManager";
import type { SessionState } from "@/lib/sessionManager";

interface Props {
  isLive: boolean;
  onStop: () => void;
}

type ViewMode = "windowed" | "expanded" | "fullscreen";

export default function VideoOutputPanel({ isLive, onStop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewRef = useRef<any>(null);

  const [hasOutput, setHasOutput] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("windowed");
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Track browser fullscreen state ───────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setViewMode((m) => (m === "fullscreen" ? "windowed" : m));
        setControlsVisible(true);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Subscribe to session and attach video track ───────────────────────────
  useEffect(() => {
    let alive = true;

    const unsub = sessionManager.subscribe(async (state: SessionState) => {
      if (!alive || !containerRef.current) return;

      // Always black when there is no confirmed live output.
      if (state.status !== "live" || !state.remoteTrack) {
        setHasOutput(false);
        // Detach the view if we had one.
        if (viewRef.current) {
          try {
            const v = viewRef.current;
            if (typeof v.detach === "function") v.detach();
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

  // ── Control auto-hide (fullscreen only) ──────────────────────────────────
  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 5000);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const enterFullscreen = useCallback(async () => {
    if (!shellRef.current) return;
    try {
      await shellRef.current.requestFullscreen();
      setViewMode("fullscreen");
      setControlsVisible(true);
      scheduleHideControls();
    } catch {
      // Fullscreen refused — stay in windowed mode.
    }
  }, [scheduleHideControls]);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    setViewMode("windowed");
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  // ── Expanded desktop view ─────────────────────────────────────────────────
  const toggleExpanded = useCallback(() => {
    setViewMode((m) => (m === "expanded" ? "windowed" : "expanded"));
  }, []);

  // ── Picture-in-Picture ────────────────────────────────────────────────────
  const enterPiP = useCallback(async () => {
    const video = containerRef.current?.querySelector("video") as (HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
    }) | null;

    if (!video?.requestPictureInPicture) {
      alert("Picture-in-Picture is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    try {
      await video.requestPictureInPicture();
    } catch {
      alert("Could not open Picture-in-Picture. Make sure the video is playing.");
    }
  }, []);

  const handleStopFromFullscreen = useCallback(async () => {
    await exitFullscreen();
    onStop();
  }, [exitFullscreen, onStop]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isExpanded = viewMode === "expanded";
  const isFullscreen = viewMode === "fullscreen";

  return (
    <>
      {/* Expanded desktop overlay */}
      {isExpanded && (
        <div className="desktop-expanded">
          <div className="desktop-expanded-header">
            <div className="card-label" style={{ marginBottom: 0 }}>Live output</div>
            <button className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: 12 }} onClick={toggleExpanded}>
              Close
            </button>
          </div>
          <div ref={shellRef} className="output-stage" style={{ flex: 1, aspectRatio: "auto", maxHeight: "none", minHeight: 0 }}>
            <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
            {!hasOutput && <OutputPlaceholder isLive={isLive} />}
          </div>
          <div className="output-actions" style={{ paddingTop: 14 }}>
            <button className="btn btn-secondary" onClick={enterPiP} disabled={!hasOutput}>Picture in Picture</button>
            <button className="btn btn-danger" onClick={() => { toggleExpanded(); onStop(); }} disabled={!isLive}>Stop session</button>
          </div>
        </div>
      )}

      {/* Normal view + fullscreen shell */}
      <div
        ref={shellRef}
        className={isFullscreen ? "mobile-fullscreen-wrap" : "viewer-wrap"}
        onClick={isFullscreen ? revealControls : undefined}
        aria-label={isFullscreen ? "Tap to show controls" : undefined}
      >
        <div className={`output-stage${isFullscreen ? "" : ""}`}>
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          {!hasOutput && <OutputPlaceholder isLive={isLive} />}

          {/* Fullscreen overlay controls */}
          {isFullscreen && (
            <div className={`fullscreen-controls${controlsVisible ? "" : " hidden"}`}>
              <button
                className="btn btn-secondary"
                style={{ minWidth: 110 }}
                onClick={(e) => { e.stopPropagation(); void exitFullscreen(); }}
              >
                Exit
              </button>
              <button
                className="btn btn-danger"
                style={{ minWidth: 110 }}
                onClick={(e) => { e.stopPropagation(); void handleStopFromFullscreen(); }}
              >
                Stop
              </button>
            </div>
          )}
        </div>

        {/* Normal-mode button row */}
        {!isFullscreen && !isExpanded && (
          <div className="output-actions">
            <button className="btn btn-secondary" onClick={enterFullscreen} disabled={!isLive}>
              Fullscreen
            </button>
            <button
              className="btn btn-secondary"
              style={{ display: "none" }}
              id="btn-expand"
              onClick={toggleExpanded}
              disabled={!isLive}
            >
              Expand
            </button>
            <button className="btn btn-secondary" id="btn-pip" onClick={enterPiP} disabled={!hasOutput}>
              Picture in Picture
            </button>
          </div>
        )}
      </div>

      {/* JS: show desktop-only buttons on wide screens */}
      <style>{`
        @media (min-width: 860px) {
          #btn-expand { display: inline-flex !important; }
        }
        @media (max-width: 859px) {
          #btn-pip { display: none !important; }
        }
      `}</style>
    </>
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
      <span>
        {isLive ? "Connecting to live output…" : "Output will appear here"}
      </span>
    </div>
  );
}
