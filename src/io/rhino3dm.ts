// Lazy loading of rhino3dm.js (WebAssembly). Port of Plaza-Practiko `importar/rhino3dm.ts`.
// - In the browser it is imported from jsDelivr the first time it is needed: the build does not carry the wasm.
// - In Node (tests, scripts) the npm package is used.
// The specifiers live in variables with @vite-ignore so Vite does not bundle them.
const VERSION = '8.35.0'
const CDN_URL = `https://cdn.jsdelivr.net/npm/rhino3dm@${VERSION}/rhino3dm.module.min.js`

/* eslint-disable @typescript-eslint/no-explicit-any */
// rhino3dm has no useful types for this use: it is handled as any, as in Practiko.
let cache: Promise<any> | null = null

const isNode = (): boolean => !!(globalThis as any).process?.versions?.node

export function loadRhino3dm(): Promise<any> {
  if (!cache) {
    cache = (async () => {
      const specifier = isNode() ? 'rhino3dm' : CDN_URL
      const mod = await import(/* @vite-ignore */ specifier)
      const init = mod.default ?? mod
      return await init()
    })().catch((e) => {
      cache = null // a failed download can be retried
      throw new Error(`could not load the .3dm writer; check the internet connection and try again (${e instanceof Error ? e.message : String(e)}).`)
    })
  }
  return cache
}
