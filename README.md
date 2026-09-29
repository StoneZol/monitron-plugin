# Monitron Chrome Extension

Captures audio from a Chromium tab and streams live EQ bands (`bass` / `mid` / `high` / `beat`) into any page that speaks the **audio bus** protocol via `window.postMessage`.

Source of truth in this repo: `src/shared/protocol.ts` (mirrors `monitron-web/lib/audioBus.ts`).

## Setup

```bash
npm install
npm run build   # or: npm run dev
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → this repo’s `dist/` folder
4. Open [Matrix (deploy)](https://monitron-web-gamma.vercel.app/s/matrix) (or local `http://localhost:3000/s/matrix`)
5. Focus a tab with audio → extension popup → **connect**

## Smoke test

1. Open https://monitron-web-gamma.vercel.app/s/matrix — UI should show the visualizer as talking to the extension (`hello` / not offline).
2. Focus a tab that is playing audio → extension popup → **connect**.
3. Turn **reactive** on — Matrix should move with bass / beat from `audio-frame`.
4. Turn reactive off → analysis stops; bands go idle until re-enabled.

## Integrator API (page ↔ extension)

The extension injects a **content script** only on allowlisted origins. That script bridges:

- extension → page: `window.postMessage(...)`
- page → extension: `window.postMessage(...)` (same window)

Always filter by `event.source === window` and `data.source`.

### Handshake

**Extension → page** (on inject, then every ~2.5s until answered; also on demand):

```js
{ source: "monitron-extension", type: "hello" }
```

**Page → extension** (stop the hello spam / re-announce after navigation):

```js
{ source: "monitron-page", type: "hello-request" }
```

Minimal listener:

```js
window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (
        msg.source === "monitron-extension" &&
        msg.type === "hello"
    ) {
        // Extension is present — show “EQ / reactive” UI, etc.
        window.postMessage(
            {
                source: "monitron-page",
                type: "hello-request",
            },
            "*",
        );
    }
});
```

### Audio frames (extension → page)

While capture is active and analysis is on, frames arrive at ~analyser rate:

```js
{
  source: "monitron-extension",
  type: "audio-frame",
  t: 12345.6,   // performance-ish timestamp from analyser
  bass: 0.0,    // 0..1
  mid: 0.0,     // 0..1
  high: 0.0,    // 0..1
  beat: 0.0,    // 0..1 pulse / onset-ish
}
```

```js
if (
    msg.source === "monitron-extension" &&
    msg.type === "audio-frame"
) {
    const { t, bass, mid, high, beat } = msg;
    // drive viz / shaders / rain / …
}
```

Bands are normalized floats in **0..1**. No persistence — live only (no `localStorage` / `chrome.storage` bus).

### Visualizer / analysis toggle (page → extension)

Tell the extension whether the page wants analysis (saves CPU when viz is off):

```js
{
  source: "monitron-page",
  type: "visualizer-toggle",  // alias also accepted: "eq-toggle"
  enabled: true
}
```

When `enabled: false`, analysis stops and the page should treat bands as idle/zero until re-enabled (and a stream is still connected).

### Console smoke test (no real capture)

On an allowlisted page with the extension loaded:

```js
postMessage(
    { source: "monitron-extension", type: "hello" },
    "*",
);
postMessage(
    {
        source: "monitron-extension",
        type: "audio-frame",
        t: performance.now(),
        bass: 1,
        mid: 0.4,
        high: 0.2,
        beat: 1,
    },
    "*",
);
```

(Those fake posts only exercise _your_ page listener — they do not go through the extension.)

### Constants

| Field            | Value                |
| ---------------- | -------------------- |
| Extension source | `monitron-extension` |
| Page source      | `monitron-page`      |
| Hello            | `hello`              |
| Hello request    | `hello-request`      |
| Frame            | `audio-frame`        |
| Viz toggle       | `visualizer-toggle`  |

## Who needs host access?

Two different roles:

| Role                                                  | Example                             | Needs host permission?                                |
| ----------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| **Audio source** (tab you **connect** to)             | YouTube, Spotify web, any https tab | **No** — `tabCapture` works without listing that site |
| **Receiver** (page that **listens** to `audio-frame`) | Matrix / your viz site              | **Yes** — content script must be injected there       |

`host_permissions` + `content_scripts.matches` come from **`src/shared/hosts.ts`**
(`MONITORN_ORIGINS` → match patterns). That file is the only place to add/remove
receiver sites (also drives `tabs.query` + popup feed link + “don’t capture viz”).

Current origins (see `hosts.ts`):

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `https://monitron-web-gamma.vercel.app` — deploy, e.g. [Matrix](https://monitron-web-gamma.vercel.app/s/matrix)

To plug in your own site: add the origin to `MONITORN_ORIGINS` (and set
`MONITORN_APP_ORIGIN` if it should be the popup feed), rebuild, reload the extension.

### Can we allow _all_ sites as receivers?

Technically yes (`<all_urls>` / `*://*/*` in both places). We **do not** do that by default:

- Install prompt becomes “read and change data on all websites”
- Content script would run on every page (perf + privacy)
- Chrome Web Store review is much harder

Recommended approaches:

1. **Allowlist** — add specific `https://your.domain/*` (current model)
2. Later: **optional permissions** — user grants a custom origin at runtime (`permissions.request`) without shipping `<all_urls>` for everyone

Audio sources stay unrestricted either way.

## Architecture

```
Popup (focused tab → connect)
  → tabCapture.getMediaStreamId
  → offscreen (AudioContext + AnalyserNode)
  → background → content script on allowlisted receiver tabs
  → window.postMessage(audio-frame)

Page visualizer-toggle
  → content script → background EQ_TOGGLE
  → start/stop analysis
```

UI: `src/ui/TabAudioPanel.tsx` (popup only). No side panel.

## Permissions

- `tabs` — focused tab title / url in the popup
- `tabCapture` — capture chosen tab audio
- `offscreen` — keep Analyser alive after the popup closes
- host access — inject receiver bridge on allowlisted origins only

## Build

```bash
npm run build
```

Load `dist/` (or the zip under `release/`).

## Source

- Extension: [StoneZol/monitron-plugin](https://github.com/StoneZol/monitron-plugin)
- Screens / library: [StoneZol/monitron-web](https://github.com/StoneZol/monitron-web)
- Deploy: [monitron-web-gamma.vercel.app](https://monitron-web-gamma.vercel.app/)

## License

[MIT](./LICENSE) © 2026 StoneZol
