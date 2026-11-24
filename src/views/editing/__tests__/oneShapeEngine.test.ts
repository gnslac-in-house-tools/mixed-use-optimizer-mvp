// One shape engine, guarded (Phase D.1 task 8, Decision "Shape engine"): one set of handles, one verb and one typed dimension edit a mass, a hole and a block's outline,
// on the site and in the block editor. What the test scans: every source file of `src/` that is not a test, as text, comments left out (`oneBuilder.test.ts` reads
// them the same way). Five rules (the modules' own, that their views reach neither the engine's edit maths nor the shape verbs, is in `modules/__tests__/boundaries.test.ts`):
//   1. Outside `src/engine/`, `state/actions/shape.ts`, `state/actions/holes.ts` and the warehouse's `actions.ts` and `engine/`, no file imports `engine/geom/edit.ts` or
//      `engine/geom/chamfer.ts`. One exception, named below with its reason.
//   2. Under `src/views/` and `src/modules/*/views/`, only `views/editing/shape/` and the files named below, each with its reason (the corner tools, the typed corner), name
//      `editShape`. The block editor reaches it only through `views/editing/shape/` (its `commands.ts` `byShape` takes the result). And no view names an old verb
//      (`moveVertex`, `dragVertex`, `moveWall`, `insertVertex`, `removeVertex`, `setCornerRadius`, the hole edit verbs) but the files named below, each with its reason: they
//      were the handles' before the engine, and a new caller must go through `editShape` so a block's rules hold.
//   3. The old handles are gone: `views/plan/HoleHandles.tsx` and the block editor's `PlanHandles.tsx` do not exist; no file names `startWallDrag`, `startVertexDrag`,
//      `blockWallDrag`, `useLastDrag` or `dragMoved`; `MassHandles.tsx` and the block editor's `Courts.tsx` write no `wall-`, `line-`, `vertex-`, `edge-`, `corner-` or
//      `stretch-` key (the two hosts, `views/editing/shape/host.ts` and `blockShapeHost.ts`, are where those keys are built, and the only ones).
//   4. Every typed drag says what it drags: each exported `start*` of `views/editing/shape/drags.ts`, and the plain mass's court pill (`DocksLayer.tsx`), call `startTyped`.
//      A truck court's depth pill is the shape engine's since D.3 task 7 (a `value` wall: `startPush`), so it is among the `start*`. `followStretchEnd` is not a `start*`: it edits no project. The Corner and Chamfer tools are clicks, not drags.
//   5. The kinds with an adapter (`SHAPE_ADAPTERS`) are the registry's kinds with `shape`.
//   7. A truck court's drag is the shape engine's (Phase D.3 task 7): the block editor's `Courts.tsx` only draws (it binds no pointer, starts no typed drag), and the court pill
//      (`data-court-pill`) is drawn by the shape handles (a block's courts, both viewports) and by `DocksLayer.tsx` (a plain mass's, which has no court kind), nobody else.
//   6. The cut of a contour by a line (`engine/geom/split.ts`, Phase D.3) is imported by the shape engine's op (`shapeOp.ts`) and the truck court's engine
//      (`modules/warehouse/engine/courts.ts`), nobody else: a split goes through the `split` op, so a kind that refuses it refuses it everywhere.
// Each rule is a function of text (or of two lists), and the last block feeds each one a spoiled copy of a source, in memory, to show it bites.
import { describe, expect, it } from 'vitest'
import { posix } from 'node:path'
import { kinds } from '../../../kinds/index.ts'
import { SHAPE_ADAPTERS } from '../../../state/actions/shape.ts'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**', '!**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\r\n/g, '\n')

/** Every import of a file, named or not, resolved to a path under /src without its extension (a package stays as it is). */
function specifiersOf(path: string, src: string): string[] {
  return [...code(src).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) =>
    m[1].startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), m[1])).replace(/\.tsx?$/, '') : m[1],
  )
}

// ---- Rule 1 ----

