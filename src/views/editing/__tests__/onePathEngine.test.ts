// One path engine, guarded (Phase PE.1 task 11, Decision "Path engine"): one set of handles, one verb and one typed dimension edit a street and an existing street (nodes,
// stretches, sides), through `actions.pathOf` and `actions.editPath`, `views/editing/path/`. What the test scans: every source file of `src/` that is not a test, as text,
// comments left out (as `oneShapeEngine.test.ts` and `oneEdgeEngine.test.ts` do). Five rules (a lane line, Phase PE.2, is a handle like the others):
//   1. The old handles are gone: nothing names `RoadHandles`, `WidthHandles`, `startStreetNodeDrag`, `startStreetSegmentDrag`, `startStreetWidthDrag` or `widthHandles`.
//   2. Outside `views/editing/path/` no view binds a drag to a street's or an existing street's node, stretch, side or width, and none calls `editPath` or the verbs that
//      moved one node, split or merged a stretch or set a stretch's width (`moveStreetNode`, `splitStreetSegment`, `removeStreetNode`, `setStreetSegmentWidth`) on a press.
//      The Street and Existing road tools draw (`drawStreet`, `addExistingRoad`): they bind no such drag and call none of those, so they need no exception; the reference
//      lines' point handles join the engine later, and the menu's *Equal sides* is one op, not a drag (both named below, with their reason).
//   3. `views/editing/path/` edits only through `actions.editPath` (it reads through `actions.pathOf`), every handle it binds is one of the four that start a typed drag
//      (`startPathNode`, `startPathStretch`, `startPathSide`, `startPathLine`: a lane line, Phase PE.2) and each of those calls `startTyped`.
//   4. A module's views import neither `state/actions/path.ts` nor `engine/path/`: they give a path a host or leave it alone.
//   5. `engine/circulation/` defines none of the functions lifted into `engine/path/`, and `engine/path/` imports nothing of `circulation/`, `state/`, `views/` or `kinds/`.
// And the kinds: every kind with `path` has an adapter in `PATH_ADAPTERS`, and none without.
// Each rule is a function of text (or of two lists), and the last block feeds each one a spoiled copy of a source, in memory, to show it bites.
import { describe, expect, it } from 'vitest'
import { posix } from 'node:path'
import { kinds } from '../../../kinds/index.ts'
import { PATH_ADAPTERS } from '../../../state/actions/path.ts'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**', '!**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\r\n/g, '\n')
const specifiersOf = (path: string, src: string): string[] =>
  [...code(src).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => (m[1].startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), m[1])).replace(/\.tsx?$/, '') : m[1]))

const inViews = (path: string) => path.startsWith('/src/views/') || /^\/src\/modules\/[^/]+\/views\//.test(path)
const inModuleViews = (path: string) => /^\/src\/modules\/[^/]+\/views\//.test(path)
const inPath = (path: string) => path.startsWith('/src/views/editing/path/')
const all = Object.entries(sources)

// ---- 1 ----
const OLD = /\b(?:RoadHandles|WidthHandles|startStreetNodeDrag|startStreetSegmentDrag|startStreetWidthDrag|widthHandles)\b/
const namingOld = (files: [string, string][]) => files.filter(([, src]) => OLD.test(code(src))).map(([path]) => path)

