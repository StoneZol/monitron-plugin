/** Internal extension messaging */

import type { AudioFrame } from './protocol'

export {
  MONITORN_APP_URL,
  MONITORN_MATCH_PATTERNS,
  MONITORN_ORIGINS,
  MONITORN_TAB_URLS,
  isMonitronTabUrl,
} from './hosts'

export type ExtensionStatus = {
  hasStream: boolean
  analysing: boolean
  eqEnabled: boolean
  captureTabId: number | null
  captureLabel: string | null
  error: string | null
}

export type TabInfo = {
  id: number
  title: string
  url: string
  favIconUrl?: string
  audible: boolean
  active: boolean
}

export type BgMessage =
  | { type: 'GET_STATUS' }
  | {
      type: 'START_CAPTURE'
      streamId: string
      tabId: number
      label: string
    }
  | { type: 'STOP_CAPTURE' }
  | { type: 'EQ_TOGGLE'; enabled: boolean }
  | { type: 'STATUS'; status: ExtensionStatus }
  | { type: 'AUDIO_FRAME'; frame: AudioFrame }
  | { type: 'BUS_TAP'; frame: AudioFrame }
  | { type: 'OFFSCREEN_READY' }
  | { type: 'OFFSCREEN_CAPTURE_STARTED'; label: string; tabId: number }
  | { type: 'OFFSCREEN_CAPTURE_STOPPED' }
  | { type: 'OFFSCREEN_ERROR'; error: string }
  | {
      type: 'OFFSCREEN_START_CAPTURE'
      streamId: string
      tabId: number
      label: string
    }
  | { type: 'OFFSCREEN_STOP_CAPTURE' }
  | { type: 'OFFSCREEN_SET_ANALYSING'; enabled: boolean }

export type ContentMessage = { type: 'AUDIO_FRAME'; frame: AudioFrame }
