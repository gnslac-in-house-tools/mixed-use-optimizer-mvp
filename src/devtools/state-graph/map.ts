// The app's module map, read from its source text: files, what they export, what they import, which store
// slices they read. Pure: sources in ('/src/x.ts' → text), map out. A regex reading, not a TS parser: it follows
// the code style of this repo (relative imports with extensions, `useApp((s) => s.slice…)`).
import { SLICES, type Slice } from '../../state/trace/tracer.ts'

export interface ModuleNode {
  /** Path under src/: 'views/plan/editing.ts'. Trace events name modules the same way. */
  id: string
  /** First folder ('views', 'engine'…), or 'app' for the files at the root of src/. */
  layer: string
  /** 'views/plan'; '' at the root. */
  folder: string
  name: string
  /** Exported functions and constants, in source order (types left out). */
  exports: string[]
  /** Store slices it subscribes to: useApp((s) => s.derived…). Those views re-render when the slice changes. */
  reads: Slice[]
  lines: number
}

export interface ImportEdge {
  from: string
  to: string
  /** `import type` (or only `type` names): gone at runtime. */
  typeOnly: boolean
}

export interface ModuleMap {
  nodes: ModuleNode[]
  edges: ImportEdge[]
}

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/gm
const SIDE_EFFECT = /^\s*import\s+['"]([^'"]+)['"]/gm
const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm
const READ = /useApp\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.(\w+)/g

/** Every name inside { } is a `type` one: the import is gone at runtime. */
function onlyTypes(clause: string): boolean {
  const braces = /\{([^}]*)\}/.exec(clause)
  if (!braces || clause.replace(braces[0], '').replace(/[\s,]/g, '') !== '') return false
  const names = braces[1].split(',').map((s) => s.trim()).filter(Boolean)
  return names.length > 0 && names.every((n) => n.startsWith('type '))
}

/** 'views/plan/editing.ts' + '../../state/store.ts' → 'state/store.ts' (or null: a package, a css file…). */
function resolve(from: string, spec: string, ids: Set<string>): string | null {
  if (!spec.startsWith('.')) return null
  const parts = from.split('/').slice(0, -1)
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  const base = parts.join('/')
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => ids.has(c)) ?? null
}

/** The code without comments: an example in a comment (`useApp((s) => s.derived)`) is not a read. Keeps `://`. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

export function buildMap(sources: Record<string, string>): ModuleMap {
  const files = Object.entries(sources)
    .map(([path, text]) => [path.replace(/^\/?src\//, ''), code(text), text.split('\n').length - (text.endsWith('\n') ? 1 : 0)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  const ids = new Set(files.map(([id]) => id))

  const nodes: ModuleNode[] = files.map(([id, text, lines]) => {
    const slash = id.lastIndexOf('/')
    const reads = new Set([...text.matchAll(READ)].map((m) => m[2]))
    return {
      id,
      layer: slash < 0 ? 'app' : id.slice(0, id.indexOf('/')),
      folder: slash < 0 ? '' : id.slice(0, slash),
      name: id.slice(slash + 1),
      exports: [...text.matchAll(EXPORT)].map((m) => m[1]),
      reads: SLICES.filter((s) => reads.has(s)),
      lines,
    }
  })

  const edges: ImportEdge[] = []
  for (const [from, text] of files) {
    const found: { at: number; to: string | null; typeOnly: boolean }[] = []
    for (const m of text.matchAll(IMPORT)) found.push({ at: m.index, to: resolve(from, m[3], ids), typeOnly: !!m[1] || onlyTypes(m[2]) })
    for (const m of text.matchAll(SIDE_EFFECT)) found.push({ at: m.index, to: resolve(from, m[1], ids), typeOnly: false })
    found.sort((a, b) => a.at - b.at)
    for (const f of found) if (f.to && f.to !== from) edges.push({ from, to: f.to, typeOnly: f.typeOnly })
  }
  return { nodes, edges }
}

/** An engine file: `engine/**`, or a module's own engine (`modules/<id>/engine/**`, Decision "Catalog"): pure code either way. */
export const isEngine = (id: string) => /^(engine|modules\/[^/]+\/engine)\//.test(id)

/** Whether a module belongs to the layer: the engine layer also holds the modules' engines. */
export const inLayer = (n: ModuleNode, layer: string) => (layer === 'engine' ? isEngine(n.id) : n.layer === layer)

/** Modules of `layer` that `id` loads at runtime, directly or through each other (not `id` itself). */
export function reachable(map: ModuleMap, id: string, layer: string): Set<string> {
  const inside = new Map(map.nodes.map((n) => [n.id, inLayer(n, layer)]))
  const seen = new Set<string>()
  const queue = [id]
  while (queue.length) {
    const at = queue.pop()!
    for (const e of map.edges) {
      if (e.from !== at || e.typeOnly || seen.has(e.to) || e.to === id || !inside.get(e.to)) continue
      seen.add(e.to)
      queue.push(e.to)
    }
  }
  return seen
}
