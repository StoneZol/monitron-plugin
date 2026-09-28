/** Tab focus + tabCapture helpers. */

/**
 * Focus the tab's window + activate the tab, then mint stream id in the same
 * callback chain as the user click (awaiting focus first drops user activation
 * and Chrome answers with the activeTab / "not invoked" error).
 */
export function captureTabStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const getErr = chrome.runtime.lastError
      if (getErr?.message || !tab) {
        reject(new Error(getErr?.message ?? 'Tab not found'))
        return
      }

      const activateThenCapture = () => {
        chrome.tabs.update(tabId, { active: true }, () => {
          const updateErr = chrome.runtime.lastError
          if (updateErr?.message) {
            reject(new Error(updateErr.message))
            return
          }
          chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
            const capErr = chrome.runtime.lastError
            if (capErr?.message || !streamId) {
              reject(
                new Error(
                  capErr?.message ?? 'Failed to get media stream id',
                ),
              )
              return
            }
            resolve(streamId)
          })
        })
      }

      if (tab.windowId == null) {
        activateThenCapture()
        return
      }

      chrome.windows.update(tab.windowId, { focused: true }, () => {
        // Ignore focus errors (already focused / blocked) and still try capture.
        activateThenCapture()
      })
    })
  })
}
