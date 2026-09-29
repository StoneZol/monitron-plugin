import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'
import { MONITORN_MATCH_PATTERNS } from './src/shared/hosts'

export default defineManifest({
    manifest_version: 3,
    name: 'Monitron',
    description:
        'Capture a browser tab’s audio and stream EQ bands to Monitron visualizations.',
    version: pkg.version,
    icons: {
        128: 'public/MonitronLogo.png',
    },
    action: {
        default_icon: {
            128: 'public/MonitronLogo.png',
        },
        default_popup: 'src/popup/index.html',
        default_title: 'Monitron',
    },
    background: {
        service_worker: 'src/background/index.ts',
        type: 'module',
    },
    permissions: ['tabs', 'tabCapture', 'offscreen'],
    host_permissions: [...MONITORN_MATCH_PATTERNS],
    content_scripts: [
        {
            js: ['src/content/main.ts'],
            matches: [...MONITORN_MATCH_PATTERNS],
            run_at: 'document_idle',
        },
    ],
})
