// One On edge engine, guarded (Phase D.3 task 10, Decision "On edge engine"): docks, doors and patterns are put, painted and slid by one set of views, `views/editing/edge/`, on the
// site and in the block editor, through `actions.edgeOf` and `actions.editEdge`. What the test scans: every source file of `src/` that is not a test, as text, comments left out.
//   1. `BlockSitePress` and its file are gone; no view names it.
//   2. Outside `views/editing/edge/`, no view calls the verbs that put or slide elements on a press (`putElements`, `slideElements`, `putCopyElements`): the tours and the module's
//      `commands.ts` (which defines them for the tours) are the named exceptions. A press goes through `EdgeHandles`.
//   3. A module's views import neither `state/actions/onEdge.ts` nor `engine/edge/`: they give the engine a host (`blockEdgeHost.ts`), and it does the edit.
//   4. `views/editing/edge/` edits only through `actions.editEdge`: it imports no module’s actions or commands, and every drag it starts calls `beginDrag`; the slide and the pills are typed (`startTyped`).
//   5. The block editor’s plan (`WarehousePlan.tsx`) binds no element press of its own: it names neither `elementPress` nor `paintModules`.
//   6. (Phase PE.2) A gate slides on its side through `views/editing/edge/gateSlide.ts`: `startGateDrag` is named nowhere; outside `views/editing/edge/` no view calls `actions.updateGate`
//      with `t` or `on` (where a gate stands is the engine's); the gate's square in `AccessLayer.tsx` binds `startGateSlide` and nothing else.
// Each rule is a function of text, and the last block feeds each one a spoiled copy of a source, in memory, to show it bites.
import { describe, expect, it } from 'vitest'
import { posix } from 'node:path'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**', '!**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\r\n/g, '\n')
const specifiersOf = (path: string, src: string): string[] =>
  [...code(src).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => (m[1].startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), m[1])).replace(/\.tsx?$/, '') : m[1]))

const inViews = (path: string) => path.startsWith('/src/views/') || /^\/src\/modules\/[^/]+\/views\//.test(path)
const inModuleViews = (path: string) => /^\/src\/modules\/[^/]+\/views\//.test(path)
const inEdge = (path: string) => path.startsWith('/src/views/editing/edge/')
const all = Object.entries(sources)

// ---- 1 ----
const pressNamers = (files: [string, string][]) => files.filter(([, src]) => /\bBlockSitePress\b/.test(code(src))).map(([path]) => path)

// ---- 2 ----
const PRESS_VERBS = /\b(?:putElements|slideElements|putCopyElements)\b/
const VERB_EXCEPTIONS: Record<string, string> = {
  '/src/modules/warehouse/views/commands.ts': 'defines the verbs the tours call; nothing in a view calls them on a press',
  '/src/views/tour/zero/block.ts': 'the block tour puts docks as the tour’s step (not a press)',
  '/src/views/tour/zero/onSite.ts': 'the site tour puts docks as the tour’s step (not a press)',
}
const verbCallers = (files: [string, string][]) => files.filter(([path, src]) => inViews(path) && !inEdge(path) && !(path in VERB_EXCEPTIONS) && PRESS_VERBS.test(code(src))).map(([path]) => path)

// ---- 3 ----
const reachesEdgeEngine = (files: [string, string][]) =>
  files.filter(([path, src]) => inModuleViews(path) && specifiersOf(path, src).some((s) => s === '/src/state/actions/onEdge' || s.startsWith('/src/engine/edge/'))).map(([path]) => path)

