import type { BgMessage, ExtensionStatus } from '@/shared/messages'
import { MONITORN_TAB_URLS } from '@/shared/messages'
import type { AudioFrame } from '@/shared/protocol'

const status: ExtensionStatus = {
  hasStream: false,
  analysing: false,
  eqEnabled: false,
  captureTabId: null,
  captureLabel: null,
  error: null,
}

let creatingOffscreen: Promise<void> | null = null
let offscreenReady: Promise<void> | null = null
let resolveOffscreenReady: (() => void) | null = null

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  })
  return contexts.length > 0
}

function waitForOffscreenReady() {
  if (!offscreenReady) {
    offscreenReady = new Promise<void>((resolve) => {
      resolveOffscreenReady = resolve
    })
  }
  return offscreenReady
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreenDocument()) return
  if (creatingOffscreen) {
    await creatingOffscreen
    await waitForOffscreenReady()
    return
  }

  offscreenReady = null
  resolveOffscreenReady = null
  const ready = waitForOffscreenReady()

  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: 'src/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification:
        'Hold tabCapture MediaStream + AnalyserNode in the background for Monitron.',
    })
    .finally(() => {
      creatingOffscreen = null
    })

  await creatingOffscreen
  await Promise.race([
    ready,
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ])
}

function broadcastStatus() {
  chrome.runtime
    .sendMessage({ type: 'STATUS', status } satisfies BgMessage)
    .catch(() => {})
}

function broadcastBusReset() {
  chrome.runtime
    .sendMessage({ type: 'BUS_RESET' } satisfies BgMessage)
    .catch(() => {})
}

/** Keep header `src://` in sync when YouTube (etc.) renames the tab. */
async function syncCaptureLabel() {
  const tabId = status.captureTabId
  if (tabId == null || !status.hasStream) return
  try {
    const tab = await chrome.tabs.get(tabId)
    const next = tab.title?.trim() || tab.url || `Tab ${tabId}`
    if (next === status.captureLabel) return
    status.captureLabel = next
    broadcastStatus()
  } catch {
    /* tab gone — stopCapture handles teardown elsewhere */
  }
}

let labelPollTimer: ReturnType<typeof setInterval> | null = null

function startLabelPoll() {
  stopLabelPoll()
  void syncCaptureLabel()
  labelPollTimer = setInterval(() => void syncCaptureLabel(), 2000)
}

function stopLabelPoll() {
  if (labelPollTimer == null) return
  clearInterval(labelPollTimer)
  labelPollTimer = null
}

async function forwardFrameToMonitron(frame: AudioFrame) {
  const tabs = await chrome.tabs.query({ url: [...MONITORN_TAB_URLS] })
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'AUDIO_FRAME',
          frame,
        })
      } catch {
        /* ignore */
      }
    }),
  )
}

async function startCapture(
  streamId: string,
  tabId: number,
  label: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  status.error = null
  broadcastStatus()
  try {
    await ensureOffscreen()
    await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_START_CAPTURE',
      streamId,
      tabId,
      label,
    } satisfies BgMessage)
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    status.error = error
    status.hasStream = false
    status.analysing = false
    status.captureTabId = null
    status.captureLabel = null
    stopLabelPoll()
    broadcastStatus()
    return { ok: false, error }
  }
}

async function stopCapture() {
  status.error = null
  try {
    if (await hasOffscreenDocument()) {
      await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_STOP_CAPTURE',
      } satisfies BgMessage)
    }
  } catch {
    /* ignore */
  }
  status.hasStream = false
  status.analysing = false
  status.captureTabId = null
  status.captureLabel = null
  stopLabelPoll()
  broadcastStatus()
  broadcastBusReset()
}

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATUS':
      sendResponse(status)
      return false

    case 'START_CAPTURE':
      void startCapture(message.streamId, message.tabId, message.label).then(
        (result) => sendResponse(result),
      )
      return true

    case 'STOP_CAPTURE':
      void stopCapture().then(() => sendResponse({ ok: true }))
      return true

    case 'EQ_TOGGLE':
      status.eqEnabled = message.enabled
      broadcastStatus()
      sendResponse({ ok: true })
      return false

    case 'OFFSCREEN_READY':
      resolveOffscreenReady?.()
      resolveOffscreenReady = null
      return false

    case 'OFFSCREEN_CAPTURE_STARTED':
      status.hasStream = true
      status.analysing = true
      status.captureTabId = message.tabId
      status.captureLabel = message.label
      status.error = null
      startLabelPoll()
      broadcastStatus()
      return false

    case 'OFFSCREEN_CAPTURE_STOPPED':
      status.hasStream = false
      status.analysing = false
      status.captureTabId = null
      status.captureLabel = null
      stopLabelPoll()
      broadcastStatus()
      broadcastBusReset()
      return false

    case 'OFFSCREEN_ERROR':
      status.error = message.error
      status.hasStream = false
      status.analysing = false
      stopLabelPoll()
      broadcastStatus()
      broadcastBusReset()
      return false

    case 'AUDIO_FRAME':
      // Ignore late frames after disconnect.
      if (!status.hasStream) return false
      // Popup bus always sees frames; Monitron pages only when reactive is on.
      if (status.eqEnabled) {
        void forwardFrameToMonitron(message.frame)
      }
      chrome.runtime
        .sendMessage({ type: 'BUS_TAP', frame: message.frame } satisfies BgMessage)
        .catch(() => {})
      return false

    default:
      return false
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId !== status.captureTabId) return
  if (changeInfo.title == null && changeInfo.status !== 'complete') return
  void syncCaptureLabel()
})

chrome.runtime.onInstalled.addListener(() => {
  console.info('[monitron] extension installed')
})
