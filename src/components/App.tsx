"use client";

import { useCallback, useEffect, useState } from "react";
import { sessionManager } from "@/lib/sessionManager";
import { obsStreamManager } from "@/lib/obsStreamManager";
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
  const [obsUrl, setObsUrl] = useState("");
  const [obsUrlLoading, setObsUrlLoading] = useState(true);
  const [obsError, setObsError] = useState("");
  const [obsStarting, setObsStarting] = useState(false);
  const [obsCopied, setObsCopied] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const isLive = step === "live";
  const isBusy = isVerifying || isUploading || isStarting || isStopping;
  useEffect(() => {
    let cancelled = false;
    const loadPermanentOutput = async () => {
      try {
        const response = await fetch("/api/obs/session", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the OBS link.");
        if (!cancelled) setObsUrl(result.streamUrl);
      } catch (loadError) {
        if (!cancelled) setObsError(loadError instanceof Error ? loadError.message : "Could not load the OBS link.");
      } finally {
        if (!cancelled) setObsUrlLoading(false);
      }
    };
    void loadPermanentOutput();
    return () => { cancelled = true; };
  }, []);


  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px) and (pointer: fine)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

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
      await obsStreamManager.stop();
      sessionManager.reset();
      setObsError("");
      setObsCopied(false);
      await sessionManager.startSession(apiKey.trim(), referenceUrl, true);
      setStep("live");

      if (window.matchMedia("(min-width: 900px) and (pointer: fine)").matches) {
        setObsStarting(true);
        try {
          const generatedTrack = sessionManager.getState().remoteTrack;
          if (!generatedTrack) throw new Error("The generated video track is not available yet.");
          const output = await obsStreamManager.start(generatedTrack as unknown as MediaStreamTrack);
          setObsUrl(output.url);
        } catch (obsFailure) {
          setObsError(friendlyError(obsFailure));
        } finally {
          setObsStarting(false);
        }
      }
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
      await obsStreamManager.stop();
      await sessionManager.stopSession();
    } finally {
      setObsError("");
      setObsStarting(false);
      setIsStopping(false);
      setStep(referenceUrl ? "ready" : "reference");
    }
  }, [referenceUrl]);

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((state) => {
      if (state.status === "error" && step === "live") {
        setError(friendlyError(state.error ?? "The live session ended unexpectedly."));
        void obsStreamManager.stop();
        setStep("error");
      }
    });
    return () => {
      unsubscribe();
    };
  }, [step]);

  useEffect(() => {
    return () => {
      void obsStreamManager.stop();
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
          <p className="intro-copy">Experience a new reality, live.</p>
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
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{showKey ? <><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 9 4.5 10 7-.4 1.1-1.3 2.5-2.7 3.7M6.2 6.2C4.1 7.5 2.6 9.5 2 12c.6 1.7 2.2 3.7 4.7 5.2A10.8 10.8 0 0012 19c1.2 0 2.3-.2 3.3-.6"/></> : <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}</svg>
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
            </div>

            {isDesktop && (
              <section className="obs-output-card" aria-label="OBS Browser Source output">
                <div className="obs-output-heading">
                  <div className="obs-output-icon" aria-hidden="true">↗</div>
                  <div>
                    <h3>OBS Browser Source</h3>
                    <p>{obsStarting ? "Preparing your private output…" : obsUrl ? "Your generated video is ready for OBS." : "The OBS output is not connected."}</p>
                  </div>
                  <span className={obsUrl ? "obs-status connected" : "obs-status"}>{obsUrl ? "Ready" : obsStarting ? "Connecting" : "Offline"}</span>
                </div>
                {obsUrl ? (
                  <>
                    <div className="obs-url-row">
                      <input className="obs-url-field" aria-label="Private OBS output URL" value={obsUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                      <button className="obs-copy-button" type="button" onClick={() => {
                        void navigator.clipboard.writeText(obsUrl).then(() => setObsCopied(true)).catch(() => setObsError("Copy was blocked by your browser. Select the URL and copy it manually."));
                      }}>{obsCopied ? "Copied" : "Copy URL"}</button>
                    </div>
                    <p className="obs-help">In OBS: Sources → + → Browser → paste the URL above.</p>
                  </>
                ) : obsError ? (
                  <p className="obs-error" role="status">{obsError}</p>
                ) : (
                  <p className="obs-help">A private link will appear here when the output connects.</p>
                )}
              </section>
            )}
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
