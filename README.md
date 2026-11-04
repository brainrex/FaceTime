FaceTime

Real-time AI character replacement for live video.

FaceTime is a real-time character replacement platform that transforms your live camera input into a generated character appearance using an uploaded reference image.

Designed for simplicity and seamless use, FaceTime lets you connect your API key, choose a character reference, and start a live transformation session directly from your browser.

Features

* Real-Time Character Replacement – Transform your live camera appearance using an uploaded character reference.
* Custom Character Images – Upload PNG, JPG, or WebP images to define your desired appearance.
* Live Video Preview – View your generated output directly in the browser.
* Fullscreen Viewing – Enjoy an immersive viewing experience on mobile devices.
* Picture-in-Picture – Keep your generated video visible in a floating window on supported desktop browsers.
* Responsive Design – Optimized for mobile phones, tablets, and desktop computers.
* Simple API Integration – Connect using your API key without creating an account.
* Privacy-Conscious Design – Your original camera feed is not displayed as the generated output.

How It Works

1. Connect – Enter your API key.
2. Choose – Upload an image of the character you want to use.
3. Start – Allow camera access and begin your live session.
4. Transform – FaceTime generates your character-replaced video in real time.
5. View – Watch your output in the browser, fullscreen, or Picture-in-Picture mode.

Technology

* Next.js
* React
* TypeScript
* Tailwind CSS
* Real-time AI video processing SDK

Requirements

* A modern web browser.
* A working camera.
* A secure HTTPS connection for deployed use.
* A valid API key.
* A compatible device and browser for fullscreen and Picture-in-Picture features.

License

All rights reserved.

FaceTime is an independent project. Third-party services and SDKs remain subject to their respective terms and licenses.


OBS Browser Source

FaceTime can publish the generated character-replacement video to a private OBS Browser Source page on desktop browsers. OBS receives only the generated output; it does not capture the FaceTime window or the original camera.

LiveKit setup

1. Create a project in LiveKit Cloud and copy its WebSocket URL, API key, and API secret.
2. In the Vercel project, open Settings → Environment Variables.
3. Add these variables for the Production environment (and Preview if needed):
   * LIVEKIT_URL
   * LIVEKIT_API_KEY
   * LIVEKIT_API_SECRET
4. Redeploy FaceTime after saving the variables.
5. Start a live session on a desktop computer. FaceTime will create a private OBS URL when the generated video is ready.

For local development, copy .env.example to .env.local and fill in the same three values. Never put the LiveKit API secret in a NEXT_PUBLIC_ variable or share it in the browser.

OBS setup

1. Copy the private OBS URL shown in FaceTime.
2. In OBS, open Sources → + → Browser.
3. Paste the URL. A canvas size of 1920 × 1080 is a good starting point.
4. Confirm the OBS preview displays the generated character.

The OBS URL is a private viewing credential. Anyone who has it can view the active output, so share it only with people you trust. Ending the FaceTime session closes the LiveKit room and disables the output URL. No FaceTime account database is required for this feature.
