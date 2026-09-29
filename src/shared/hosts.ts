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
] as const

export type MonitronOrigin = (typeof MONITORN_ORIGINS)[number]

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

/** True for viz / Matrix pages that receive AUDIO_FRAME — never capture these. */
export function isMonitronTabUrl(url: string): boolean {
  try {
    return ORIGIN_SET.has(new URL(url).origin)
  } catch {
    return false
  }
}
