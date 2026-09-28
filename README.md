# Monitron Chrome Extension

Streams tab-audio EQ bands (`bass` / `mid` / `high` / `beat`) into [monitron-web](../monitron-web) via `window.postMessage`. Contract: `monitron-web/lib/audioBus.ts`.

## Setup

```bash
npm install
npm run dev
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo’s `dist/` folder
4. Run the site: `npm run dev` in `monitron-web` → `http://localhost:3000/s/matrix`

## Smoke test

1. Open Matrix. Until the extension injects, Leva has no **equalizer** folder.
2. With the extension loaded on localhost, the folder appears (`hello`).
3. Click the extension icon → **Listen** on a tab that is playing audio (YouTube, etc.).
   Or hit **dock** in the popup to pin the same UI in Chrome’s side panel (stays open while you watch Matrix).
4. In Leva: **reactive** / viz on → rain / viz react to bass & beat.
5. Viz off → analysis stops; bands go to 0 on the page.

Console-only check (no stream):

```js
postMessage({ source: "monitron-extension", type: "hello" }, "*");
postMessage({
  source: "monitron-extension",
  type: "audio-frame",
  t: performance.now(),
  bass: 1, mid: 0.4, high: 0.2, beat: 1,
}, "*");
```

## Architecture

```
Popup / side panel (pick tab)
  → background (tabCapture.getMediaStreamId)
  → offscreen (AudioContext + AnalyserNode)
  → background → content script on Monitron tab
  → window.postMessage(audio-frame)

Page Leva reactive on/off
  → window.postMessage(visualizer-toggle)
  → content script → background start/stop analysis
```

Shared UI lives in `src/ui/TabAudioPanel.tsx` (popup + side panel).

No per-frame `localStorage` / `chrome.storage`. Frames are live `postMessage` only.

## Permissions

- `tabs` — list tabs in the popup
- `tabCapture` — capture chosen tab audio
- `offscreen` — keep Analyser alive after the popup closes
- host access: `localhost:3000` / `127.0.0.1:3000` (add prod origin later)

## Build

```bash
npm run build
```

Load `dist/` (or the zip under `release/`).
