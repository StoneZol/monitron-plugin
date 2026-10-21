/**
 * Single source of truth for Monitron receiver origins.
 * Used by: manifest host_permissions / content_scripts, tabs.query, popup feed link.
 *
 * Edit here only — do not duplicate URLs elsewhere.
 */
export const MONITORN_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://monitron-web-gamma.vercel.app',
  'https://communityplaylist.com',
] as const

export type MonitronOrigin = (typeof MONITORN_ORIGINS)[number]

/** Local host — capture + switch allowed (player / extension dev). */
export const MONITORN_LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const satisfies readonly MonitronOrigin[]

/**
 * Our deployed feed — receives plugin bus, but must not be captured
 * (Monitron plays its own audio). Popup hides connect entirely.
 */
export const MONITORN_FEED_ORIGINS = [
  'https://monitron-web-gamma.vercel.app',
] as const satisfies readonly MonitronOrigin[]

/**
 * Partner sites that both listen to the bus and may be captured
 * (integration sandbox).
 */
export const MONITORN_PARTNER_ORIGINS = [
  'https://communityplaylist.com',
] as const satisfies readonly MonitronOrigin[]

/** Chrome match patterns (`origin/*`) for host_permissions + content_scripts. */
export const MONITORN_MATCH_PATTERNS: `${MonitronOrigin}/*`[] =
  MONITORN_ORIGINS.map((origin) => `${origin}/*` as `${MonitronOrigin}/*`)

/** Alias for chrome.tabs.query({ url }). */
export const MONITORN_TAB_URLS = MONITORN_MATCH_PATTERNS

/** Deployed library / feed (popup “feed →”). Must be one of MONITORN_ORIGINS. */
export const MONITORN_APP_ORIGIN =
  'https://monitron-web-gamma.vercel.app' satisfies MonitronOrigin

export const MONITORN_APP_URL = `${MONITORN_APP_ORIGIN}/`

const ORIGIN_SET = new Set<string>(MONITORN_ORIGINS)
const LOCAL_SET = new Set<string>(MONITORN_LOCAL_ORIGINS)
const FEED_SET = new Set<string>(MONITORN_FEED_ORIGINS)
const PARTNER_SET = new Set<string>(MONITORN_PARTNER_ORIGINS)

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** True for any known receiver origin (content script / frame fan-out). */
export function isMonitronTabUrl(url: string): boolean {
  const origin = originOf(url)
  return origin != null && ORIGIN_SET.has(origin)
}

/** localhost / 127.0.0.1 — OK to capture while building a local player. */
export function isLocalMonitronTabUrl(url: string): boolean {
  const origin = originOf(url)
  return origin != null && LOCAL_SET.has(origin)
}

/** Partner integration tabs (e.g. communityplaylist). */
export function isPartnerMonitronTabUrl(url: string): boolean {
  const origin = originOf(url)
  return origin != null && PARTNER_SET.has(origin)
}

/**
 * Our deployed Monitron feed — capture blocked; popup hides connect/switch.
 */
export function isMonitronFeedTabUrl(url: string): boolean {
  const origin = originOf(url)
  return origin != null && FEED_SET.has(origin)
}

/** @deprecated alias — feed capture block */
export function isMonitronCaptureBlocked(url: string): boolean {
  return isMonitronFeedTabUrl(url)
}
