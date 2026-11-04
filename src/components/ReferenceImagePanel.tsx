"use client";

import { useRef, useCallback, useState } from "react";

interface Props {
  referenceUrl: string | null;
  onUrlReady: (url: string | null) => void;
  disabled?: boolean;
}

export default function ReferenceImagePanel({ referenceUrl, onUrlReady, disabled }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        alert("Please choose an image file (PNG, JPG, or WebP).");
        return;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      onUrlReady(url);
    },
    [objectUrl, onUrlReady]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleClear = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    onUrlReady(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [objectUrl, onUrlReady]);

  if (referenceUrl) {
    return (
      <div className="ref-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={referenceUrl} alt="Reference character" className="ref-thumb" />
        <div className="ref-info">
          <div className="ref-status">Character loaded</div>
          <div className="ref-actions">
            {!disabled && (
              <>
                <button
                  className="ref-action-btn ref-action-replace"
                  onClick={() => inputRef.current?.click()}
                  type="button"
                >
                  Replace
                </button>
                <button
                  className="ref-action-btn ref-action-remove"
                  onClick={handleClear}
                  type="button"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`dropzone${dragging ? " dragging" : ""}${disabled ? " opacity-40 pointer-events-none" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        aria-label="Upload reference image"
      >
        <span className="dropzone-icon">🖼</span>
        <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Drop an image here</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)" }}>PNG, JPG, or WebP</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />
    </>
  );
}