// ---- 2 ----
/** A drag bound to a path's node, stretch, side or width: the key's first word says what it is a handle of. */
const PATH_BIND = /drag\.bind\(\s*[`'"](?:path|street|existing(?:-road)?|reference-line)-(?:node|stretch|side|width|segment|point|line)/
const PATH_VERBS = /\b(?:actions\.editPath|actions\.moveStreetNode|actions\.splitStreetSegment|actions\.removeStreetNode|actions\.setStreetSegmentWidth)\s*\(/
/** The exceptions to rule 2, each with its reason. */
const PATH_EXCEPTIONS: Record<string, string> = {
  '/src/views/editing/menu/kinds/common.ts': '*Equal sides* and *Equal lanes* are menu verbs: one `equal` or `equal-lanes` op on what is picked, through `editPath`; they are no handle and bind no drag',
  '/src/views/plan/annotations/ReferenceLinesLayer.tsx': 'a reference line’s points are dragged by its own handle: the reference lines join the Path engine later (the spec’s Out of scope), and they are no street',
}
const pathBinders = (files: [string, string][]) => files.filter(([path, src]) => inViews(path) && !inPath(path) && !(path in PATH_EXCEPTIONS) && (PATH_BIND.test(code(src)) || PATH_VERBS.test(code(src)))).map(([path]) => path)

// ---- 3 ----
const EDIT_VERB = /\bactions\.(\w+)\b/g
const pathEdits = (files: [string, string][]) =>
  files.filter(([path]) => inPath(path)).flatMap(([path, src]) => [...code(src).matchAll(EDIT_VERB)].filter((m) => !['editPath', 'pathOf'].includes(m[1])).map((m) => `${path} → actions.${m[1]}`))
const HANDLES = '/src/views/editing/path/PathHandles.tsx'
const DRAGS = '/src/views/editing/path/drags.ts'
const bound = (src: string) => [...code(src).matchAll(/drag\.bind\([^,]+,\s*(start\w+)\(/g)].map((m) => m[1]).sort()
const startsOf = (src: string): string[] => [...code(src).matchAll(/^export (?:function|const) (start[A-Z]\w*)/gm)].map((m) => m[1])
/** The text of a top-level function `name`, up to the next top-level declaration; null when there is none. */
function bodyOf(src: string, name: string): string | null {
  const text = code(src)
  const at = new RegExp(`^(?:export )?(?:function|const) ${name}\\b`, 'm').exec(text)
  if (!at) return null
  const rest = text.slice(at.index + at[0].length)
  const next = /\n(?:export |function |const |type |interface )/.exec(rest)
  return rest.slice(0, next ? next.index : rest.length)
}
const untyped = (src: string) => startsOf(src).sort().filter((n) => !/\bstartTyped\s*\(/.test(bodyOf(src, n) ?? ''))
const HANDLE_STARTS = ['startPathLine', 'startPathNode', 'startPathSide', 'startPathStretch']

// ---- 4 ----
const reachesPathEngine = (files: [string, string][]) =>
  files.filter(([path, src]) => inModuleViews(path) && specifiersOf(path, src).some((s) => s === '/src/state/actions/path' || s.startsWith('/src/engine/path/') || s === '/src/engine/path')).map(([path]) => path)

// ---- 5 ----
const LIFTED = ['offsetLine', 'rounded', 'cornerRadii', 'segmentStrip', 'stripPieces', 'stripOutlines', 'stripRegions', 'stretchStrip', 'joinEnds', 'joinedPaving', 'sidedStrip']
const DEFINES = new RegExp(String.raw`\b(?:function|const)\s+(?:${LIFTED.join('|')})\b`)
const circulationDefines = (files: [string, string][]) => files.filter(([path, src]) => path.startsWith('/src/engine/circulation/') && DEFINES.test(code(src))).map(([path]) => path)
const PATH_IMPORTS_NO = ['/src/engine/circulation', '/src/state', '/src/views', '/src/kinds']
const enginePathImports = (files: [string, string][]) =>
  files.filter(([path, src]) => path.startsWith('/src/engine/path/') && specifiersOf(path, src).some((s) => PATH_IMPORTS_NO.some((n) => s === n || s.startsWith(`${n}/`)))).map(([path]) => path)

// ---- the kinds ----
const adapterGap = (adapterKinds: string[], pathKinds: string[]) => ({
  noAdapter: pathKinds.filter((k) => !adapterKinds.includes(k)).sort(),
  noPath: adapterKinds.filter((k) => !pathKinds.includes(k)).sort(),
})

describe('one path engine', () => {
  it('finds the sources it guards', () => {
    for (const f of [HANDLES, DRAGS, '/src/views/editing/path/pathState.ts', '/src/state/actions/path.ts', '/src/engine/path/pathOp.ts']) expect(sources[f]).toBeDefined()
    expect(all.some(([path]) => path.startsWith('/src/engine/circulation/'))).toBe(true)
  })

  it('rule 1: the old street handles are gone', () => {
    expect(namingOld(all)).toEqual([])
  })

  it('rule 2: outside the path views no view binds a node, stretch, side or width, nor calls the verbs of one but the named ones', () => {
    expect(pathBinders(all)).toEqual([])
  })

  it('rule 2: each exception is real (it binds what the rule forbids)', () => {
    for (const path of Object.keys(PATH_EXCEPTIONS)) expect(PATH_BIND.test(code(sources[path] ?? '')) || PATH_VERBS.test(code(sources[path] ?? ''))).toBe(true)
  })

  it('rule 3: the path views edit through editPath alone; they bind the node, stretch and side handles, and each starts a typed drag', () => {
    expect(pathEdits(all)).toEqual([])
    expect(bound(sources[HANDLES])).toEqual(HANDLE_STARTS)
    expect(startsOf(sources[DRAGS]).filter((n) => HANDLE_STARTS.includes(n)).sort()).toEqual(HANDLE_STARTS)
    expect(untyped(sources[DRAGS])).toEqual([])
  })

  it('rule 4: a module’s views reach neither state/actions/path.ts nor engine/path/', () => {
    expect(reachesPathEngine(all)).toEqual([])
  })

  it('rule 5: the circulation defines none of the lifted functions; the path engine imports nothing of it, the state, the views or the kinds', () => {
    expect(circulationDefines(all)).toEqual([])
    expect(enginePathImports(all)).toEqual([])
  })

  it('the kinds with a path are the kinds with an adapter', () => {
    expect(adapterGap(Object.keys(PATH_ADAPTERS), kinds().filter((k) => k.path !== undefined).map((k) => k.id))).toEqual({ noAdapter: [], noPath: [] })
  })

  it('every rule bites on a spoiled copy, in memory', () => {
    const handles = sources[HANDLES]
    const drags = sources[DRAGS]
    // 1
    expect(namingOld([['/src/views/plan/Spoiled.tsx', 'export const x = widthHandles(road, 0)']])).toEqual(['/src/views/plan/Spoiled.tsx'])
    expect(namingOld([['/src/views/plan/Spoiled.tsx', '<RoadHandles px={px} />']])).toEqual(['/src/views/plan/Spoiled.tsx'])
    // 2
    expect(pathBinders([['/src/views/plan/Spoiled.tsx', 'const b = {...drag.bind(`street-node-${id}`, startIt(id))}']])).toEqual(['/src/views/plan/Spoiled.tsx'])
    expect(pathBinders([['/src/views/plan/Spoiled.tsx', 'const b = {...drag.bind(`path-side-${id}`, startIt(id))}']])).toEqual(['/src/views/plan/Spoiled.tsx'])
    expect(pathBinders([['/src/views/plan/Spoiled.tsx', 'const b = {...drag.bind(`path-line-${id}`, startIt(id))}']])).toEqual(['/src/views/plan/Spoiled.tsx'])
    expect(pathBinders([['/src/views/plan/Spoiled.tsx', 'actions.editPath(p, ref, op, option)']])).toEqual(['/src/views/plan/Spoiled.tsx'])
    expect(pathBinders([['/src/modules/parking/views/Spoiled.tsx', 'actions.setStreetSegmentWidth(p, o, ids, 9)']])).toEqual(['/src/modules/parking/views/Spoiled.tsx'])
    expect(pathBinders([['/src/views/plan/Spoiled.tsx', 'actions.moveStreetNodes(p, o, ids, d)']])).toEqual([])
    expect(pathBinders([['/src/views/plan/Spoiled.tsx', '// actions.editPath(p, ref, op, option)']])).toEqual([])
    // 3
    expect(pathEdits([[HANDLES.replace('PathHandles.tsx', 'Spoiled.ts'), 'actions.moveStreetNode(p, o, n, q)']])).toEqual(['/src/views/editing/path/Spoiled.ts → actions.moveStreetNode'])
    expect(bound(handles.replace(/drag\.bind\(`path-side-[^,]+,\s*startPathSide\([^)]*\)\)/, 'null'))).toEqual(['startPathLine', 'startPathNode', 'startPathStretch'])
    expect(bound(handles.replace(/drag\.bind\(`path-line-[^,]+,\s*startPathLine\([^)]*\)\)/, 'null'))).toEqual(['startPathNode', 'startPathSide', 'startPathStretch'])
    // a lane line's start that does not type is seen: only `startPathLine` loses its `startTyped`
    expect(untyped(drags.replace(/(export function startPathLine[\s\S]*?)startTyped\(/, '$1startedTyping('))).toEqual(['startPathLine'])
    expect(untyped(drags.replace(/startTyped\(/g, 'startedTyping('))).toEqual(HANDLE_STARTS)
    expect(untyped(`${drags}\nexport function startPathLane(): null {\n  return null\n}\n`)).toEqual(['startPathLane'])
    // 4
    expect(reachesPathEngine([['/src/modules/parking/views/Spoiled.tsx', "import { editPath } from '../../../state/actions/path.ts'"]])).toEqual(['/src/modules/parking/views/Spoiled.tsx'])
    expect(reachesPathEngine([['/src/modules/docks/views/Spoiled.tsx', "import { runPathOp } from '../../../engine/path/pathOp.ts'"]])).toEqual(['/src/modules/docks/views/Spoiled.tsx'])
    // 5
    expect(circulationDefines([['/src/engine/circulation/Spoiled.ts', 'export function offsetLine(points, d) {}']])).toEqual(['/src/engine/circulation/Spoiled.ts'])
    expect(circulationDefines([['/src/engine/circulation/Spoiled.ts', 'export const joinedPaving = () => []']])).toEqual(['/src/engine/circulation/Spoiled.ts'])
    expect(enginePathImports([['/src/engine/path/Spoiled.ts', "import { JOIN } from '../circulation/draft.ts'"]])).toEqual(['/src/engine/path/Spoiled.ts'])
    expect(enginePathImports([['/src/engine/path/Spoiled.ts', "import { useApp } from '../../state/store.ts'"]])).toEqual(['/src/engine/path/Spoiled.ts'])
    expect(enginePathImports([['/src/engine/path/Spoiled.ts', "import { kindOf } from '../../kinds/index.ts'"]])).toEqual(['/src/engine/path/Spoiled.ts'])
    // the kinds
    expect(adapterGap(['street'], ['street', 'existing-road'])).toEqual({ noAdapter: ['existing-road'], noPath: [] })
    expect(adapterGap(['street', 'lot'], ['street'])).toEqual({ noAdapter: [], noPath: ['lot'] })
  })
})
