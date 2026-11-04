"use client";

import { useCallback, useEffect, useState } from "react";
import { sessionManager } from "@/lib/sessionManager";
import VideoOutputPanel from "./VideoOutputPanel";
import ReferenceImagePanel from "./ReferenceImagePanel";

type Step = "key" | "reference" | "ready" | "live" | "error";

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("key");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState("");

  const isLive = step === "live";
  const isBusy = isStarting || isStopping;

  // ── Derive step from state ────────────────────────────────────────────────
  const handleKeyConfirm = () => {
    setError("");
    if (!apiKey.trim()) {
      setError("Enter your API key to continue.");
      return;
    }
    setStep("reference");
  };

  const handleReferenceReady = (url: string | null) => {
    setReferenceUrl(url);
    if (url && step === "reference") setStep("ready");
    if (!url && step === "ready") setStep("reference");
  };

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!apiKey.trim() || !referenceUrl) return;
    setError("");
    setIsStarting(true);
    try {
      sessionManager.reset();
      await sessionManager.startSession(apiKey.trim(), referenceUrl, true);
      setStep("live");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStep("error");
    } finally {
      setIsStarting(false);
    }
  }, [apiKey, referenceUrl]);

  // ── Stop ──────────────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await sessionManager.stopSession();
    } finally {
      setIsStopping(false);
      setStep(referenceUrl ? "ready" : "reference");
    }
  }, [referenceUrl]);

  // ── Listen for session failures mid-stream ────────────────────────────────
  useEffect(() => {
    const unsub = sessionManager.subscribe((state) => {
      if (state.status === "error" && step === "live") {
        setError(state.error ?? "The session ended unexpectedly.");
        setStep("error");
      }
    });
    return unsub;
  }, [step]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      void sessionManager.stopSession().catch(() => {});
    };
  }, []);

  // ── Retry after error ─────────────────────────────────────────────────────
  const handleRetry = () => {
    setError("");
    sessionManager.reset();
    setStep(referenceUrl ? "ready" : "reference");
  };

  const keyConfirmed = step !== "key";

  return (
    <div className="app-root">
      <div className="page-wrap">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="site-header">
          <div className="wordmark">
            <div className="wordmark-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                <circle cx="12" cy="12" r="4"/>
              </svg>
            </div>
            <div>
              <div className="wordmark-name">FaceTime</div>
              <div className="wordmark-tagline">Live character experience</div>
            </div>
          </div>

          <div className={`session-badge${isLive ? " live" : ""}`}>
            <span className="session-dot" />
            {isLive ? "Live" : isBusy ? "Connecting…" : "Ready"}
          </div>
        </header>

        {/* ── Main grid ────────────────────────────────────────────────── */}
        <div className="app-grid">

          {/* Left column – controls */}
          <aside>

            {/* Step 1: API key */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-label">API key</div>
              <p className="card-title" style={{ marginBottom: 14 }}>Connect</p>

              <label className="field-label" htmlFor="api-key">Your key</label>
              <div className="field-row" style={{ marginBottom: keyConfirmed ? 10 : 0 }}>
                <input
                  id="api-key"
                  className="field"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your key here"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (keyConfirmed) {
                      setStep("key");
                      setReferenceUrl(null);
                    }
                  }}
                  disabled={isBusy || isLive}
                />
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  disabled={isBusy || isLive}
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>

              {keyConfirmed ? (
                <div className="key-verified">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Key confirmed
                </div>
              ) : (
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 12 }}
                  onClick={handleKeyConfirm}
                  disabled={!apiKey.trim() || isBusy}
                >
                  Continue
                </button>
              )}
            </div>

            {/* Step 2: Reference image */}
            <div className={`card${!keyConfirmed ? " muted" : ""}`} style={{ marginBottom: 16 }}>
              <div className="card-label">Character</div>
              <p className="card-title" style={{ marginBottom: 4 }}>Reference image</p>
              <p className="card-desc">Upload a clear image of the character to use.</p>
              <ReferenceImagePanel
                referenceUrl={referenceUrl}
                onUrlReady={handleReferenceReady}
                disabled={!keyConfirmed || isLive || isBusy}
              />
            </div>

            {/* Error banner */}
            {error && (
              <div className="alert alert-error" style={{ marginBottom: 14 }}>
                {error}
                {step === "error" && (
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={handleRetry}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}

            {/* Start / Stop */}
            {!isLive ? (
              <button
                className="btn btn-primary btn-full"
                onClick={handleStart}
                disabled={!keyConfirmed || !referenceUrl || isBusy}
              >
                {isStarting ? (
                  <><span className="spinner" /> Starting…</>
                ) : (
                  "Start live session"
                )}
              </button>
            ) : (
              <button
                className="btn btn-danger btn-full"
                onClick={handleStop}
                disabled={isStopping}
              >
                {isStopping ? (
                  <><span className="spinner" style={{ borderTopColor: "#fca5a5" }} /> Stopping…</>
                ) : (
                  "End session"
                )}
              </button>
            )}

          </aside>

          {/* Right column – video output */}
          <section className="card" style={{ padding: 20 }}>
            <div className="viewer-controls">
              <div className="viewer-title">
                <div className="card-label" style={{ marginBottom: 4 }}>Live output</div>
                <p className="card-title" style={{ marginBottom: 0 }}>Generated video</p>
              </div>
              {isLive && (
                <div className="live-pill">
                  <span className="session-dot" />
                  LIVE
                </div>
              )}
            </div>

            <VideoOutputPanel isLive={isLive} onStop={handleStop} />

            <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
              On desktop, use Picture in Picture or capture this window in your capture software.
            </p>
          </section>

        </div>

        <footer style={{ marginTop: 48, textAlign: "center", fontSize: 11, color: "var(--text-3)" }}>
          FaceTime · Live character experience
        </footer>
      </div>
    </div>
  );
}
