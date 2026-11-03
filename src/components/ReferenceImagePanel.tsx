"use client";

import { useRef, useCallback, useState } from "react";
import { addLog } from "@/lib/diagStore";

interface Props {
  referenceUrl: string | null;
  onUrlReady: (url: string | null) => void;
}

export default function ReferenceImagePanel({ referenceUrl, onUrlReady }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }

      // Revoke previous objectURL to avoid memory leak
      if (objectUrl) URL.revokeObjectURL(objectUrl);

      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      onUrlReady(url);
      addLog("image_loaded", `Reference image loaded: ${file.name} (${Math.round(file.size / 1024)} KB)`);
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
    addLog("image_loaded", "Reference image removed");
  }, [objectUrl, onUrlReady]);

  return (
    <section className="rounded-lg border border-border bg-panel p-3">
      <h2 className="text-sm font-semibold mb-2">Reference Image</h2>

      {referenceUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referenceUrl}
            alt="Reference"
            className="w-20 h-20 object-cover rounded border border-border flex-shrink-0"
          />
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-ok">✓ Image loaded</span>
            <p className="text-muted text-[10px]">
              This image will be used as the character reference for every session.
            </p>
            <button
              onClick={handleClear}
              className="text-err hover:text-err/80 text-[10px] self-start transition"
            >
              Remove image
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="text-accent hover:text-accent/80 text-[10px] self-start transition"
            >
              Replace image
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded border-2 border-dashed ${
            dragging ? "border-accent bg-accent/10" : "border-border"
          } p-6 text-center text-xs text-muted hover:border-accent/60 transition`}
        >
          <div className="text-2xl mb-1">🖼</div>
          <p>Drop an image here or click to browse</p>
          <p className="text-[10px] mt-1">PNG, JPG, WebP — will be retained for all sessions</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </section>
  );
}
