import type { BgMessage } from '@/shared/messages'
import {
  AUDIO_BAND_COUNT,
  AUDIO_BAND_FMAX,
  AUDIO_BAND_FMIN,
  bandHzRange,
  makeFrame,
} from '@/shared/protocol'

const FRAME_INTERVAL_MS = 1000 / 45

type AnalyserState = {
  stream: MediaStream
  ctx: AudioContext
  analyser: AnalyserNode
  freq: Uint8Array<ArrayBuffer>
  time: Uint8Array<ArrayBuffer>
  label: string
  tabId: number
  keepAliveId: number
}

let capture: AnalyserState | null = null
let analysing = false
let intervalId = 0
/** performance.now() when current capture started — frame.t is elapsed from here. */
let captureT0 = 0

function clip01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function hzToBin(hz: number, sampleRate: number, binCount: number) {
  return Math.round((hz / sampleRate) * binCount)
}

/** Mean energy 0..1 across FFT bins [from, to). */
function bandMean(data: Uint8Array<ArrayBuffer>, from: number, to: number) {
  const start = Math.max(0, Math.min(data.length - 1, from))
  const end = Math.max(start + 1, Math.min(data.length, to))
  let sum = 0
  for (let i = start; i < end; i++) sum += data[i]!
  return sum / (end - start) / 255
}

/**
 * Pack FFT into fixed log-spaced bands. No musical naming / onset here —
 * the page derives bass/mid/high/beat from this.
 */
function packSpectrum(state: AnalyserState) {
  state.analyser.getByteFrequencyData(state.freq)
  state.analyser.getByteTimeDomainData(state.time)
  const { sampleRate } = state.ctx
  const bins = state.freq.length

  let td = 0
  let tdPeak = 0
  for (let i = 0; i < state.time.length; i++) {
    const v = Math.abs((state.time[i]! - 128) / 128)
    td += v * v
    if (v > tdPeak) tdPeak = v
  }
  const rms = clip01(Math.sqrt(td / state.time.length))
  const peak = clip01(tdPeak)

  const bands = new Array<number>(AUDIO_BAND_COUNT)
  for (let i = 0; i < AUDIO_BAND_COUNT; i++) {
    const { lo, hi } = bandHzRange(i, AUDIO_BAND_COUNT, AUDIO_BAND_FMIN, AUDIO_BAND_FMAX)
    const from = hzToBin(lo, sampleRate, bins)
    const to = hzToBin(hi, sampleRate, bins)
    bands[i] = bandMean(state.freq, from, Math.max(from + 1, to))
  }

  return { bands, rms, peak, sampleRate }
}

function stopLoop() {
  analysing = false
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = 0
  }
}

function tick() {
  if (!analysing || !capture) return

  const spectrum = packSpectrum(capture)
  const t = performance.now() - captureT0
  chrome.runtime
    .sendMessage({
      type: 'AUDIO_FRAME',
      frame: makeFrame({ t, ...spectrum }),
    } satisfies BgMessage)
    .catch(() => {})
}

function startLoop() {
  if (!capture || analysing) return
  analysing = true
  // Offscreen docs often don't drive rAF — use a timer instead.
  intervalId = window.setInterval(tick, FRAME_INTERVAL_MS)
  tick()
}

function ensureCtxRunning(ctx: AudioContext) {
  if (ctx.state === 'suspended') void ctx.resume()
}

async function teardownCapture() {
  stopLoop()
  if (!capture) return
  window.clearInterval(capture.keepAliveId)
  capture.stream.getTracks().forEach((t) => t.stop())
  await capture.ctx.close().catch(() => {})
  capture = null
  captureT0 = 0
  chrome.runtime
    .sendMessage({ type: 'OFFSCREEN_CAPTURE_STOPPED' } satisfies BgMessage)
    .catch(() => {})
}

async function startTabCapture(streamId: string, tabId: number, label: string) {
  if (capture) await teardownCapture()

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    } as unknown as MediaStreamConstraints)

    stream.getVideoTracks().forEach((t) => t.stop())
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('Tab stream has no audio track')
    }
    audioTracks.forEach((t) => {
      t.enabled = true
    })

    const audioStream = new MediaStream(audioTracks)
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const source = ctx.createMediaStreamSource(audioStream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.35
    analyser.minDecibels = -85
    analyser.maxDecibels = -25

    // tabCapture mutes the source tab unless we play the stream out (full level).
    source.connect(analyser)
    analyser.connect(ctx.destination)

    ctx.onstatechange = () => ensureCtxRunning(ctx)
    const keepAliveId = window.setInterval(() => ensureCtxRunning(ctx), 500)

    audioTracks.forEach((track) => {
      track.addEventListener('ended', () => {
        void teardownCapture()
      })
    })

    capture = {
      stream: audioStream,
      ctx,
      analyser,
      freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      time: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      label,
      tabId,
      keepAliveId,
    }
    captureT0 = performance.now()

    chrome.runtime
      .sendMessage({
        type: 'OFFSCREEN_CAPTURE_STARTED',
        label,
        tabId,
      } satisfies BgMessage)
      .catch(() => {})

    startLoop()
  } catch (err) {
    const error =
      err instanceof Error ? err.message : 'Failed to open tab audio stream'
    chrome.runtime
      .sendMessage({ type: 'OFFSCREEN_ERROR', error } satisfies BgMessage)
      .catch(() => {})
  }
}

chrome.runtime.onMessage.addListener((message: BgMessage) => {
  switch (message.type) {
    case 'OFFSCREEN_START_CAPTURE':
      void startTabCapture(message.streamId, message.tabId, message.label)
      break
    case 'OFFSCREEN_STOP_CAPTURE':
      void teardownCapture()
      break
    case 'OFFSCREEN_SET_ANALYSING':
      if (!capture) break
      if (message.enabled) startLoop()
      else stopLoop()
      break
    default:
      break
  }
})

chrome.runtime
  .sendMessage({ type: 'OFFSCREEN_READY' } satisfies BgMessage)
  .catch(() => {})
