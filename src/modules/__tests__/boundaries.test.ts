// Guards for the modules (Decisions "Modules" and "Catalog"): a module is core code in a folder of its own, and the rest
// of the app reads it through one door. A module's files outside its views are pure (the engine's, the model's, the pure
// verbs of state/actions/, its own folder and its `requires`; no React, no store); the seam (catalog.ts, index.ts) also
// reads the typologies and every manifest; the shared files at the root (types.ts, vary.ts, measure.ts) follow the
// module's rule and every module file may import them; no module file imports a plugin, nor another module it does not
// require. Outside, the app imports only catalog.ts and types.ts, with three openings: any file but a plugin's and the
// modules' own (the engine, the views, the state, the api, the io) may import a module's engine/ (pure code);
// a file directly under state/actions/ (the pure verbs, index.ts among them) its actions.ts; src/views/ its views/. A plugin gets
// none. A module's file (and the shared ones) may also import src/kinds/types.ts, types only: its kinds are data of the kinds' registry's
// shape, and nothing else of src/kinds/ (the registry reads the modules through the catalog, never the other way round). Every folder is a module.
import { describe, expect, it } from 'vitest'
import { MODULES } from '../index.ts'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })

/** The code without comments: an import in a comment is not one. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** What a file imports: each specifier resolved to a path under /src (a package stays as it is). */
function importsOf(path: string, text: string): string[] {
  const specs = [...code(text).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)'([^']+)'/g)].map((m) => m[1])
  return specs.map((s) => (s.startsWith('.') ? new URL(s, `file://${path}`).pathname : s))
}

const files = Object.entries(sources).map(([path, text]) => ({ path, imports: importsOf(path, text) }))
const isPath = (i: string) => i.startsWith('/')
const inModules = (p: string) => p.startsWith('/src/modules/')
/** The module whose folder a file is in (not the files at modules/ itself). */
const moduleOf = (p: string) => /^\/src\/modules\/([^/]+)\//.exec(p)?.[1] ?? null
/** A file at the root of modules/: the seam (catalog.ts, index.ts) or a shared file (types.ts…). */
const isRoot = (p: string) => /^\/src\/modules\/[^/]+$/.test(p)
const isSeam = (p: string) => p === '/src/modules/catalog.ts' || p === '/src/modules/index.ts'
const isShared = (p: string) => isRoot(p) && !isSeam(p)
const inViews = (p: string) => /^\/src\/modules\/[^/]+\/views\//.test(p)
const requiresOf = (id: string) => MODULES.find((m) => m.id === id)?.requires ?? []
/** A pure verb module (not the traced registry): a module's files may write a project with these. */
const verb = (i: string) => i.startsWith('/src/state/actions/') && i !== '/src/state/actions/index.ts'

/** The one file of src/kinds/ a module may import: the shape of a kind, types only. */
const KINDS_TYPES = '/src/kinds/types.ts'

/** What every non-view module file and every shared file may import: packages but React and the store, the engine, the model, the pure verbs, the kinds' types and the shared files. */
const base = (i: string) =>
  (!isPath(i) && !/^(react|zustand)/.test(i)) || i.startsWith('/src/engine/') || i.startsWith('/src/model/') || verb(i) || i === KINDS_TYPES || (isShared(i) && inModules(i))

/** What a module's views may not import (Phase D.1): the engine's edit maths and the shape verbs, which only `actions.editShape` reaches for them. */
const reachesShapeInternals = (_path: string, i: string) => i === '/src/engine/geom/edit.ts' || i === '/src/state/actions/shape.ts'

/** The block engine as BLOCK_VERSION 4 kept it (Phase D.2): frozen, read only by the steps that read older files. */
const LEGACY = '/src/modules/warehouse/engine/legacy/'
const inLegacy = (p: string) => p.startsWith(LEGACY)
/** What reaches the frozen engine: nothing but the old steps (engine/migrate.ts) and the frozen folder itself. */
const reachesLegacy = (path: string, i: string) => i.startsWith(LEGACY) && path !== '/src/modules/warehouse/engine/migrate.ts' && !inLegacy(path)
/** What the frozen engine may not reach: the live block engine, which moves on (metres, a clipped grid). */
const LIVE_ENGINE = ['shape', 'generate', 'copies', 'elements', 'zones', 'defaults', 'figures', 'draw', 'library'].map((n) => `/src/modules/warehouse/engine/${n}.ts`)
const reachesLive = (_path: string, i: string) => LIVE_ENGINE.includes(i)

