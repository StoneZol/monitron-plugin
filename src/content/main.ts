import {
  isHelloRequest,
  isVisualizerToggle,
  makeHello,
} from '@/shared/protocol'
import type { ContentMessage } from '@/shared/messages'

function postToPage(data: object) {
  window.postMessage(data, '*')
}

/** False after extension reload/update — orphaned content scripts must stop talking. */
function runtimeAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

function announce() {
  if (!runtimeAlive()) {
    stopKeepAlive()
    return
  }
  postToPage(makeHello())
}

announce()

// Announce until the page proves it can talk (hello-request). Then stop spam.
let keepAlive: number | null = window.setInterval(announce, 2500)

function stopKeepAlive() {
  if (keepAlive != null) {
    window.clearInterval(keepAlive)
    keepAlive = null
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return

  if (isHelloRequest(event.data)) {
    announce()
    if (runtimeAlive()) stopKeepAlive()
    return
  }

  if (!isVisualizerToggle(event.data)) return

  if (!runtimeAlive()) {
    stopKeepAlive()
    return
  }

  try {
    chrome.runtime
      .sendMessage({ type: 'EQ_TOGGLE', enabled: event.data.enabled })
      .catch((err) => {
        if (
          err instanceof Error &&
          /context invalidated/i.test(err.message)
        ) {
          stopKeepAlive()
        }
      })
  } catch {
    stopKeepAlive()
  }
})

try {
  chrome.runtime.onMessage.addListener((message: ContentMessage) => {
    if (!runtimeAlive()) return
    if (message.type === 'AUDIO_FRAME') {
      postToPage(message.frame)
    }
    if (message.type === 'PING') {
      announce()
    }
  })
} catch {
  // extension context already dead
}

window.addEventListener('beforeunload', () => {
  stopKeepAlive()
})
