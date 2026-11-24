import { afterAll, describe, expect, it } from 'vitest'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { createAppStore } from '../../../state/store.ts'
import { subscribe } from '../../../state/trace/bus.ts'
import type { TraceEvent } from '../../../state/trace/tracer.ts'
import { activity, heat, nodeOf, STORE } from '../flow.ts'
import { layout, NODE_W, nodeHeight } from '../layout.ts'
import { buildMap } from '../map.ts'
import { sources } from '../sources.ts'

const map = buildMap(sources)

// real events from a real store, as the app would send them
const events: TraceEvent[] = []
const off = subscribe((e) => events.push(e))
afterAll(off)
const s = createAppStore(demoProject())
s.getState().preview((p) => actions.moveMass(p, 'm1', { x: 5, y: 0 }))
s.getState().commit()
s.getState().select('m2')
const [drag, commit, select] = events.map((e) => ({ ...e, origin: 'views/plan/editing.ts' }))

describe('activity', () => {
  it('a drag step: view → store → verb module and engine; their engine imports; the views that read the new data', () => {
    const a = activity(drag, map)
    expect(a.roles.get('views/plan/editing.ts')).toBe('origin')
    expect(a.roles.get(STORE)).toBe('store')
    expect(a.roles.get('state/actions/masses.ts')).toBe('verb')
    expect(a.roles.get('engine/derive.ts')).toBe('engine')
    expect(a.roles.get('engine/massing/checks.ts')).toBe('reach') // derive loads it
    expect(a.roles.get('views/panels/SummaryPanel.tsx')).toBe('reader') // reads derived
    expect(a.verbs.get('state/actions/masses.ts')).toEqual(['moveMass'])
    expect(a.flows).toEqual(
      expect.arrayContaining([
        { from: 'views/plan/editing.ts', to: STORE, kind: 'call' },
        { from: STORE, to: 'state/actions/masses.ts', kind: 'call' },
        { from: STORE, to: 'engine/derive.ts', kind: 'engine' },
        { from: STORE, to: 'views/panels/SummaryPanel.tsx', kind: 'data' },
      ]),
    )
  })

  it('commit runs nothing and select only reaches the views that read the selection', () => {
    expect(commit.calls).toEqual([])
    const a = activity(select, map)
    expect([...a.roles.values()]).not.toContain('engine')
    expect(a.roles.get('views/panels/SummaryPanel.tsx')).toBeUndefined()
    const readers = [...a.roles].filter(([, r]) => r === 'reader').map(([id]) => id)
    expect(readers.length).toBeGreaterThan(0)
    for (const id of readers) expect(map.nodes.find((n) => n.id === id)!.reads).toContain('selection')
  })

  it('a rejected preview: the call arrow says so', () => {
    expect(activity({ ...drag, rejected: true }, map).flows[0]).toEqual({ from: 'views/plan/editing.ts', to: STORE, kind: 'reject' })
  })

  it('every module the tracer names has a node (labels match files)', () => {
    for (const e of events) for (const c of e.calls) expect(nodeOf(map, c.module)).not.toBeNull()
  })

  it('heat counts the events that touched a module', () => {
    const h = heat([drag, select], map)
    expect(h.get(STORE)).toBe(2)
    expect(h.get('state/actions/masses.ts')).toBe(1)
  })
})

describe('a module’s engine (Decision "Catalog")', () => {
  // a verb in modules/x/actions.ts loads modules/x/engine/y.ts, which loads the core's engine/geom/polygon.ts
  const m = buildMap({
    '/src/state/store.ts': `export const useApp = 1
`,
    '/src/modules/x/actions.ts': `import { levelOf } from './engine/y.ts'
export function setLevel() {}
`,
    '/src/modules/x/engine/y.ts': `import { area } from '../../../engine/geom/polygon.ts'
import { deep } from './z.ts'
export function levelOf() {}
`,
    '/src/modules/x/engine/z.ts': `export const deep = 1
`,
    '/src/modules/x/module.ts': `export const x = 1
`,
    '/src/engine/geom/polygon.ts': `export const area = () => 0
`,
  })
  const e: TraceEvent = { ...drag, calls: [{ ...drag.calls[0], module: 'modules/x/actions', name: 'setLevel' }] }

  it('a verb of a module lights the module’s engine and the core engine files it loads', () => {
    const a = activity(e, m)
    expect(a.roles.get('modules/x/actions.ts')).toBe('verb')
    expect(a.roles.get('modules/x/engine/y.ts')).toBe('reach')
    expect(a.roles.get('modules/x/engine/z.ts')).toBe('reach')
    expect(a.roles.get('engine/geom/polygon.ts')).toBe('reach')
    expect(a.roles.has('modules/x/module.ts')).toBe(false) // not the engine: nothing loads it
  })

  it('a call named for a module’s engine file is an engine call, not a verb', () => {
    const a = activity({ ...e, calls: [{ ...e.calls[0], module: 'modules/x/engine/y', name: 'levelOf' }] }, m)
    expect(a.roles.get('modules/x/engine/y.ts')).toBe('engine')
    expect(a.flows).toContainEqual({ from: STORE, to: 'modules/x/engine/y.ts', kind: 'engine' })
  })
})

describe('layout', () => {
  const { positions, folders } = layout(map)

  it('every module has a place; layers are columns in data-flow order', () => {
    expect(positions.size).toBe(map.nodes.length)
    const col = (id: string) => positions.get(id)!.column
    expect(col('App.tsx')).toBeLessThan(col('views/plan/editing.ts'))
    expect(col('views/plan/editing.ts')).toBeLessThan(col(STORE))
    expect(col(STORE)).toBeLessThan(col('engine/derive.ts'))
    expect(folders.some((f) => f.folder === 'views/plan/snap')).toBe(true)
  })

  it('no two modules overlap, and a tall layer wraps instead of growing past ~1100 px', () => {
    const boxes = map.nodes.map((n) => ({ ...positions.get(n.id)!, h: nodeHeight(n) }))
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b) continue
        const apart = a.x + NODE_W <= b.x || b.x + NODE_W <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
        expect(apart).toBe(true)
      }
    const views = map.nodes.filter((n) => n.layer === 'views').map((n) => positions.get(n.id)!)
    expect(new Set(views.map((p) => p.x)).size).toBeGreaterThan(1)
    for (const b of boxes) expect(b.y).toBeLessThan(1400)
  })
})