const wrong = (rule: (path: string, i: string) => boolean, where: (path: string) => boolean) =>
  files.filter((f) => where(f.path)).flatMap((f) => f.imports.filter((i) => rule(f.path, i)).map((i) => `${f.path} → ${i}`))

describe('module boundaries', () => {
  it('finds the sources it guards', () => {
    expect(files.some((f) => f.path === '/src/modules/catalog.ts')).toBe(true)
    expect(files.some((f) => f.path === '/src/modules/types.ts')).toBe(true)
    expect(files.some((f) => moduleOf(f.path) === 'terrain')).toBe(true)
    // Phase D.2: the frozen module-line block engine
    for (const name of ['lines', 'generateLines', 'copiesLines', 'types']) expect(files.some((f) => f.path === `${LEGACY}${name}.ts`)).toBe(true)
  })

  it('a module’s files outside its views import the engine, the model, the pure verbs, the shared files, their own folder and the folders they require', () => {
    const own = (path: string) => moduleOf(path)!
    const ok = (path: string, i: string) => base(i) || i.startsWith(`/src/modules/${own(path)}/`) || requiresOf(own(path)).some((r) => i.startsWith(`/src/modules/${r}/`))
    expect(wrong((path, i) => !ok(path, i), (path) => moduleOf(path) !== null && !inViews(path))).toEqual([])
  })

  it('the shared files at the root follow the same rule and import no module’s folder', () => {
    expect(wrong((_path, i) => !base(i), isShared)).toEqual([])
  })

  it('the catalog and the index also import the typologies and every module’s manifest', () => {
    const ok = (_path: string, i: string) => base(i) || i.startsWith('/src/typologies/') || /^\/src\/modules\/[^/]+\/module\.ts$/.test(i) || (isSeam(i) && inModules(i))
    expect(wrong((path, i) => !ok(path, i), isSeam)).toEqual([])
  })

  it('no module file imports a plugin, nor another module it does not require', () => {
    const bad = (path: string, i: string) => {
      if (i.startsWith('/src/plugins/')) return true
      const other = /^\/src\/modules\/([^/]+)\//.exec(i)?.[1]
      const own = moduleOf(path)
      // the seam reads every manifest; a module reads another's folder only if it requires it
      return !!other && !isSeam(path) && other !== own && !(own && requiresOf(own).includes(other))
    }
    expect(wrong(bad, inModules)).toEqual([])
  })

  it('the app outside imports of a module only catalog.ts and types.ts; any file but a plugin’s may import a module’s engine/, state/actions/*.ts its actions.ts and the views its views/', () => {
    const opening = (path: string, i: string) =>
      (!path.startsWith('/src/plugins/') && /^\/src\/modules\/[^/]+\/engine\//.test(i)) ||
      (/^\/src\/state\/actions\/[^/]+\.ts$/.test(path) && /^\/src\/modules\/[^/]+\/actions\.ts$/.test(i)) ||
      (path.startsWith('/src/views/') && /^\/src\/modules\/[^/]+\/views\//.test(i))
    const ok = (path: string, i: string) => !inModules(i) || i === '/src/modules/catalog.ts' || i === '/src/modules/types.ts' || opening(path, i)
    expect(wrong((path, i) => !ok(path, i), (path) => !inModules(path))).toEqual([])
  })

  it('a module’s files import src/kinds/types.ts, as types, and nothing else of src/kinds/', () => {
    expect(wrong((_path, i) => i.startsWith('/src/kinds/') && i !== KINDS_TYPES, inModules)).toEqual([])
    // types only: no value of the registry's folder is a module's to read, so each such import is an `import type`
    const valueImports = Object.entries(sources)
      .filter(([path]) => inModules(path))
      .filter(([, text]) => /^\s*import\s+(?!type\b)[^'\n]*from\s+'[^']*kinds\/types\.ts'/m.test(code(text)))
      .map(([path]) => path)
    expect(valueImports).toEqual([])
  })

  it('a module’s views reach neither the engine’s edit maths nor the shape verbs: they edit an outline through the shape engine’s handles (Phase D.1)', () => {
    expect(wrong(reachesShapeInternals, inViews)).toEqual([])
    // it bites: the same imports, written in a view, are told
    const spoiled = importsOf(
      '/src/modules/warehouse/views/Spoiled.tsx',
      "import { moveVertex } from '../../../engine/geom/edit.ts'\nimport { editShape } from '../../../state/actions/shape.ts'\nimport { actions } from '../../../state/actions/index.ts'\n// import { x } from '../../../engine/geom/edit.ts'",
    )
    expect(spoiled.filter((i) => reachesShapeInternals('/src/modules/warehouse/views/Spoiled.tsx', i))).toEqual(['/src/engine/geom/edit.ts', '/src/state/actions/shape.ts'])
  })

  it('a module’s views reach neither the On edge verbs nor its engine: they give the On edge views a host, which edits through actions.editEdge (Phase D.3 task 10)', () => {
    const reachesEdge = (_path: string, i: string) => i === '/src/state/actions/onEdge.ts' || i.startsWith('/src/engine/edge/')
    expect(wrong(reachesEdge, inViews)).toEqual([])
    // it bites: the same imports, written in a view, are told
    const spoiled = importsOf('/src/modules/warehouse/views/Spoiled.tsx', "import { editEdge } from '../../../state/actions/onEdge.ts'\nimport type { EdgeOp } from '../../../engine/edge/onEdge.ts'\n// import { x } from '../../../engine/edge/onEdge.ts'")
    expect(spoiled.filter((i) => reachesEdge('/src/modules/warehouse/views/Spoiled.tsx', i))).toEqual(['/src/state/actions/onEdge.ts', '/src/engine/edge/onEdge.ts'])
  })

  it('nothing but the old steps of engine/migrate.ts imports the frozen module-line engine, and it imports none of the live block engine (Phase D.2)', () => {
    expect(wrong(reachesLegacy, () => true)).toEqual([])
    expect(files.filter((f) => inLegacy(f.path)).length).toBeGreaterThanOrEqual(4)
    expect(wrong(reachesLive, inLegacy)).toEqual([])
    // it bites: the same imports, written elsewhere in the module, are told
    const spoiled = importsOf('/src/modules/warehouse/engine/figures.ts', "import { generate } from './legacy/generateLines.ts'\n// import { x } from './legacy/lines.ts'")
    expect(spoiled.filter((i) => reachesLegacy('/src/modules/warehouse/engine/figures.ts', i))).toEqual([`${LEGACY}generateLines.ts`])
    expect(importsOf(`${LEGACY}lines.ts`, "import { anchor } from '../shape.ts'").filter((i) => reachesLive(`${LEGACY}lines.ts`, i))).toEqual(['/src/modules/warehouse/engine/shape.ts'])
  })

  it('the engine imports nothing of the modules but a module’s engine/', () => {
    expect(wrong((_path, i) => inModules(i) && !/^\/src\/modules\/[^/]+\/engine\//.test(i), (path) => path.startsWith('/src/engine/'))).toEqual([])
  })

  it('every folder under modules/ is a module of the list', () => {
    const folders = [...new Set(files.map((f) => moduleOf(f.path)).filter((m): m is string => m !== null))].sort()
    expect(MODULES.map((m) => m.id).sort()).toEqual(folders)
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length)
  })

  it('a module requires only modules of the list, and never itself', () => {
    const ids = new Set(MODULES.map((m) => m.id))
    for (const m of MODULES) for (const r of m.requires ?? []) expect(ids.has(r) && r !== m.id).toBe(true)
  })
})
