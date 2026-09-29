import { useCallback, useEffect, useState } from 'react'
import {
  type ExtensionStatus,
  type TabInfo,
  MONITORN_APP_URL,
  isMonitronTabUrl,
} from '@/shared/messages'
import { cn } from '@/lib/utils'
import { captureTabStreamId } from '@/ui/captureTab'
import { DebugMenu } from '@/ui/DebugMenu'

const EMPTY_STATUS: ExtensionStatus = {
  hasStream: false,
  analysing: false,
  eqEnabled: false,
  captureTabId: null,
  captureLabel: null,
  error: null,
}

function shortUrl(url: string) {
  try {
    const u = new URL(url)
    return u.host + u.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function isCapturable(url: string) {
  return (
    (url.startsWith('http://') || url.startsWith('https://')) &&
    !isMonitronTabUrl(url)
  )
}

function tabFromChrome(tab: chrome.tabs.Tab): TabInfo | null {
  if (typeof tab.id !== 'number') return null
  const url = tab.url || tab.pendingUrl || ''
  return {
    id: tab.id,
    title: tab.title || url || `Tab ${tab.id}`,
    url,
    favIconUrl: tab.favIconUrl,
    audible: Boolean(tab.audible),
    active: Boolean(tab.active),
  }
}

export function TabAudioPanel() {
  const [status, setStatus] = useState<ExtensionStatus>(EMPTY_STATUS)
  const [focused, setFocused] = useState<TabInfo | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshStatus = useCallback(async () => {
    const next = (await chrome.runtime.sendMessage({
      type: 'GET_STATUS',
    })) as ExtensionStatus
    setStatus(next ?? EMPTY_STATUS)
  }, [])

  const refreshFocused = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      setFocused(tab ? tabFromChrome(tab) : null)
    } catch {
      setFocused(null)
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshFocused()])
  }, [refreshStatus, refreshFocused])

  useEffect(() => {
    void refresh()

    const onMessage = (message: { type?: string; status?: ExtensionStatus }) => {
      if (message.type === 'STATUS' && message.status) {
        setStatus(message.status)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)

    const onActivated = () => void refreshFocused()
    const onUpdated = (
      _tabId: number,
      changeInfo: {
        title?: string
        url?: string
        favIconUrl?: string
        audible?: boolean
        status?: string
      },
      tab: chrome.tabs.Tab,
    ) => {
      if (!tab.active) return
      if (
        changeInfo.title == null &&
        changeInfo.url == null &&
        changeInfo.favIconUrl == null &&
        changeInfo.audible == null &&
        changeInfo.status !== 'complete'
      ) {
        return
      }
      void refreshFocused()
    }

    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)

    const poll = window.setInterval(() => void refreshFocused(), 1500)

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      window.clearInterval(poll)
    }
  }, [refresh, refreshFocused])

  async function connect(tab: TabInfo) {
    if (!isCapturable(tab.url)) return
    setLoading(true)
    setStatus((prev) => ({ ...prev, error: null }))
    try {
      const streamId = await captureTabStreamId(tab.id)
      const result = (await chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
        streamId,
        tabId: tab.id,
        label: tab.title,
      })) as { ok?: boolean; error?: string } | undefined

      if (!result?.ok) {
        throw new Error(result?.error ?? 'START_CAPTURE failed')
      }

      const next = (await chrome.runtime.sendMessage({
        type: 'GET_STATUS',
      })) as ExtensionStatus
      setStatus(next ?? EMPTY_STATUS)

      if (!next?.hasStream || next.error) {
        throw new Error(next?.error ?? 'Capture did not start')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus((prev) => ({ ...prev, error: message }))
    } finally {
      setLoading(false)
    }
  }

  async function stop() {
    setLoading(true)
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' })
      await refreshStatus()
    } finally {
      setLoading(false)
    }
  }

  const onVizPage = focused != null && isMonitronTabUrl(focused.url)
  const connectedHere =
    status.hasStream && focused != null && status.captureTabId === focused.id
  const canConnect =
    focused != null && isCapturable(focused.url) && !connectedHere

  return (
    <div className="atmosphere relative flex flex-col gap-3 p-3.5 pb-4">
      <div className="relative z-10 flex min-h-0 flex-col gap-3">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 font-mono text-[10px] uppercase tracking-[0.28em] text-signal/80">
              signal capture
            </p>
            <h1 className="mt-1 mb-0 font-display text-xl font-bold uppercase tracking-[-0.04em] text-ink">
              Monitron
            </h1>
            <p className="mt-1 mb-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              tab audio // stream
            </p>
          </div>
          <a
            href={MONITORN_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-stamp btn-stamp-ghost shrink-0 no-underline"
            title={MONITORN_APP_URL}
          >
            feed →
          </a>
        </header>

        <section className="flex flex-wrap items-center gap-1.5 border-b border-dashed border-line pb-2.5">
          <div
            className={cn('stamp-pill', status.hasStream && 'stamp-pill-live')}
          >
            {status.hasStream ? 'listening' : 'idle'}
          </div>
          <div
            className={cn('stamp-pill', status.analysing && 'stamp-pill-viz')}
          >
            {status.analysing
              ? 'bus live'
              : status.eqEnabled
                ? 'viz wait'
                : 'viz off'}
          </div>
          {status.error && (
            <p className="m-0 w-full font-mono text-[10px] text-warn">
              err:// {status.error}
            </p>
          )}
        </section>

        {onVizPage ? (
          <p className="m-0 text-[12px] leading-snug text-muted">
            This tab is the{' '}
            <span className="text-cyan">visualizer</span> — it has no audio.
            Open a music tab, then connect.
          </p>
        ) : (
          <p className="m-0 text-[12px] leading-snug text-muted">
            Focus the tab you want, then{' '}
            <span className="text-cyan">connect</span>.
          </p>
        )}

        {status.hasStream && (onVizPage || !connectedHere) && (
          <section className="border border-signal/40 bg-signal/5 p-3">
            <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-signal">
              ::live source
            </p>
            <p
              className="mt-1.5 mb-0 truncate text-[14px] font-semibold uppercase tracking-tight text-ink"
              title={status.captureLabel ?? undefined}
            >
              {status.captureLabel ?? `tab #${status.captureTabId}`}
            </p>
            <button
              type="button"
              className="btn-stamp btn-stamp-warn mt-3 w-full"
              onClick={() => void stop()}
              disabled={loading}
            >
              <span className="text-magenta">×</span> disconnect
            </button>
          </section>
        )}

        {!onVizPage && (
          <section
            className={cn(
              'border border-line bg-screen/70 p-3',
              connectedHere &&
                'border-signal/50 shadow-[3px_3px_0_var(--magenta)]',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-signal">
                {connectedHere ? '::streaming' : '::focused tab'}
              </p>
              {focused?.audible && (
                <span className="font-mono text-[10px] text-signal">
                  ♪ audible
                </span>
              )}
            </div>

            {focused ? (
              <div className="mt-3 flex items-start gap-3">
                {focused.favIconUrl ? (
                  <img
                    src={focused.favIconUrl}
                    alt=""
                    className="mt-0.5 h-10 w-10 shrink-0 border border-line bg-bg-deep object-contain p-1"
                  />
                ) : (
                  <span className="mt-0.5 inline-block h-10 w-10 shrink-0 border border-line bg-line/40" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 line-clamp-2 text-[15px] font-semibold uppercase leading-snug tracking-tight text-ink">
                    {focused.title}
                  </h2>
                  <p
                    className="mt-1 mb-0 truncate font-mono text-[10px] tracking-[0.06em] text-cyan"
                    title={focused.url}
                  >
                    {shortUrl(focused.url) || hostOf(focused.url) || '—'}
                  </p>
                  {!isCapturable(focused.url) && (
                    <p className="mt-2 mb-0 font-mono text-[10px] text-warn">
                      chrome:// and extension pages can&apos;t be captured
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 mb-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                no focused http(s) tab
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {connectedHere ? (
                <button
                  type="button"
                  className="btn-stamp btn-stamp-warn w-full"
                  onClick={() => void stop()}
                  disabled={loading}
                >
                  <span className="text-magenta">×</span> disconnect
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-stamp w-full !py-2.5 !text-[11px] !tracking-[0.28em]"
                  disabled={loading || !canConnect}
                  onClick={() => focused && void connect(focused)}
                >
                  {loading
                    ? '…'
                    : status.hasStream
                      ? 'switch → connect'
                      : 'connect'}
                </button>
              )}
            </div>
          </section>
        )}

        <DebugMenu />
      </div>
    </div>
  )
}
