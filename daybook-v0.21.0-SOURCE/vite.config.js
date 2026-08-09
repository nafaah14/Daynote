import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * A compact, sortable build id: YYYYMMDD-HHMM in UTC.
 *
 * The semantic version says what the code IS; the build id says which
 * compile you're looking at. You need both — two builds of v0.9.0 can differ
 * if one was made before a fix, and that ambiguity is exactly what makes
 * "is this fix live?" unanswerable.
 */
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const buildId =
  `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
  `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(now.toISOString()),
  },
})
