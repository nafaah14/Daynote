import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * public/sw.js is served byte-for-byte from disk, so without this it never
 * changes between deploys — and the browser's update check is a byte diff of
 * that exact file. Stamping the build id in makes every deploy produce a
 * different sw.js, which is what actually triggers the update-available flow
 * in UpdatePrompt (see src/core/pwa/UpdatePrompt.jsx).
 */
function stampServiceWorker(buildId) {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    writeBundle(options) {
      const swPath = resolve(options.dir ?? 'dist', 'sw.js')
      try {
        const src = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, `${src}\n/* build ${buildId} */\n`)
      } catch {
        // no sw.js in this build's output — nothing to stamp
      }
    },
  }
}

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
  plugins: [react(), stampServiceWorker(buildId)],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(now.toISOString()),
  },
})