const EDIT = '/src/engine/geom/edit'
const CHAMFER = '/src/engine/geom/chamfer'
/** Where the engine's edit maths may be imported: the engine, the verbs of the shape and of the holes, the warehouse's own verbs and engine. */
const MAY_IMPORT_MATHS = (path: string): boolean =>
  path.startsWith('/src/engine/') ||
  path === '/src/state/actions/shape.ts' ||
  path === '/src/state/actions/holes.ts' ||
  path === '/src/modules/warehouse/actions.ts' ||
  path.startsWith('/src/modules/warehouse/engine/')

/** The exceptions to rule 1: a view's pure part that reads the chamfer's limits. Each says why. */
const MATHS_EXCEPTIONS: Record<string, string> = {
  '/src/views/plan/tools/chamferSize.ts': 'the Chamfer tool’s pure part (beside `cornerRadius.ts`): it reads `maxChamfer`, the room a corner has, to size the cut; it writes nothing',
}

/** The files, among those given as [path, text], that import the edit or chamfer maths and may not. */
const mathsImporters = (files: [string, string][]): string[] =>
  files
    .filter(([path]) => !MAY_IMPORT_MATHS(path) && !(path in MATHS_EXCEPTIONS))
    .filter(([path, src]) => specifiersOf(path, src).some((s) => s === EDIT || s === CHAMFER))
    .map(([path]) => path)

// ---- Rule 2 ----

const inViews = (path: string) => path.startsWith('/src/views/') || /^\/src\/modules\/[^/]+\/views\//.test(path)
const namesEditShape = (src: string) => /\beditShape\b/.test(code(src))

/** The exceptions to rule 2: the corner tools, each one click on a corner through the engine's verb, and the command line's typed corner. Each says why. */
const EDIT_SHAPE_TOOLS: Record<string, string> = {
  '/src/views/plan/command/editCommand.ts': 'the command line’s typed corner (`@x,y` on a picked corner): one `vertex` operation, so a block’s mass refuses it with its reason; it is not a drag',
  '/src/views/plan/tools/RoundCorner.tsx': 'the Corner tool: one click on a corner is one `radius` operation; a click is not a drag, so it is not one of the handles',
  '/src/views/plan/tools/Chamfer.tsx': 'the Chamfer tool: one click on a corner is one `chamfer` operation; a click is not a drag, so it is not one of the handles',
}

const callersOfEditShape = (files: [string, string][]): string[] =>
  files.filter(([path, src]) => inViews(path) && !path.startsWith('/src/views/editing/shape/') && !(path in EDIT_SHAPE_TOOLS) && namesEditShape(src)).map(([path]) => path)

/** The verbs of before the engine, over the mass's and the hole's adapters: for the MCP tools and the dimensions, not for a view. */
const OLD_VERBS = ['moveVertex', 'dragVertex', 'moveWall', 'insertVertex', 'removeVertex', 'setCornerRadius', 'moveHole', 'moveHoleVertex', 'dragHoleVertex', 'insertHoleVertex', 'removeHoleVertex', 'moveHoleWall']
const OLD_VERB = new RegExp(String.raw`\b(?:${OLD_VERBS.join('|')})\b`)
const namesOldVerb = (src: string) => OLD_VERB.test(code(src))

/** The views that still name an old verb: each says why it may (the verb is the adapter's anyway, so a block's rules hold). */
const OLD_VERB_CALLERS: Record<string, string> = {
  '/src/views/plan/holeState.ts': 'Delete on a picked hole’s corner: `removeHoleVertex` says why a hole keeps 3 corners; a hole has no block rules, and this is not a handle',
}

const callersOfOldVerbs = (files: [string, string][]): string[] => files.filter(([path, src]) => inViews(path) && !(path in OLD_VERB_CALLERS) && namesOldVerb(src)).map(([path]) => path)

// ---- Rule 3 ----

const OLD_NAMES = /\b(?:startWallDrag|startVertexDrag|blockWallDrag|useLastDrag|dragMoved)\b/
const namingOld = (files: [string, string][]): string[] => files.filter(([, src]) => OLD_NAMES.test(code(src))).map(([path]) => path)