// ---- 4 ----
const edgeFiles = (files: [string, string][]) => files.filter(([path]) => inEdge(path))
const edgeImportsModules = (files: [string, string][]) => edgeFiles(files).filter(([path, src]) => specifiersOf(path, src).some((s) => s.startsWith('/src/modules/') &&!s.startsWith('/src/modules/catalog'))).map(([path]) => path)
const handles = (files: [string, string][]) => files.find(([path]) => path === '/src/views/editing/edge/EdgeHandles.tsx')?.[1] ?? ''
const dragStartsWithoutBegin = (src: string): boolean => {
  const t = code(src)
  const starts = [...t.matchAll(/\bsetPaint\(\{|\bsetSlide\(\{|\bsetPill\(\{/g)].length
  const begins = [...t.matchAll(/\bbeginDrag\(/g)].length
  return starts > 0 && begins === 0
}
const slideUntyped = (src: string): boolean => !/\bstartTyped\(/.test(code(src))
/** Each drag starter begins its drag and the two that move a value (the slide, a pill) type it: three `beginDrag`, two `startTyped`, no more and no fewer, so taking one out of one starter is seen. */
const STARTERS = { beginDrag: 3, startTyped: 2 }
const startersOff = (src: string): string[] => {
  const t = code(src)
  return Object.entries(STARTERS).flatMap(([name, n]) => ([...t.matchAll(new RegExp(`\\b${name}\\(`, 'g'))].length === n ? [] : [name]))
}
/** Only the On edge views write an element edit: no other view calls `actions.editEdge` (the plan's Delete asks `takePicked.ts`). */
const editEdgeCallers = (files: [string, string][]) => files.filter(([path, src]) => inViews(path) && !inEdge(path) && /\bactions\.editEdge\b/.test(code(src))).map(([path]) => path)
const editsOutsideEngine = (files: [string, string][]) => edgeFiles(files).filter(([, src]) => /\bactions\.(?:putElements|slideElements|setElementsWidth|putCopyElements)\b/.test(code(src))).map(([path]) => path)

// ---- 5 ----
const PLAN = '/src/modules/warehouse/views/WarehousePlan.tsx'
const planPresses = (src: string): boolean => /\b(?:elementPress|paintModules)\b/.test(code(src))

// ---- 6 ----
const ACCESS_LAYER = '/src/views/plan/access/AccessLayer.tsx'
const gateDragNamers = (files: [string, string][]) => files.filter(([, src]) => /\bstartGateDrag\b/.test(code(src))).map(([path]) => path)
const gatePlacers = (files: [string, string][]) => files.filter(([path, src]) => inViews(path) && !inEdge(path) && /\bactions\.updateGate\([^)]*[{,]\s*(?:t|on)\s*[:,}]/.test(code(src))).map(([path]) => path)
/** What the gate's square binds in a file: the function each `drag.bind(`gate-…`, f(…))` calls. */
const gateBinds = (src: string): string[] => [...code(src).matchAll(/drag\.bind\(\s*`gate-[^`]*`\s*,\s*([A-Za-z]\w*)\(/g)].map((m) => m[1])

describe('one On edge engine', () => {
  it('finds the sources it guards', () => {
    expect(sources[PLAN]).toBeDefined()
    expect(sources['/src/views/editing/edge/EdgeHandles.tsx']).toBeDefined()
    expect(sources['/src/views/editing/edge/host.ts']).toBeDefined()
    expect(sources['/src/modules/warehouse/views/blockEdgeHost.ts']).toBeDefined()
  })

  it('rule 1: BlockSitePress is gone', () => {
    expect(sources['/src/modules/warehouse/views/BlockSiteTools.tsx']).toBeUndefined()
    expect(pressNamers(all)).toEqual([])
  })

  it('rule 2: no view calls the verbs of a press outside the On edge views, but the named ones', () => {
    expect(verbCallers(all)).toEqual([])
  })

  it('rule 3: a module’s views reach neither state/actions/onEdge.ts nor engine/edge/', () => {
    expect(reachesEdgeEngine(all)).toEqual([])
  })

  it('rule 4: the On edge views edit through editEdge alone; every drag begins with beginDrag; the slide is typed', () => {
    expect(editsOutsideEngine(all)).toEqual([])
    expect(edgeImportsModules(all)).toEqual([])
    expect(dragStartsWithoutBegin(handles(all))).toBe(false)
    expect(slideUntyped(handles(all))).toBe(false)
    expect(startersOff(handles(all))).toEqual([])
    expect(editEdgeCallers(all)).toEqual([])
  })

  it('rule 5: the block editor’s plan names no element press', () => {
    expect(planPresses(sources[PLAN])).toBe(false)
  })

  it('rule 6: a gate slides through startGateSlide; no view outside the On edge views writes where a gate stands', () => {
    expect(sources['/src/views/editing/edge/gateSlide.ts']).toBeDefined()
    expect(gateDragNamers(all)).toEqual([])
    expect(gatePlacers(all)).toEqual([])
    expect(gateBinds(sources[ACCESS_LAYER])).toEqual(['startGateSlide'])
  })

  it('every rule bites on a spoiled copy, in memory', () => {
    const spoiledPlan = `${sources[PLAN]}\nconst x = () => putElements(t.id, 'dock', 'e1', [1], true)\n`
    expect(verbCallers([[PLAN, spoiledPlan]])).toEqual([PLAN])
    expect(pressNamers([[PLAN, `${sources[PLAN]}\nimport { BlockSitePress } from './BlockSiteTools.tsx'`]])).toEqual([PLAN])
    expect(reachesEdgeEngine([['/src/modules/warehouse/views/Spoiled.tsx', "import { editEdge } from '../../../state/actions/onEdge.ts'"]])).toEqual(['/src/modules/warehouse/views/Spoiled.tsx'])
    expect(reachesEdgeEngine([['/src/modules/warehouse/views/Spoiled.tsx', "import type { EdgeOp } from '../../../engine/edge/onEdge.ts'"]])).toEqual(['/src/modules/warehouse/views/Spoiled.tsx'])
    expect(editsOutsideEngine([['/src/views/editing/edge/X.tsx', 'actions.slideElements(p, id, ids, 1)']])).toEqual(['/src/views/editing/edge/X.tsx'])
    expect(dragStartsWithoutBegin('setPaint({ edge })')).toBe(true)
    expect(slideUntyped('setSlide({ el })')).toBe(true)
    expect(startersOff(handles(all).replace(/startTyped\(/, 'startedTyping('))).toEqual(['startTyped'])
    expect(startersOff(`${handles(all)}\nbeginDrag(e)`)).toEqual(['beginDrag'])
    expect(editEdgeCallers([['/src/views/plan/Spoiled.ts', 'actions.editEdge(p, ref, op)']])).toEqual(['/src/views/plan/Spoiled.ts'])
    expect(planPresses(`${sources[PLAN]}\nelementPress(g)`)).toBe(true)
    expect(gateDragNamers([[ACCESS_LAYER, `${sources[ACCESS_LAYER]}\nimport { startGateDrag } from './accessCommands.ts'`]])).toEqual([ACCESS_LAYER])
    expect(gatePlacers([['/src/views/plan/access/Spoiled.ts', 'actions.updateGate(p, option, id, { t })']])).toEqual(['/src/views/plan/access/Spoiled.ts'])
    expect(gatePlacers([['/src/views/plan/access/Spoiled.ts', 'actions.updateGate(p, option, id, { on: home })']])).toEqual(['/src/views/plan/access/Spoiled.ts'])
    expect(gatePlacers([['/src/views/editing/edge/gateSlide.ts', 'actions.updateGate(p, option, id, { t })']])).toEqual([])
    expect(gatePlacers([['/src/views/panels/Fine.tsx', 'actions.updateGate(p, option, id, patch)']])).toEqual([])
    expect(gateBinds(sources[ACCESS_LAYER].replace('startGateSlide(g.id', 'startGateDrag(g.id'))).toEqual(['startGateDrag'])
    expect(gateBinds(`${sources[ACCESS_LAYER]}\n{...drag.bind(\`gate-x\`, startOther(1))}`)).toEqual(['startGateSlide', 'startOther'])
  })
})
