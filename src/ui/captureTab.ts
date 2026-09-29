/** Tab focus + tabCapture helpers. */

function getMediaStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const capErr = chrome.runtime.lastError
      if (capErr?.message || !streamId) {
        reject(new Error(capErr?.message ?? 'Failed to get media stream id'))
        return
      }
      resolve(streamId)
    })
  })
}

/**
 * Mint a tabCapture stream id for `tabId`.
 *
 * If the tab is already active in the current window, capture immediately —
 * focusing the window/tab would dismiss the extension popup (Chrome closes it
 * when the page window takes focus).
 *
 * For a different tab (switch → connect), activate first in the same click
 * chain so user-gesture / tabCapture still works (popup may close then).
 */
export function captureTabStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const getErr = chrome.runtime.lastError
      if (getErr?.message || !tab) {
        reject(new Error(getErr?.message ?? 'Tab not found'))
        return
      }

      chrome.tabs.query({ active: true, currentWindow: true }, ([active]) => {
        const qErr = chrome.runtime.lastError
        if (qErr?.message) {
          reject(new Error(qErr.message))
          return
        }

        if (active?.id === tabId) {
          void getMediaStreamId(tabId).then(resolve, reject)
          return
        }

        const activateThenCapture = () => {
          chrome.tabs.update(tabId, { active: true }, () => {
            const updateErr = chrome.runtime.lastError
            if (updateErr?.message) {
              reject(new Error(updateErr.message))
              return
            }
            void getMediaStreamId(tabId).then(resolve, reject)
          })
        }

        if (tab.windowId == null) {
          activateThenCapture()
          return
        }

        chrome.windows.update(tab.windowId, { focused: true }, () => {
          // Ignore focus errors; still try capture.
          activateThenCapture()
        })
      })
    })
  })
}
