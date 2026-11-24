// vitest/config re-exports Vite's defineConfig with the `test` key typed,
// so one file configures both the dev server and the test runner.
import { defineConfig, type Plugin } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { sharedKeys } from './server/sharedKeys.ts'
import { usageBook } from './server/usage.ts'
import { buildOf } from './server/versions.ts'

/** Dev only: /state-graph serves state-graph.html (the state graph page). The build never includes it: it only
 *  builds index.html, Vite's default input. */
const stateGraphRoute: Plugin = {
  name: 'gfit-state-graph-route',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/state-graph' || req.url === '/state-graph/') req.url = '/state-graph.html'
      next()
    })
  },
}

/** /api/anthropic, /api/openai, /api/google: the shared keys of the computer that serves GFit, in dev and preview
 *  (server/sharedKeys.ts). Read with loadEnv's empty prefix: never VITE_ variables, so the build never puts them in the page.
 *  /api/usage: the tokens everyone has used through them, kept in .gfit-usage/ (server/usage.ts). */
const sharedKey = (env: Record<string, string>): Plugin => {
  const book = usageBook()
  return {
    name: 'gfit-shared-keys',
    configureServer: (server) => void server.middlewares.use(book.route).use(sharedKeys(env, { book })),
    configurePreviewServer: (server) => void server.middlewares.use(book.route).use(sharedKeys(env, { book })),
  }
}

export default defineConfig(({ mode }) => ({
  // the version, the commit built and every version before it, for Home and its About (server/versions.ts)
  define: { __GFIT_BUILD__: JSON.stringify(buildOf()) },
  // the public link's build (.github/workflows/pages.yml) sets GFIT_BASE=./, so it works under any path; dev and preview: /
  base: process.env.GFIT_BASE ?? '/',
  plugins: [react(), stateGraphRoute, sharedKey(loadEnv(mode, process.cwd(), ''))],
  // the DWG reader's WebAssembly (io/site/dwg.ts), imported with ?url: its package exports no path to it
  resolve: {
    alias: [{ find: /^libredwg-wasm(?=\?|$)/, replacement: fileURLToPath(new URL('./node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm', import.meta.url)) }],
    // OneDrive can turn the repo's folders into reparse points; resolving through their real path then fails for
    // every bare import. Nothing here is symlinked (npm), so keeping the paths as written is safe.
    preserveSymlinks: true,
  },
  // mixed-use-mvp: puerto fijo 5180 (no se cambia solo si está ocupado)
  server: { port: 5180, strictPort: true },
  test: {
    environment: 'jsdom', // fake browser DOM so React components can render in tests
    setupFiles: ['./vitest.setup.ts'],
  },
}))
