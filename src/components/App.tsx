"use client";

import { useCallback, useEffect, useState } from "react";
import { sessionManager } from "@/lib/sessionManager";
import VideoOutputPanel from "./VideoOutputPanel";
import ReferenceImagePanel from "./ReferenceImagePanel";

type Step = "key" | "reference" | "ready" | "live" | "error";

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/无效的用户\s*API\s*Key|invalid user api key|invalid api key/i.test(message)) {
    return "This API key was rejected. Check that it is an active Global API key with access to real-time generation.";
  }
  if (/insufficient|not enough credits|余额不足/i.test(message)) {
    return "Your Xmax account does not have enough balance to start this session.";
  }
  if (/network|failed to fetch|timeout|连接失败/i.test(message)) {
    return "Could not reach Xmax. Check your internet connection and try again.";
  }
  return message;
}

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyVerified, setKeyVerified] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("key");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState("");

  const isLive = step === "live";
  const isBusy = isVerifying || isUploading || isStarting || isStopping;

  const handleKeyConfirm = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("Enter your API key to continue.");
      return;
    }
    setError("");
    setIsVerifying(true);
    try {
      await sessionManager.verifyApiKey(apiKey.trim());
      setKeyVerified(true);
      setStep("reference");
    } catch (e) {
      setKeyVerified(false);
      setError(friendlyError(e));
    } finally {
      setIsVerifying(false);
    }
  }, [apiKey]);

  const handleKeyChange = (value: string) => {
    setApiKey(value);
    setKeyVerified(false);
    setReferenceUrl(null);
    setStep("key");
    setError("");
  };

  const handleUpload = useCallback(async (file: File) => {
    if (!apiKey.trim() || !keyVerified) throw new Error("Verify your API key before uploading an image.");
    setError("");
    setIsUploading(true);
    try {
      const url = await sessionManager.uploadReferenceImage(apiKey.trim(), file);
      setReferenceUrl(url);
      setStep("ready");
      return url;
    } catch (e) {
      const message = friendlyError(e);
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploading(false);
    }
  }, [apiKey, keyVerified]);

  const handleReferenceRemove = () => {
    setReferenceUrl(null);
    setStep("reference");
  };

  const handleStart = useCallback(async () => {
    if (!apiKey.trim() || !keyVerified || !referenceUrl) return;
    setError("");
    setIsStarting(true);
    try {
      sessionManager.reset();
      await sessionManager.startSession(apiKey.trim(), referenceUrl, true);
      setStep("live");
    } catch (e) {
      setError(friendlyError(e));
      setStep("error");
    } finally {
      setIsStarting(false);
    }
  }, [apiKey, keyVerified, referenceUrl]);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await sessionManager.stopSession();
    } finally {
      setIsStopping(false);
      setStep(referenceUrl ? "ready" : "reference");
    }
  }, [referenceUrl]);

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((state) => {
      if (state.status === "error" && step === "live") {
        setError(friendlyError(state.error ?? "The live session ended unexpectedly."));
        setStep("error");
      }
    });
    return () => {
      unsubscribe();
    };
  }, [step]);

  useEffect(() => {
    return () => {
      void sessionManager.stopSession().catch(() => {});
    };
  }, []);

  const handleRetry = () => {
    setError("");
    sessionManager.reset();
    setStep(referenceUrl ? "ready" : keyVerified ? "reference" : "key");
  };

  return (
    <main className="app-root">
      <div className="page-wrap">
        <header className="site-header">
          <a className="wordmark" href="/" aria-label="FaceTime home">
            <span className="wordmark-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <rect x="3" y="5" width="26" height="22" rx="7" stroke="currentColor" strokeWidth="2" />
                <path d="M13 12.5 21 16l-8 3.5v-7Z" fill="currentColor" />
              </svg>
            </span>
            <span className="wordmark-name">FaceTime</span>
          </a>
          <div className={`session-badge${isLive ? " live" : ""}`}>
            <span className="session-dot" />
            {isLive ? "Live" : isBusy ? "Working…" : "Studio"}
          </div>
        </header>

        <section className="intro">
          <p className="eyebrow">REAL-TIME CHARACTER REPLACEMENT</p>
          <h1>Step into another <span>character.</span></h1>
          <p className="intro-copy">Bring a reference image to life in your live camera feed.</p>
        </section>

        <div className="workspace">
          <aside className="control-panel">
            <section className="setup-section">
              <div className="section-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>Connect your account</h2>
                  <p>Use your Xmax API key to begin.</p>
                </div>
              </div>

              <label className="field-label" htmlFor="api-key">API key</label>
              <div className="field-row">
                <input
                  id="api-key"
                  className="field"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your API key"
                  value={apiKey}
                  onChange={(event) => handleKeyChange(event.target.value)}
                  disabled={isBusy || isLive}
                />
                <button
                  className="visibility-button"
                  type="button"
                  onClick={() => setShowKey((visible) => !visible)}
                  disabled={isBusy || isLive}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>

              {keyVerified ? (
                <div className="verified-state">
                  <span className="verified-check">✓</span>
                  API key verified
                  <button type="button" onClick={() => handleKeyChange("")} disabled={isBusy || isLive}>Change</button>
                </div>
              ) : (
                <button className="button button-primary button-full" onClick={handleKeyConfirm} disabled={!apiKey.trim() || isBusy}>
                  {isVerifying ? <><span className="spinner" /> Verifying…</> : "Verify API key"}
                </button>
              )}
            </section>

            <div className="section-divider" />

            <section className={`setup-section${!keyVerified ? " section-disabled" : ""}`}>
              <div className="section-heading">
                <span className="step-number">02</span>
                <div>
                  <h2>Choose your character</h2>
                  <p>Upload a clear reference image.</p>
                </div>
              </div>
              <ReferenceImagePanel
                referenceUrl={referenceUrl}
                onUpload={handleUpload}
                onRemove={handleReferenceRemove}
                disabled={!keyVerified || isLive || isBusy}
                uploading={isUploading}
              />
            </section>

            {error && (
              <div className="error-message" role="alert">
                <span className="error-icon">!</span>
                <div>
                  <p>{error}</p>
                  {step === "error" && <button type="button" className="text-button" onClick={handleRetry}>Try again</button>}
                </div>
              </div>
            )}

            <div className="start-area">
              {!isLive ? (
                <button className="button button-primary button-full start-button" onClick={handleStart} disabled={!keyVerified || !referenceUrl || isBusy}>
                  {isStarting ? <><span className="spinner" /> Starting session…</> : "Start live session"}
                  {!isStarting && <span aria-hidden="true">↗</span>}
                </button>
              ) : (
                <button className="button button-stop button-full start-button" onClick={handleStop} disabled={isStopping}>
                  {isStopping ? <><span className="spinner" /> Ending session…</> : "End live session"}
                </button>
              )}
              <p className="privacy-note">Your key is not saved by FaceTime. Requests are sent to Xmax.</p>
            </div>
          </aside>

          <section className="preview-panel" aria-label="Live video preview">
            <div className="preview-header">
              <div>
                <p className="eyebrow">YOUR CANVAS</p>
                <h2>Live preview</h2>
              </div>
              {isLive && <span className="live-pill"><span className="session-dot" /> LIVE</span>}
            </div>
            <VideoOutputPanel isLive={isLive} onStop={handleStop} />
            <p className="preview-caption">{isLive ? "Your generated character is now live." : "Your live character will appear here."}</p>
          </section>
        </div>

        <footer className="site-footer">FaceTime <span>·</span> A new way to show up.</footer>
      </div>
    </main>
  );
}
