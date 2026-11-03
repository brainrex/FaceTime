"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sessionManager } from "@/lib/sessionManager";
import VideoOutputPanel from "./VideoOutputPanel";
import ReferenceImagePanel from "./ReferenceImagePanel";

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyReady, setKeyReady] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const stopRef = useRef(false);
  const keyId = "primary";

  const handleContinue = () => {
    setError("");
    if (!apiKey.trim()) { setError("Enter your API key to continue."); return; }
    setKeyReady(true);
  };

  const handleStart = useCallback(async () => {
    setError("");
    if (!apiKey.trim()) { setError("Enter your API key."); return; }
    if (!referenceUrl) { setError("Choose a reference image first."); return; }
    setIsStarting(true);
    stopRef.current = false;
    try {
      sessionManager.setReferenceImageUrl(referenceUrl);
      sessionManager.setPrompt("视频中角色替换成参考图中角色");
      await sessionManager.registerKey(keyId, apiKey.trim());
      await sessionManager.acquireCamera(keyId, true);
      await sessionManager.startActiveSession(keyId);
      if (!stopRef.current) setIsRunning(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Unable to start the live session: ${message}`);
      await sessionManager.stopAll();
    } finally {
      setIsStarting(false);
    }
  }, [apiKey, referenceUrl]);

  const handleStop = useCallback(async () => {
    stopRef.current = true;
    await sessionManager.stopAll();
    setIsRunning(false);
    setIsStarting(false);
    setExpanded(false);
  }, []);

  useEffect(() => () => { void sessionManager.stopAll(); }, []);

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="brand-mark">F</div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">FaceTime</h1>
              <p className="text-sm text-slate-400">Real-time character experience</p>
            </div>
          </div>
          <div className={`status-pill ${isRunning ? "status-live" : "status-idle"}`}>
            <span className="status-dot" />{isRunning ? "Live session" : "Ready"}
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
          <section className="space-y-5">
            <div className="glass-card p-5">
              <div className="section-kicker">01 · ACCESS</div>
              <h2 className="mb-1 text-lg font-semibold">Connect your API key</h2>
              <p className="mb-4 text-sm leading-6 text-slate-400">Use your own authorized API key to start a live session.</p>
              <label className="mb-2 block text-sm font-medium" htmlFor="api-key">API key</label>
              <div className="flex gap-2">
                <input id="api-key" className="field min-w-0 flex-1" type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="Paste API key" value={apiKey} onChange={e => {setApiKey(e.target.value); setKeyReady(false);}} disabled={isRunning || isStarting} />
                <button className="secondary-btn" onClick={() => setShowKey(v => !v)} type="button">{showKey ? "Hide" : "Show"}</button>
              </div>
              {!keyReady && <button className="primary-btn mt-3 w-full" onClick={handleContinue} disabled={!apiKey.trim() || isRunning || isStarting}>Continue</button>}
              {keyReady && <p className="mt-3 text-sm text-emerald-300">Key entered. Add your reference image below.</p>}
              <p className="mt-3 text-xs leading-5 text-slate-500">Your key is held in this browser session and is not saved to an account. Browser-based keys can be seen by the device owner in developer tools; use a key with appropriate limits.</p>
            </div>

            <div className={`glass-card p-5 ${!keyReady ? "opacity-60" : ""}`}>
              <div className="section-kicker">02 · REFERENCE</div>
              <h2 className="mb-1 text-lg font-semibold">Choose your character</h2>
              <p className="mb-4 text-sm text-slate-400">Upload a clear image to use as the character reference.</p>
              <fieldset disabled={!keyReady || isRunning || isStarting}>
                <ReferenceImagePanel onUrlReady={setReferenceUrl} referenceUrl={referenceUrl} />
              </fieldset>
            </div>

            {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
            {!isRunning ? (
              <button className="primary-btn w-full py-4 text-base" onClick={handleStart} disabled={!keyReady || !referenceUrl || isStarting}>
                {isStarting ? <><span className="spinner" /> Starting live session…</> : "Start live"}
              </button>
            ) : (
              <button className="danger-btn w-full py-4 text-base" onClick={handleStop}>Stop live session</button>
            )}
            <p className="px-1 text-xs leading-5 text-slate-500">A secure HTTPS connection and camera permission are required. Your camera is used as the live input; only generated output is displayed in the viewer.</p>
          </section>

          <section className={`glass-card viewer-card p-3 sm:p-4 ${expanded ? "desktop-expanded" : ""}`}>
            <div className="mb-3 flex items-center justify-between px-1">
              <div><div className="section-kicker">03 · LIVE VIEW</div><h2 className="text-lg font-semibold">Generated output</h2></div>
              {isRunning && <span className="live-label"><span className="status-dot" /> LIVE</span>}
            </div>
            <VideoOutputPanel running={isRunning} onStop={handleStop} expanded={expanded} onExpandedChange={setExpanded} />
            <p className="mt-3 px-1 text-xs text-slate-500">On desktop, use the windowed view or Picture-in-Picture. OBS can capture this FaceTime window using Window Capture.</p>
          </section>
        </div>
        <footer className="mt-8 text-center text-xs text-slate-600">FaceTime · Real-time character experience</footer>
      </div>
    </main>
  );
}
