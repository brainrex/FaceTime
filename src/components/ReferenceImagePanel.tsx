"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  referenceUrl: string | null;
  onUpload: (file: File) => Promise<string>;
  onRemove: () => void;
  disabled?: boolean;
  uploading?: boolean;
}

async function prepareUploadImage(file: File): Promise<File> {
  // Decode and downscale oversized phone photos; keep the original if compression
  // would make the upload larger or if the browser cannot decode the format.
  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1920;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close(); return file; }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "reference";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export default function ReferenceImagePanel({ referenceUrl, onUpload, onRemove, disabled, uploading }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const processFile = useCallback(async (file: File) => {
    setLocalError("");
    if (!file.type.startsWith("image/")) {
      setLocalError("Choose a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setLocalError("Choose an image smaller than 15 MB.");
      return;
    }
    const localPreview = URL.createObjectURL(file);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = localPreview;
    setPreviewUrl(localPreview);
    try {
      const uploadFile = await prepareUploadImage(file);
      await onUpload(uploadFile);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Image upload failed. Please try again.");
    }
  }, [onUpload]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  };

  const handleRemove = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
    setLocalError("");
    onRemove();
  };

  const imageSrc = previewUrl ?? referenceUrl;

  return (
    <div className="reference-uploader">
      {imageSrc ? (
        <div className="reference-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="Selected character reference" />
          <div className="reference-preview-info">
            <strong>{uploading ? "Uploading image…" : referenceUrl ? "Image ready" : "Preparing image"}</strong>
            <span>{uploading ? "Securely preparing your reference" : "Ready for your live session"}</span>
            {!disabled && !uploading && (
              <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>Replace image</button>
            )}
          </div>
          {referenceUrl && <span className="image-ready-mark">✓</span>}
          {!disabled && !uploading && (
            <button type="button" className="remove-image" onClick={handleRemove} aria-label="Remove reference image">×</button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={`upload-zone${dragging ? " is-dragging" : ""}`}
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file && !disabled) void processFile(file);
          }}
        >
          <span className="upload-icon">↑</span>
          <strong>{uploading ? "Uploading…" : "Choose an image"}</strong>
          <span>or drag and drop it here</span>
          <small>PNG, JPG or WebP · Up to 15 MB</small>
        </button>
      )}
      {localError && <p className="upload-error" role="alert">{localError}</p>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleChange} hidden />
    </div>
  );
}
