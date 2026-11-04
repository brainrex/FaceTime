# FaceTime

Real-time AI character replacement for live video.

FaceTime transforms a live camera input into a generated character appearance using an uploaded reference image.

## Features

- Real-time character replacement
- Custom character images (PNG, JPG, and WebP)
- Live generated-video preview
- In-page expanded video view that keeps browser controls and the operating-system taskbar available
- Picture-in-Picture on supported desktop browsers
- Responsive mobile and desktop interface
- Xmax API-key verification without a separate FaceTime account

## How it works

1. Enter and verify your Xmax API key.
2. Upload a clear character reference image.
3. Allow camera access and start the live session.
4. View the generated character in the preview.

## Technology

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Xmax Web SDK

## Requirements

- A modern browser with camera access
- A secure HTTPS connection when deployed
- A valid Xmax Global API key with access to real-time generation

## Capturing the preview in OBS

FaceTime no longer provides a separate streaming URL or Browser Source integration. To capture the generated output, add a **Window Capture** source in OBS and select the browser window displaying FaceTime. Crop the source to the preview area if you only want the generated video.

FaceTime is an independent project. Third-party services and SDKs remain subject to their respective terms and licenses.
