import type { BgMessage } from '@/shared/messages'
import { makeFrame } from '@/shared/protocol'

const FRAME_INTERVAL_MS = 1000 / 45

type AnalyserState = {
  stream: MediaStream
  ctx: AudioContext
  analyser: AnalyserNode
  freq: Uint8Array<ArrayBuffer>
  time: Uint8Array<ArrayBuffer>
  label: string
  tabId: number
}

let capture: AnalyserState | null = null
let analysing = false
let intervalId = 0
let prevKick = 0
let prevBeat = 0
/** Rolling bass floor so sustained techno subs don't peg at 1.0 */
let bassFloor = 0.25

function clip01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function hzToBin(hz: number, sampleRate: number, binCount: number) {
  return Math.round((hz / sampleRate) * binCount)
}

/** Mean energy 0..1 — no artificial gain (that was clipping bass on loud tracks). */
function bandMean(data: Uint8Array<ArrayBuffer>, from: number, to: number) {
  const start = Math.max(0, Math.min(data.length - 1, from))
  const end = Math.max(start + 1, Math.min(data.length, to))
  let sum = 0
  for (let i = start; i < end; i++) sum += data[i]!
  return sum / (end - start) / 255
}

function computeBands(state: AnalyserState) {
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
  td = Math.sqrt(td / state.time.length)

  // Wide body for color drive; kick slice for onset / tempo
  let bassRaw = bandMean(
    state.freq,
    hzToBin(30, sampleRate, bins),
    hzToBin(180, sampleRate, bins),
  )
  const kick = bandMean(
    state.freq,
    hzToBin(50, sampleRate, bins),
    hzToBin(120, sampleRate, bins),
  )
  let mid = bandMean(
    state.freq,
    hzToBin(200, sampleRate, bins),
    hzToBin(2000, sampleRate, bins),
  )
  let high = bandMean(
    state.freq,
    hzToBin(2000, sampleRate, bins),
    hzToBin(10000, sampleRate, bins),
  )

  if (bassRaw + mid + high < 0.015 && td > 0.01) {
    const lift = clip01(td * 3)
    bassRaw = lift
    mid = clip01(lift * 0.7)
    high = clip01(lift * 0.45)
  }

  // Adaptive floor: sustained loud bass becomes the baseline, punch = above it
  bassFloor = bassFloor * 0.98 + bassRaw * 0.02
  const headroom = Math.max(0.12, 1 - bassFloor)
  const bass = clip01((bassRaw - bassFloor * 0.85) / headroom)

  // Kick onset — hard attack, medium decay so Matrix can ride the punch
  const kickRise = Math.max(0, kick - prevKick)
  const transient = Math.max(0, tdPeak - td * 1.4)
  const onset = kickRise * 18 + transient * 2.8
  const beat = clip01(Math.max(onset, prevBeat * 0.84))
  prevKick = kick
  prevBeat = beat

  return {
    bass,
    mid: clip01(mid * 1.15),
    high: clip01(high * 1.25),
    beat,
  }
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

  if (capture.ctx.state === 'suspended') {
    void capture.ctx.resume()
  }

  const bands = computeBands(capture)
  chrome.runtime
    .sendMessage({
      type: 'AUDIO_FRAME',
      frame: makeFrame({ t: performance.now(), ...bands }),
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

async function teardownCapture() {
  stopLoop()
  if (!capture) return
  capture.stream.getTracks().forEach((t) => t.stop())
  await capture.ctx.close().catch(() => {})
  capture = null
  prevKick = 0
  prevBeat = 0
  bassFloor = 0.25
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
    // Less smoothing → kicks read as onsets instead of a flat wall
    analyser.smoothingTimeConstant = 0.35
    analyser.minDecibels = -85
    analyser.maxDecibels = -25

    // tabCapture mutes the source tab unless we play the stream out.
    source.connect(analyser)
    analyser.connect(ctx.destination)

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
    }

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
      if (capture) startLoop()
      break
    default:
      break
  }
})

chrome.runtime
  .sendMessage({ type: 'OFFSCREEN_READY' } satisfies BgMessage)
  .catch(() => {})
