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
  const busRef = useRef({
    lastUi: 0,
    frames: 0,
    windowStart: performance.now(),
    receivedAt: 0,
  })

  useEffect(() => {
    const onMessage = (message: BgMessage) => {
      if (message.type !== 'BUS_TAP' && message.type !== 'AUDIO_FRAME') return
      const frame: AudioFrame = message.frame
      const now = performance.now()
      const state = busRef.current
      state.frames += 1
      state.receivedAt = now

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
      setBusAgeMs(0)
    }

    chrome.runtime.onMessage.addListener(onMessage)
    const ageTimer = window.setInterval(() => {
      const { receivedAt } = busRef.current
      if (!receivedAt) {
        setBusAgeMs(null)
        return
      }
      setBusAgeMs(performance.now() - receivedAt)
    }, 200)

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      window.clearInterval(ageTimer)
    }
  }, [])

  return {
    bus,
    busAgeMs,
    busLive: busAgeMs != null && busAgeMs < 500,
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
            ? `${busLive ? 'live' : 'stale'} · ${bus.fps.toFixed(0)} fps · age ${busAgeMs != null ? `${Math.round(busAgeMs)}ms` : '—'}`
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

/** Collapsible live tap — for popup. */
export function DebugMenu() {
  const [open, setOpen] = useState(false)
  const snap = useAudioBus()

  return (
    <section className="border border-dashed border-warn/50 bg-warn/5 p-2">
      <button
        type="button"
        className="btn-stamp btn-stamp-warn"
        onClick={() => setOpen((v) => !v)}
      >
        bus {open ? '▼' : '▶'}
      </button>
      {open && <div className="mt-2"><BusMeters {...snap} /></div>}
    </section>
  )
}

/** Always-on bus panel — for side dock (guides later). */
export function BusDock() {
  const snap = useAudioBus()

  return (
    <div className="atmosphere relative flex min-h-screen flex-col p-3.5 pb-4">
      <div className="relative z-10 flex flex-col gap-3">
        <header>
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.28em] text-signal/80">
            signal capture
          </p>
          <h1 className="mt-1 mb-0 font-display text-xl font-bold uppercase tracking-[-0.04em] text-ink">
            Monitron
          </h1>
          <p className="mt-1 mb-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            dock // bus
          </p>
        </header>

        <p className="m-0 text-[12px] leading-snug text-muted">
          Connect from the toolbar popup. Guides land here later.
        </p>

        <BusMeters {...snap} />
      </div>
    </div>
  )
}
