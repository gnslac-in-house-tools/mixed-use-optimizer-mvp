// Guards for the plugin seam (Decisions "Optimizer plugin" and "Plugin seam"): the core knows the plugins only through
// plugins/index.ts (and the engine, the model, the state and the files not at all); a plugin reaches the app only
// through plugins/host.ts, the model, the engine and the shared controls, never another plugin; a plugin's engine is
// pure: besides its own files, the core's engine and the model, it may write a project with the pure verbs of
// state/actions/ (one module at a time, untraced: a specimen is a copy, never an edit) and settle it as every edit is
// (state/settle.ts); every plugin folder is in the registry. A plugin reads what the modules bring through the catalog
// (modules/catalog.ts and its types, modules/types.ts) and nothing else of src/modules/ (Decision "Catalog").
import { describe, expect, it } from 'vitest'
import { PLUGINS } from '../registry.ts'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })

/** The code without comments: an import in a comment is not one. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** What a file imports: each specifier resolved to a path under /src (a package stays as it is). */
function importsOf(path: string, text: string): string[] {
  const specs = [...code(text).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)'([^']+)'/g)].map((m) => m[1])
  return specs.map((s) => (s.startsWith('.') ? new URL(s, `file://${path}`).pathname : s))
}

const files = Object.entries(sources).map(([path, text]) => ({ path, imports: importsOf(path, text) }))
const isPlugin = (p: string) => p.startsWith('/src/plugins/')
/** A file inside a plugin's own folder (not the seam's files at plugins/ itself). */
const pluginOf = (p: string) => /^\/src\/plugins\/([^/]+)\//.exec(p)?.[1] ?? null
const pure = ['/src/engine/', '/src/model/', '/src/state/', '/src/io/', '/src/typologies/']

describe('plugin boundaries', () => {
  it('finds the sources it guards', () => {
    expect(files.some((f) => f.path === '/src/plugins/host.ts')).toBe(true)
    expect(files.some((f) => f.path.startsWith('/src/plugins/optimizer/engine/'))).toBe(true)
  })

  it('the core imports only plugins/index.ts; the engine, model, state, files and typologies nothing of plugins', () => {
    const wrong = files
      .filter((f) => !isPlugin(f.path))
      .flatMap((f) =>
        f.imports
          .filter((i) => isPlugin(i) && (i !== '/src/plugins/index.ts' || pure.some((p) => f.path.startsWith(p))))
          .map((i) => `${f.path} → ${i}`),
      )
    expect(wrong).toEqual([])
  })

  /** A pure verb module (not the traced registry), or what every edit goes through. */
  const verbs = (i: string) => (i.startsWith('/src/state/actions/') && i !== '/src/state/actions/index.ts') || i === '/src/state/settle.ts'
  /** The modules' one door: the catalog and its types. */
  const catalog = (i: string) => i === '/src/modules/catalog.ts' || i === '/src/modules/types.ts'

  it('a plugin imports only host, types, the model, the engine, the catalog, the shared controls and itself', () => {
    const allowed = (own: string, from: string, i: string) =>
      !i.startsWith('/') ||
      i.startsWith(`/src/plugins/${own}/`) ||
      ['/src/plugins/host.ts', '/src/plugins/hosting.ts', '/src/plugins/types.ts', '/src/views/format.ts'].includes(i) ||
      catalog(i) ||
      ['/src/model/', '/src/engine/', '/src/views/controls/'].some((p) => i.startsWith(p)) ||
      (from.startsWith(`/src/plugins/${own}/engine/`) && verbs(i))
    const wrong = files.flatMap((f) => {
      const own = pluginOf(f.path)
      return own ? f.imports.filter((i) => !allowed(own, f.path, i)).map((i) => `${f.path} → ${i}`) : []
    })
    expect(wrong).toEqual([])
  })

  it("a plugin's engine is pure: its own engine, the core's engine, the model, the catalog and the pure verbs, no React", () => {
    const wrong = files.flatMap((f) => {
      const own = pluginOf(f.path)
      if (!own || !f.path.startsWith(`/src/plugins/${own}/engine/`)) return []
      const ok = (i: string) =>
        i.startsWith(`/src/plugins/${own}/engine/`) ||
        i.startsWith('/src/engine/') ||
        i.startsWith('/src/model/') ||
        catalog(i) ||
        verbs(i) ||
        (!i.startsWith('/') && !/^(react|zustand)/.test(i))
      return f.imports.filter((i) => !ok(i)).map((i) => `${f.path} → ${i}`)
    })
    expect(wrong).toEqual([])
  })

  it('every plugin folder is in the registry, under its folder name, with tabs of unique ids', () => {
    const folders = [...new Set(files.map((f) => pluginOf(f.path)).filter((p): p is string => p !== null))].sort()
    expect(PLUGINS.map((p) => p.id).sort()).toEqual(folders)
    for (const p of PLUGINS) expect(new Set(p.tabs.map((t) => t.id)).size).toBe(p.tabs.length)
  })
})
