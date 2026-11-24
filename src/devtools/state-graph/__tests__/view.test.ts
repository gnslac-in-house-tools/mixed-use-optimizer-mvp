import { describe, expect, it } from 'vitest'
import { STORE, type Activity } from '../flow.ts'
import { layout } from '../layout.ts'
import { buildMap } from '../map.ts'
import { groupable, SHOW_ALL, shown } from '../view.ts'

const map = buildMap({
  '/src/App.tsx': `import { Plan } from './views/plan/Plan.tsx'\nexport function App() {}\n`,
  '/src/views/plan/Plan.tsx': `import { useApp } from '../../state/store.ts'\nimport { snap } from './snap/snap.ts'\nexport function Plan() {\n  const s = useApp((s) => s.selection)\n}\n`,
  '/src/views/plan/snap/snap.ts': `import { area } from '../../../engine/geom/polygon.ts'\nexport function snap() {}\n`,
  '/src/views/panels/Summary.tsx': `import { useApp } from '../../state/store.ts'\nexport function Summary() {\n  const d = useApp((s) => s.derived)\n}\n`,
  '/src/state/store.ts': `import { derive } from '../engine/derive.ts'\nimport { moveMass } from './actions/masses.ts'\nexport const useApp = 1\n`,
  '/src/state/actions/masses.ts': `export function moveMass() {}\n`,
  '/src/engine/derive.ts': `import { area } from './geom/polygon.ts'\nexport function derive() {}\n`,
  '/src/engine/geom/polygon.ts': `export const area = () => 0\n`,
})

// a drag in the plan: Plan → store → moveMass, derive (which loads polygon); Plan and Summary read the new data
const PLAN = 'views/plan/Plan.tsx'
const SUMMARY = 'views/panels/Summary.tsx'
const act: Activity = {
  roles: new Map([
    [PLAN, 'origin'],
    [STORE, 'store'],
    ['state/actions/masses.ts', 'verb'],
    ['engine/derive.ts', 'engine'],
    ['engine/geom/polygon.ts', 'reach'],
    [SUMMARY, 'reader'],
  ]),
  verbs: new Map([['state/actions/masses.ts', ['moveMass']]]),
  flows: [
    { from: PLAN, to: STORE, kind: 'call' },
    { from: STORE, to: 'state/actions/masses.ts', kind: 'call' },
    { from: STORE, to: 'engine/derive.ts', kind: 'engine' },
    { from: STORE, to: PLAN, kind: 'data' },
    { from: STORE, to: SUMMARY, kind: 'data' },
  ],
}

const ids = (v: ReturnType<typeof shown>) => v.map.nodes.map((n) => n.id).sort()
const pairs = (v: ReturnType<typeof shown>) => v.map.edges.map((e) => `${e.from} > ${e.to}`).sort()

describe('shown', () => {
  it('shows everything by default, as it is', () => {
    const v = shown(map, act, SHOW_ALL)
    expect(v.map).toEqual(map)
    expect(v.act!.flows.map(({ from, to, kind }) => ({ from, to, kind }))).toEqual(act.flows)
  })

  it('a hidden layer leaves with its imports and the arrows to it', () => {
    const v = shown(map, act, { ...SHOW_ALL, hidden: ['engine'] })
    expect(ids(v)).not.toContain('engine/derive.ts')
    expect(ids(v)).toHaveLength(6)
    expect(pairs(v)).not.toContain(`${STORE} > engine/derive.ts`)
    expect(v.act!.flows.some((f) => f.to === 'engine/derive.ts')).toBe(false)
    expect(v.act!.roles.has('engine/derive.ts')).toBe(false)
  })

  it('the engine layer also holds the modules’ engines; the modules layer hides the whole folder', () => {
    const m = buildMap({
      '/src/engine/derive.ts': `export function derive() {}
`,
      '/src/modules/x/engine/y.ts': `export function y() {}
`,
      '/src/modules/x/actions.ts': `export function setLevel() {}
`,
    })
    expect(ids(shown(m, null, { ...SHOW_ALL, hidden: ['engine'] }))).toEqual(['modules/x/actions.ts'])
    expect(ids(shown(m, null, { ...SHOW_ALL, hidden: ['modules'] }))).toEqual(['engine/derive.ts'])
  })

  it('a grouped folder is one card: what is in it, the strongest role, arrows onto it', () => {
    const v = shown(map, act, { ...SHOW_ALL, grouped: ['views/plan'] })
    const card = v.map.nodes.find((n) => n.id === 'views/plan/')!
    expect(card).toMatchObject({ layer: 'views', folder: 'views', name: 'plan/', reads: ['selection'] })
    expect(card.exports).toEqual(['Plan.tsx', 'snap/']) // its files and sub-folders; the ones that ran first
    expect(v.members.get('views/plan/')).toEqual([PLAN, 'views/plan/snap/snap.ts'])
    expect(v.alias.get('views/plan/snap/snap.ts')).toBe('views/plan/')
    expect(v.act!.roles.get('views/plan/')).toBe('origin')
    expect(v.act!.verbs.get('views/plan/')).toEqual(['Plan.tsx'])
    // App → Plan ends on the card; Plan → snap is inside it and goes
    expect(pairs(v)).toContain('App.tsx > views/plan/')
    expect(pairs(v)).toContain('views/plan/ > engine/geom/polygon.ts')
    expect(pairs(v).some((p) => p === 'views/plan/ > views/plan/')).toBe(false)
  })

  it('arrows onto the same card merge and keep what they stand for; the outer folder wins', () => {
    const v = shown(map, act, { ...SHOW_ALL, grouped: ['views/plan', 'views'] })
    expect(ids(v)).toEqual(['App.tsx', 'engine/derive.ts', 'engine/geom/polygon.ts', 'state/actions/masses.ts', STORE, 'views/'])
    const data = v.act!.flows.filter((f) => f.to === 'views/')
    expect(data).toEqual([{ from: STORE, to: 'views/', kind: 'data', parts: [{ from: STORE, to: PLAN }, { from: STORE, to: SUMMARY }] }])
    expect(v.map.nodes.find((n) => n.id === 'views/')).toMatchObject({ folder: 'views', exports: ['panels/', 'plan/'] })
  })

  it('a card of the store and its verbs has no arrow to itself', () => {
    const v = shown(map, act, { ...SHOW_ALL, grouped: ['state'] })
    expect(v.act!.flows.map((f) => `${f.from} > ${f.to}`)).toEqual(['views/plan/Plan.tsx > state/', 'state/ > engine/derive.ts', 'state/ > views/plan/Plan.tsx', 'state/ > views/panels/Summary.tsx'])
  })

  it('only the event: what the event touched stays (not what it merely loaded), and the layout packs it', () => {
    const v = shown(map, act, { ...SHOW_ALL, only: true })
    expect(ids(v)).toEqual(['engine/derive.ts', 'state/actions/masses.ts', STORE, SUMMARY, PLAN].sort())
    expect(pairs(v)).not.toContain('App.tsx > views/plan/Plan.tsx')
    expect(layout(v.map).positions.size).toBe(5)
    // with no event on display there is nothing to keep to
    expect(ids(shown(map, null, { ...SHOW_ALL, only: true }))).toHaveLength(map.nodes.length)
  })

  it('"Group folders" makes a card of each folder under a layer', () => {
    expect(groupable(map)).toEqual(['engine/geom', 'state/actions', 'views/panels', 'views/plan'])
  })
})
