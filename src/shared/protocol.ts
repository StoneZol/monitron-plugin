/** Page ↔ extension postMessage contract (mirrors monitron-web/lib/audioBus.ts) */

export const AUDIO_BUS_SOURCE = 'monitron-extension' as const
export const AUDIO_PAGE_SOURCE = 'monitron-page' as const

export const AUDIO_FRAME_TYPE = 'audio-frame' as const
export const AUDIO_HELLO_TYPE = 'hello' as const
export const AUDIO_VIZ_TYPE = 'visualizer-toggle' as const
export const AUDIO_HELLO_REQUEST_TYPE = 'hello-request' as const

export type AudioHello = {
  source: typeof AUDIO_BUS_SOURCE
  type: typeof AUDIO_HELLO_TYPE
}

export type AudioHelloRequest = {
  source: typeof AUDIO_PAGE_SOURCE
  type: typeof AUDIO_HELLO_REQUEST_TYPE
}

export type AudioFrame = {
  source: typeof AUDIO_BUS_SOURCE
  type: typeof AUDIO_FRAME_TYPE
  t: number
  bass: number
  mid: number
  high: number
  beat: number
}

export type AudioVisualizerToggle = {
  source: typeof AUDIO_PAGE_SOURCE
  type: typeof AUDIO_VIZ_TYPE
  enabled: boolean
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
  bands: Omit<AudioFrame, 'source' | 'type'>,
): AudioFrame {
  return {
    source: AUDIO_BUS_SOURCE,
    type: AUDIO_FRAME_TYPE,
    ...bands,
  }
}
