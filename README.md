# FaceTime

A mobile-first Next.js app for real-time character replacement.

## Features

- Single API key input (no key rotation, account system, database, or billing layer).
- Reference image upload and live camera input.
- Generated output viewer with mobile fullscreen and auto-hiding controls (5 seconds).
- Desktop expanded window and browser Picture-in-Picture where supported.
- The output viewer displays black/empty output if generation is not live; it does not intentionally fall back to the original camera feed.
- For OBS on desktop, use Window Capture on the FaceTime browser window. There is no OBS stream-key integration.

## Important provider limitations

The web SDK used by this app does not expose a documented API-key balance/preflight validation method in the integration included here. Creating an SDK client is not proof that a key is valid, and this app does not invent a balance endpoint or claim to verify an exact credit balance before the session. The provider will accept or reject the key when the realtime session connects. If the provider reports a session failure, the output is covered by a black state.

This app also cannot reliably know the exact remaining credit balance or guarantee a black frame at the precise instant credits reach zero unless the provider sends a documented exhaustion/error event. The app reacts to SDK failure state; confirm exact credit reporting with the provider before relying on it operationally.

The API key is entered in the browser because the supplied project uses the browser SDK. A key used in a public browser app can be inspected by the person using that browser. Do not put a permanent/high-privilege secret key into a public website. For public production use, add a server-side key exchange that issues short-lived, restricted client keys using the provider's documented endpoint.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

1. Extract this ZIP.
2. Upload the project folder to a GitHub repository.
3. In Vercel, import that repository.
4. Keep the framework preset as Next.js and the root directory as the project root.
5. Deploy. No environment variables are configured in this browser-key version.

Use HTTPS in production because browser camera access requires a secure context.

## Before public launch

- Configure a documented server-side temporary-key flow so permanent API keys are never exposed to visitors.
- Verify current provider model availability, pricing, credit behavior, and API-key permissions.
- Test camera permission, generated video, fullscreen, and Picture-in-Picture on the actual target phones and desktop browsers.
- Add privacy policy, terms, and any required provider attribution/branding or notices. Removing a provider's visible name from the UI does not remove contractual or attribution obligations.
