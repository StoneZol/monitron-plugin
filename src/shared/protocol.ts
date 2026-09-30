/** Page ↔ extension postMessage contract (mirrors monitron-web/lib/audioBus.ts) */

export const AUDIO_BUS_SOURCE = 'monitron-extension' as const
export const AUDIO_PAGE_SOURCE = 'monitron-page' as const

export const AUDIO_FRAME_TYPE = 'audio-frame' as const
export const AUDIO_HELLO_TYPE = 'hello' as const
export const AUDIO_VIZ_TYPE = 'visualizer-toggle' as const
export const AUDIO_HELLO_REQUEST_TYPE = 'hello-request' as const

/** Log-spaced spectrum size — must match monitron-web */
export const AUDIO_BAND_COUNT = 32
export const AUDIO_BAND_FMIN = 20
export const AUDIO_BAND_FMAX = 16000

export type AudioHello = {
  source: typeof AUDIO_BUS_SOURCE
  type: typeof AUDIO_HELLO_TYPE
}

export type AudioHelloRequest = {
  source: typeof AUDIO_PAGE_SOURCE
  type: typeof AUDIO_HELLO_REQUEST_TYPE
}

/** Raw analyser dump — no EQ / beat naming on the plugin side */
export type AudioFrame = {
  source: typeof AUDIO_BUS_SOURCE
  type: typeof AUDIO_FRAME_TYPE
  t: number
  sampleRate: number
  /** length AUDIO_BAND_COUNT, each 0..1 */
  bands: number[]
  rms: number
  peak: number
}

export type AudioVisualizerToggle = {
  source: typeof AUDIO_PAGE_SOURCE
  type: typeof AUDIO_VIZ_TYPE
  enabled: boolean
}

export function bandHzRange(
  index: number,
  count = AUDIO_BAND_COUNT,
  fmin = AUDIO_BAND_FMIN,
  fmax = AUDIO_BAND_FMAX,
): { lo: number; hi: number } {
  const i = Math.max(0, Math.min(count - 1, index))
  const logMin = Math.log(fmin)
  const logMax = Math.log(fmax)
  const lo = Math.exp(logMin + (i / count) * (logMax - logMin))
  const hi = Math.exp(logMin + ((i + 1) / count) * (logMax - logMin))
  return { lo, hi }
}

export function isVisualizerToggle(data: unknown): data is AudioVisualizerToggle {
  if (!data || typeof data !== 'object') return false
  const msg = data as Record<string, unknown>
  return (
    msg.source === AUDIO_PAGE_SOURCE &&
    (msg.type === AUDIO_VIZ_TYPE || msg.type === 'eq-toggle') &&
    typeof msg.enabled === 'boolean'
  )
}

export function isHelloRequest(data: unknown): data is AudioHelloRequest {
  if (!data || typeof data !== 'object') return false
  const msg = data as Record<string, unknown>
  return (
    msg.source === AUDIO_PAGE_SOURCE && msg.type === AUDIO_HELLO_REQUEST_TYPE
  )
}

export function makeHello(): AudioHello {
  return { source: AUDIO_BUS_SOURCE, type: AUDIO_HELLO_TYPE }
}

export function makeFrame(
  payload: Omit<AudioFrame, 'source' | 'type'>,
): AudioFrame {
  return {
    source: AUDIO_BUS_SOURCE,
    type: AUDIO_FRAME_TYPE,
    ...payload,
  }
}