/** A handle's key written in a string or template: `'wall-'`, `` `edge-${id}` ``. A class name or a data attribute does not start its string with these. */
const KEY_PREFIX = /['"`](?:wall|line|vertex|edge|corner|stretch)-/
const MASS_HANDLES = '/src/views/plan/MassHandles.tsx'
const COURTS = '/src/modules/warehouse/views/Courts.tsx'
const HOSTS = ['/src/views/editing/shape/host.ts', '/src/modules/warehouse/views/blockShapeHost.ts']
const bindingKeys = (files: [string, string][]): string[] => files.filter(([, src]) => KEY_PREFIX.test(code(src))).map(([path]) => path)

// ---- Rule 4 ----

/** The text of a top-level function `name` (exported or not), from its declaration to the next top-level declaration; null when there is none. */
function bodyOf(src: string, name: string): string | null {
  const text = code(src)
  const at = new RegExp(`^(?:export )?(?:async )?(?:function|const) ${name}\\b`, 'm').exec(text)
  if (!at) return null
  const rest = text.slice(at.index + at[0].length)
  const next = /\n(?:export |function |async function |const |type |interface )/.exec(rest)
  return rest.slice(0, next ? next.index : rest.length)
}
const callsStartTyped = (body: string | null) => body !== null && /\bstartTyped\s*\(/.test(body)
/** The exported `start*` functions of a file (`startPush`, `startCorner`…; not `startsWith` nor a lower-case continuation). */
const startsOf = (src: string): string[] => [...code(src).matchAll(/^export (?:async )?(?:function|const) (start[A-Z]\w*)/gm)].map((m) => m[1])
/** The drags that do not call `startTyped`. */
const untyped = (drags: string, pills: [string, string, string][]): string[] => [
  ...startsOf(drags).filter((n) => !callsStartTyped(bodyOf(drags, n))),
  ...pills.filter(([, src, fn]) => !callsStartTyped(bodyOf(src, fn))).map(([path, , fn]) => `${path} → ${fn}`),
]

const DRAGS = '/src/views/editing/shape/drags.ts'
/** The court pill that is not the shape engine's: a plain mass's (it has no court kind): the file and the function in it that starts the drag. */
const PILLS: [string, string][] = [['/src/modules/docks/views/DocksLayer.tsx', 'startPillDrag']]
const pillSources = (): [string, string, string][] => PILLS.map(([path, fn]) => [path, sources[path], fn])

// ---- Rule 5 ----

/** What differs between the kinds that have an adapter and the registry's kinds with `shape`. */
const adapterGap = (adapterKinds: string[], shapeKinds: string[]) => ({
  noAdapter: shapeKinds.filter((k) => !adapterKinds.includes(k)).sort(),
  noShape: adapterKinds.filter((k) => !shapeKinds.includes(k)).sort(),
})

// ---- Rule 7 ----

/** Where a court pill is drawn: the shape handles' (a block's, either viewport) and the plain mass's. */
const COURT_PILL_FILES = ['/src/views/editing/shape/ShapeHandles.tsx', '/src/modules/docks/views/DocksLayer.tsx']
const courtPillDrawers = (files: [string, string][]): string[] => files.filter(([path, src]) => !COURT_PILL_FILES.includes(path) && /data-court-pill/.test(code(src))).map(([path]) => path)
const bindsPointer = (src: string): boolean => /\b(?:onPointerDown|onPointerMove|onPointerUp|beginDrag|startTyped|setPointerCapture|startCourtTyped)\b/.test(code(src))

// ---- Rule 6 ----

const SPLIT = '/src/engine/geom/split'
/** Who may import the cut by a line: the shape engine's op and the court's engine (task 3 writes it). */
const MAY_IMPORT_SPLIT = (path: string): boolean => path === '/src/engine/geom/shapeOp.ts' || path === '/src/modules/warehouse/engine/courts.ts'
const splitImporters = (files: [string, string][]): string[] => files.filter(([path, src]) => !MAY_IMPORT_SPLIT(path) && specifiersOf(path, src).includes(SPLIT)).map(([path]) => path)

const all = Object.entries(sources)

describe('one shape engine', () => {
  it('finds the sources it guards', () => {
    expect(all.length).toBeGreaterThan(300)
    for (const path of [DRAGS, MASS_HANDLES, COURTS, ...HOSTS, '/src/state/actions/shape.ts', '/src/engine/geom/edit.ts', '/src/engine/geom/chamfer.ts', '/src/engine/geom/split.ts']) expect(sources[path], path).toBeDefined()
  })

  it('rule 1: the edit and chamfer maths are imported only by the engine, the verbs of shapes and holes and the warehouse (and the Chamfer tool’s sizing)', () => {
    expect(mathsImporters(all)).toEqual([])
  })

  it('rule 2: only the shape handles’ folder and the two corner tools name editShape in the views, the modules’ views included', () => {
    expect(callersOfEditShape(all)).toEqual([])
    // the block editor reaches it only through the shape folder
    expect(all.filter(([path, src]) => /^\/src\/modules\/[^/]+\/views\//.test(path) && namesEditShape(src)).map(([path]) => path)).toEqual([])
  })

  it('rule 2: no view names an old verb but the files named, each with a reason', () => {
    expect(callersOfOldVerbs(all)).toEqual([])
  })

  it('rule 3: the old handles and their drags are gone, and the two files that drew handles bind no key of the shape', () => {
    expect(sources['/src/views/plan/HoleHandles.tsx']).toBeUndefined()
    expect(sources['/src/modules/warehouse/views/PlanHandles.tsx']).toBeUndefined()
    expect(namingOld(all)).toEqual([])
    expect(bindingKeys([MASS_HANDLES, COURTS].map((path) => [path, sources[path]]))).toEqual([])
  })

  it('rule 3: the keys are built in the two hosts, and only there', () => {
    const hosts = bindingKeys(HOSTS.map((path) => [path, sources[path]]))
    expect(hosts.sort()).toEqual([...HOSTS].sort())
  })

  it('rule 4: every start* of the shape drags and both court pills call startTyped', () => {
    const starts = startsOf(sources[DRAGS])
    expect(starts).toEqual(expect.arrayContaining(['startPush', 'startCorner', 'startHoleMove', 'startBump', 'startChamferEnd']))
    expect(untyped(sources[DRAGS], pillSources())).toEqual([])
    // the stretch end follows a pointer and edits no project: it is no start* and says nothing to the typed dimension
    expect(starts).not.toContain('followStretchEnd')
  })

  it('rule 5: the kinds with an adapter are the registry’s kinds with shape', () => {
    const shapeKinds = kinds().filter((k) => k.shape).map((k) => k.id)
    expect(adapterGap(Object.keys(SHAPE_ADAPTERS), shapeKinds)).toEqual({ noAdapter: [], noShape: [] })
    // Phase D.3: a truck court, the block editor's and a placed block's, is a shape of its own
    expect(shapeKinds).toEqual(expect.arrayContaining(['mass', 'mass-hole', 'block-type', 'hole', 'court', 'block-court']))
  })

  it('rule 6: the cut by a line is imported by the shape engine’s op, and by nobody else (the court’s engine, once it is written)', () => {
    expect(splitImporters(all)).toEqual([])
    expect(specifiersOf('/src/engine/geom/shapeOp.ts', sources['/src/engine/geom/shapeOp.ts'])).toContain(SPLIT)
  })

  it('rule 7: a truck court’s drag is the shape engine’s: Courts.tsx only draws, and the court pill is drawn by the shape handles and the plain mass’s DocksLayer alone', () => {
    expect(bindsPointer(sources[COURTS])).toBe(false)
    expect(courtPillDrawers(all)).toEqual([])
    // the two that draw it still do
    for (const path of COURT_PILL_FILES) expect(/data-court-pill/.test(code(sources[path])), path).toBe(true)
    // a court's depth is a typed drag of the shape handles: its wall's push says what it drags
    expect(callsStartTyped(bodyOf(sources[DRAGS], 'startPush'))).toBe(true)
    expect(sources['/src/views/editing/shape/drags.ts']).toMatch(/what: 'Court depth'/)
  })

  it('the exceptions are still needed: each file listed does what its reason says', () => {
    for (const [path, why] of Object.entries({ ...MATHS_EXCEPTIONS, ...EDIT_SHAPE_TOOLS, ...OLD_VERB_CALLERS })) {
      expect(sources[path], `${path} does not exist: take it off the list`).toBeDefined()
      expect(why.length, path).toBeGreaterThan(30)
    }
    for (const path of Object.keys(MATHS_EXCEPTIONS)) expect(specifiersOf(path, sources[path]).some((s) => s === EDIT || s === CHAMFER), `${path} imports no maths any more: take it off the list`).toBe(true)
    for (const path of Object.keys(EDIT_SHAPE_TOOLS)) expect(namesEditShape(sources[path]), `${path} names no editShape any more: take it off the list`).toBe(true)
    for (const path of Object.keys(OLD_VERB_CALLERS)) expect(namesOldVerb(sources[path]), `${path} names no old verb any more: take it off the list`).toBe(true)
  })
})

describe('the rules bite: each one refuses a spoiled copy of a source (in memory, never in the repo)', () => {
  it('rule 1: a view that imports the edit maths, or the chamfer maths, is named; the allowed places and the named exception are not', () => {
    const spoiled: [string, string][] = [
      ['/src/views/plan/Foo.tsx', "import { moveWall } from '../../engine/geom/edit.ts'"],
      ['/src/modules/terrain/views/Bar.tsx', "import { maxChamfer } from '../../../engine/geom/chamfer.ts'"],
      ['/src/views/plan/Baz.tsx', "const m = await import('../../engine/geom/edit.ts')"],
    ]
    expect(mathsImporters(spoiled)).toEqual(spoiled.map(([path]) => path))
    expect(mathsImporters([['/src/views/plan/Foo.tsx', "// import { moveWall } from '../../engine/geom/edit.ts'"]])).toEqual([])
    expect(mathsImporters([['/src/api/tools/x.ts', "import { EDIT_TOOLS } from './edit.ts'"]])).toEqual([])
    expect(mathsImporters([['/src/state/actions/shape.ts', "import * as edit from '../../engine/geom/edit.ts'"]])).toEqual([])
    expect(mathsImporters([['/src/modules/warehouse/engine/shape.ts', "import { x } from '../../../engine/geom/edit.ts'"]])).toEqual([])
    // the real chamferSize.ts, with its exception off the list, would be named: the exception is the only thing that lets it through
    const real: [string, string] = ['/src/views/plan/tools/chamferSize.ts', sources['/src/views/plan/tools/chamferSize.ts']]
    expect(mathsImporters([['/src/views/plan/tools/chamferSizeCopy.ts', real[1]]])).toEqual(['/src/views/plan/tools/chamferSizeCopy.ts'])
  })

  it('rule 2: a copy of a handle’s source in another place of the views, or a module’s view that calls editShape, is named', () => {
    const drags = sources[DRAGS]
    expect(namesEditShape(drags)).toBe(true)
    expect(callersOfEditShape([['/src/views/plan/PlanSvg.tsx', drags]])).toEqual(['/src/views/plan/PlanSvg.tsx'])
    expect(callersOfEditShape([['/src/modules/warehouse/views/commands.ts', 'const w = actions.editShape(p, ref, op)']])).toEqual(['/src/modules/warehouse/views/commands.ts'])
    expect(callersOfEditShape([['/src/modules/warehouse/views/commands.ts', '// actions.editShape(p, ref, op), in a comment']])).toEqual([])
    expect(callersOfEditShape([[DRAGS, drags]])).toEqual([])
    expect(callersOfEditShape([['/src/api/tools/x.ts', 'editShape(p, ref, op)']])).toEqual([])
    // the corner tools are let through only by name
    expect(callersOfEditShape([['/src/views/plan/tools/RoundCornerCopy.tsx', sources['/src/views/plan/tools/RoundCorner.tsx']]])).toEqual(['/src/views/plan/tools/RoundCornerCopy.tsx'])
  })

  it('rule 2: a view that calls an old verb is named (a module’s too); a comment, a longer name and an api tool are not; the listed files are let through by name only', () => {
    for (const name of ['moveVertex', 'dragVertex', 'moveWall', 'insertVertex', 'removeVertex', 'setCornerRadius', 'moveHole', 'moveHoleVertex', 'dragHoleVertex', 'insertHoleVertex', 'removeHoleVertex', 'moveHoleWall']) {
      expect(callersOfOldVerbs([['/src/views/plan/Foo.tsx', `apply((p) => actions.${name}(p, id, 0))`]]), name).toEqual(['/src/views/plan/Foo.tsx'])
      expect(callersOfOldVerbs([['/src/modules/warehouse/views/Bar.tsx', `const q = ${name}(p, id)`]]), name).toEqual(['/src/modules/warehouse/views/Bar.tsx'])
    }
    expect(callersOfOldVerbs([['/src/views/plan/Foo.tsx', '// actions.moveVertex(p, id, 0, pt), in a comment']])).toEqual([])
    expect(callersOfOldVerbs([['/src/views/plan/Foo.tsx', 'const moveVertexLater = 1; removeHole(p, id, 0)']])).toEqual([])
    expect(callersOfOldVerbs([['/src/api/tools/edit.ts', 'actions.moveVertex(p, id, 0, pt)']])).toEqual([])
    // Properties' Corner section goes through the shape folder's verbs (D.2 task 6): it names no old verb and no editShape
    expect(namesOldVerb(sources['/src/views/panels/Properties.tsx'])).toBe(false)
    // the typed corner calls the engine's verb, no old one
    expect(namesOldVerb(sources['/src/views/plan/command/editCommand.ts'])).toBe(false)
  })

  it('rule 3: a source that names an old drag or binds a shape key is named; a comment, a class name and a data attribute are not', () => {
    for (const name of ['startWallDrag', 'startVertexDrag', 'blockWallDrag', 'useLastDrag', 'dragMoved']) expect(namingOld([['/src/a.ts', `const f = ${name}(1)`]]), name).toEqual(['/src/a.ts'])
    expect(namingOld([['/src/a.ts', '// startWallDrag was the old one']])).toEqual([])
    expect(namingOld([['/src/a.ts', 'const startWallDragged = 1']])).toEqual([])
    // MassHandles.tsx with a handle bound by the old key
    const massHandles = sources[MASS_HANDLES]
    const spoiled = massHandles.replace('<g {...drag.bind(\'rotate\'', "<g {...drag.bind(`wall-${i}`") // the rotation handle's bind, now keyed as a wall
    expect(spoiled).not.toBe(massHandles)
    expect(bindingKeys([[MASS_HANDLES, spoiled]])).toEqual([MASS_HANDLES])
    expect(bindingKeys([[COURTS, `${sources[COURTS]}\nconst k = 'stretch-face'`]])).toEqual([COURTS])
    for (const key of ['wall-', 'line-', 'vertex-', 'edge-', 'corner-', 'stretch-']) expect(bindingKeys([['/src/a.tsx', `bind("${key}1", f)`]]), key).toEqual(['/src/a.tsx'])
    expect(bindingKeys([['/src/a.tsx', '<g data-line-preview="x1" className="border-edge-2 vertex">']])).toEqual([])
    expect(bindingKeys([['/src/a.tsx', "// 'wall-1' was the old key"]])).toEqual([])
  })

  it('rule 4: a start* whose startTyped is taken out is named, and so is a pill that loses its own', () => {
    const drags = sources[DRAGS]
    // the call in startBump alone (the first startTyped after its declaration) renamed to a no-op
    const at = drags.indexOf('export function startBump')
    const call = drags.indexOf('startTyped(', at)
    expect(at).toBeGreaterThan(0)
    expect(call).toBeGreaterThan(at)
    const spoiled = `${drags.slice(0, call)}noop(${drags.slice(call + 'startTyped('.length)}`
    expect(untyped(spoiled, pillSources())).toEqual(['startBump'])
    // every call gone: every start* is named, and `followStretchEnd` is not among them
    const none = untyped(drags.replace(/startTyped\(/g, 'noop('), pillSources())
    expect(none).toEqual(expect.arrayContaining(['startPush', 'startCorner', 'startHoleMove', 'startBump', 'startChamferEnd']))
    expect(none).not.toContain('followStretchEnd')
    // a start* added with no startTyped, even beside a function that calls it
    expect(untyped(`${drags}\nexport function startTwist(ref: Ref): Start {\n  return () => {}\n}\n`, pillSources())).toEqual(['startTwist'])
    // a pill: the court-depth drag without its startTyped, in either file
    for (const [path, , fn] of pillSources()) {
      const lost = pillSources().map(([p, src, f]): [string, string, string] => (p === path ? [p, src.replace(/startTyped\(/g, 'noop('), f] : [p, src, f]))
      expect(untyped(drags, lost), path).toEqual([`${path} → ${fn}`])
    }
    // a pill whose function is gone (renamed away) is named too
    expect(untyped(drags, [['/src/x.tsx', 'const a = 1', 'startPillDrag']])).toEqual(['/src/x.tsx → startPillDrag'])
  })

  it('rule 7 bites: a pointer bound in Courts.tsx, or a court pill drawn anywhere else, is named', () => {
    expect(bindsPointer(`${sources[COURTS]}
const x = <g onPointerDown={f} />`)).toBe(true)
    expect(bindsPointer(`${sources[COURTS]}
startCourtTyped(t.id)`)).toBe(true)
    expect(bindsPointer('// onPointerDown was here')).toBe(false)
    expect(courtPillDrawers([['/src/modules/warehouse/views/Courts.tsx', '<g data-court-pill={x} />']])).toEqual(['/src/modules/warehouse/views/Courts.tsx'])
    expect(courtPillDrawers([['/src/views/editing/shape/ShapeHandles.tsx', '<g data-court-pill={x} />']])).toEqual([])
    expect(courtPillDrawers([['/src/a.tsx', '// data-court-pill was here']])).toEqual([])
  })

  it('rule 4: a startTyped in a helper beside a start* does not count for it', () => {
    const src = "export function startA(): Start {\n  return () => {}\n}\nfunction helper() {\n  startTyped({})\n}\n"
    expect(untyped(src, [])).toEqual(['startA'])
    expect(untyped("export function startA(): Start {\n  return () => {\n    startTyped({})\n  }\n}\n", [])).toEqual([])
  })

  it('rule 6: a view, a verb or another engine file that imports the cut is named; the op and the court’s engine, a comment and a longer name are not', () => {
    const spoiled: [string, string][] = [
      ['/src/views/plan/Foo.tsx', "import { splitByLine } from '../../engine/geom/split.ts'"],
      ['/src/state/actions/shape.ts', "import { splitByLine } from '../../engine/geom/split.ts'"],
      ['/src/modules/warehouse/actions.ts', "import { splitByLine } from '../../engine/geom/split.ts'"],
      ['/src/engine/geom/edit.ts', "import { splitByLine } from './split.ts'"],
    ]
    expect(splitImporters(spoiled)).toEqual(spoiled.map(([path]) => path))
    expect(splitImporters([['/src/engine/geom/shapeOp.ts', "import { splitByLine } from './split.ts'"]])).toEqual([])
    expect(splitImporters([['/src/modules/warehouse/engine/courts.ts', "import { splitByLine } from '../../../engine/geom/split.ts'"]])).toEqual([])
    expect(splitImporters([['/src/views/plan/Foo.tsx', "// import { splitByLine } from '../../engine/geom/split.ts'"]])).toEqual([])
    expect(splitImporters([['/src/views/plan/Foo.tsx', "import { x } from '../../engine/geom/splitter.ts'"]])).toEqual([])
  })

  it('rule 5: an adapter without its kind’s shape, and a shape without its adapter, are told apart', () => {
    expect(adapterGap(['mass', 'block-type'], ['mass', 'mass-hole', 'block-type'])).toEqual({ noAdapter: ['mass-hole'], noShape: [] })
    expect(adapterGap(['mass', 'mass-hole', 'block-type', 'lot'], ['mass', 'mass-hole', 'block-type'])).toEqual({ noAdapter: [], noShape: ['lot'] })
    expect(adapterGap(['mass'], ['mass'])).toEqual({ noAdapter: [], noShape: [] })
  })
})
