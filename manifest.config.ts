import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'Monitron',
  description:
    'Capture a browser tab’s audio and stream EQ bands to Monitron visualizations.',
  version: pkg.version,
  icons: {
    48: 'public/logo.png',
  },
  action: {
    default_icon: {
      48: 'public/logo.png',
    },
    default_popup: 'src/popup/index.html',
    default_title: 'Monitron',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['tabs', 'tabCapture', 'offscreen', 'sidePanel'],
  host_permissions: ['http://localhost:3000/*', 'http://127.0.0.1:3000/*'],
  content_scripts: [
    {
      js: ['src/content/main.ts'],
      matches: ['http://localhost:3000/*', 'http://127.0.0.1:3000/*'],
      run_at: 'document_idle',
    },
  ],
})
