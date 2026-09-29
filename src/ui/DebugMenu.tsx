import { useEffect, useRef, useState } from 'react'
import type { BgMessage } from '@/shared/messages'
import type { AudioFrame } from '@/shared/protocol'
import { cn } from '@/lib/utils'

type BusSnap = {
  bass: number
  mid: number
  high: number
  beat: number
  t: number
  fps: number
}

const BANDS: {
  key: keyof Pick<BusSnap, 'bass' | 'mid' | 'high' | 'beat'>
  color: string
}[] = [
  { key: 'bass', color: 'bg-signal' },
  { key: 'mid', color: 'bg-cyan' },
  { key: 'high', color: 'bg-magenta' },
  { key: 'beat', color: 'bg-warn' },
]

function fmt01(n: number) {
  return Math.min(1, Math.max(0, n)).toFixed(2)
}

/** Age for bus header: seconds until 1h, then h + m. */
function formatAge(ms: number): string {
  const sec = ms / 1000
  if (sec < 10) return `${sec.toFixed(1)}s`
  if (sec < 3600) return `${Math.round(sec)}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function BandMeter({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="grid grid-cols-[36px_1fr_36px] items-center gap-1.5">
      <span className="uppercase text-muted">{label}</span>
      <div className="h-2 overflow-hidden border border-line bg-screen">
        <div
          className={cn('h-full transition-[width] duration-75', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-ink">{fmt01(value)}</span>
    </div>
  )
}

function useAudioBus() {
  const [bus, setBus] = useState<BusSnap | null>(null)
  const [busAgeMs, setBusAgeMs] = useState<number | null>(null)
  const [lastFrameAgeMs, setLastFrameAgeMs] = useState<number | null>(null)
  const busRef = useRef({
    lastUi: 0,
    frames: 0,
    windowStart: performance.now(),
    receivedAt: 0,
    sessionStart: 0,
  })

  useEffect(() => {
    const reset = () => {
      busRef.current = {
        lastUi: 0,
        frames: 0,
        windowStart: performance.now(),
        receivedAt: 0,
        sessionStart: 0,
      }
      setBus({
        bass: 0,
        mid: 0,
        high: 0,
        beat: 0,
        t: 0,
        fps: 0,
      })
      setBusAgeMs(null)
      setLastFrameAgeMs(null)
    }

    const onMessage = (message: BgMessage) => {
      if (message.type === 'BUS_RESET') {
        reset()
        return
      }
      if (message.type === 'STATUS' && !message.status.hasStream) {
        reset()
        return
      }
      if (message.type !== 'BUS_TAP' && message.type !== 'AUDIO_FRAME') return
      const frame: AudioFrame = message.frame
      const now = performance.now()
      const state = busRef.current
      state.frames += 1
      state.receivedAt = now
      if (!state.sessionStart) state.sessionStart = now

      if (now - state.lastUi < 80) return
      state.lastUi = now

      const elapsed = (now - state.windowStart) / 1000
      const fps = elapsed > 0 ? state.frames / elapsed : 0
      if (elapsed >= 1) {
        state.frames = 0
        state.windowStart = now
      }

      setBus({
        bass: frame.bass,
        mid: frame.mid,
        high: frame.high,
        beat: frame.beat,
        t: frame.t,
        fps,
      })
      setBusAgeMs(now - state.sessionStart)
      setLastFrameAgeMs(0)
    }

    chrome.runtime.onMessage.addListener(onMessage)
    const ageTimer = window.setInterval(() => {
      const { sessionStart, receivedAt } = busRef.current
      if (!sessionStart) {
        setBusAgeMs(null)
        setLastFrameAgeMs(null)
        return
      }
      const now = performance.now()
      setBusAgeMs(now - sessionStart)
      setLastFrameAgeMs(receivedAt ? now - receivedAt : null)
    }, 200)

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      window.clearInterval(ageTimer)
    }
  }, [])

  return {
    bus,
    busAgeMs,
    busLive: lastFrameAgeMs != null && lastFrameAgeMs < 500,
  }
}

function BusMeters({
  bus,
  busAgeMs,
  busLive,
}: {
  bus: BusSnap | null
  busAgeMs: number | null
  busLive: boolean
}) {
  return (
    <div className="border border-line bg-screen/60 p-2 font-mono text-[10px] tracking-[0.04em]">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="uppercase tracking-[0.18em] text-signal">
          ::audio-bus
        </span>
        <span
          className={cn('tabular-nums', busLive ? 'text-signal' : 'text-muted')}
        >
          {bus
            ? `${busLive ? 'live' : 'stale'} · ${bus.fps.toFixed(0)} fps · age ${busAgeMs != null ? formatAge(busAgeMs) : '—'}`
            : 'no frames yet'}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {BANDS.map(({ key, color }) => (
          <BandMeter
            key={key}
            label={key}
            value={bus?.[key] ?? 0}
            color={color}
          />
        ))}
      </div>
      <div className="mt-1.5 truncate text-[9px] text-muted">
        t={bus ? bus.t.toFixed(1) : '—'}
      </div>
    </div>
  )
}

const SOURCE_LINKS = [
  {
    label: 'monitron-plugin',
    href: 'https://github.com/StoneZol/monitron-plugin',
    hint: 'this extension',
  },
  {
    label: 'monitron-web',
    href: 'https://github.com/StoneZol/monitron-web',
    hint: 'screens / library',
  },
] as const

type PanelId = 'bus' | 'src' | null

/** Bus meters + source links — one shared frame, toggles on one row. */
export function DebugMenu() {
  const [open, setOpen] = useState<PanelId>(null)
  const snap = useAudioBus()

  function toggle(id: Exclude<PanelId, null>) {
    setOpen((prev) => (prev === id ? null : id))
  }

  return (
    <section className="border border-dashed border-line bg-screen/40 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn-stamp btn-stamp-ghost"
          onClick={() => toggle('bus')}
        >
          bus {open === 'bus' ? '▼' : '▶'}
        </button>
        <button
          type="button"
          className="btn-stamp btn-stamp-ghost"
          onClick={() => toggle('src')}
        >
          src {open === 'src' ? '▼' : '▶'}
        </button>
      </div>

      {open === 'bus' && (
        <div className="mt-2">
          <BusMeters {...snap} />
        </div>
      )}

      {open === 'src' && (
        <div className="mt-2 flex flex-col gap-1.5 font-mono text-[10px] tracking-[0.06em]">
          {SOURCE_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-baseline justify-between gap-2 border border-line bg-screen/60 px-2 py-1.5 text-ink no-underline transition-colors hover:border-signal hover:text-signal"
            >
              <span className="text-signal">{link.label}</span>
              <span className="truncate text-muted">{link.hint} →</span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
