import { describe, expect, it } from 'vitest'
import { buildMap, reachable } from '../map.ts'
import { sources } from '../sources.ts'

const fixture = {
  '/src/main.tsx': `import './styles/tokens.css'\nimport { App } from './App.tsx'\n`,
  '/src/App.tsx': `import { useApp } from './state/store.ts'\nexport function App() {\n  const n = useApp((s) => s.project.name)\n}\n`,
  '/src/state/store.ts': [
    `// views read it: useApp((s) => s.project)  ← a comment, not a read; see http://x.y`,
    `import { create } from 'zustand'`,
    `import type { Project } from '../model/schema.ts'`,
    `import {`,
    `  derive,`,
    `  type Derived,`,
    `} from '../engine/derive.ts'`,
    `export interface AppState {}`,
    `export function createAppStore() {}`,
    `export const useApp = createAppStore()`,
  ].join('\n'),
  '/src/state/actions/masses.ts': `import { type Project } from '../../model/schema.ts'\nexport function addMass() {}\nexport function moveMass() {}\nexport type NewMass = {}\n`,
  '/src/engine/derive.ts': `import { metrics } from './massing/metrics.ts'\nexport function derive() {}\n`,
  '/src/engine/massing/metrics.ts': `import { area } from '../geom/polygon.ts'\nexport function metrics() {}\n`,
  '/src/engine/geom/polygon.ts': `export const area = () => 0\n`,
  '/src/model/schema.ts': `export const ProjectSchema = 1\n`,
  '/src/views/panels/MetricsPanel.tsx': `import { useApp } from '../../state/store.ts'\nexport function MetricsPanel() {\n  const m = useApp((s) => s.derived.metrics)\n  const i = useApp(\n    (state) => state.selection.massId,\n  )\n  const p = useApp((s) => s.derived.issues)\n}\n`,
}

const map = buildMap(fixture)
const node = (id: string) => map.nodes.find((n) => n.id === id)!

describe('buildMap', () => {
  it('one node per file: layer, folder, name, exports (not types), lines', () => {
    expect(map.nodes.map((n) => n.id)).toEqual([
      'App.tsx',
      'engine/derive.ts',
      'engine/geom/polygon.ts',
      'engine/massing/metrics.ts',
      'main.tsx',
      'model/schema.ts',
      'state/actions/masses.ts',
      'state/store.ts',
      'views/panels/MetricsPanel.tsx',
    ])
    expect(node('state/actions/masses.ts')).toMatchObject({ layer: 'state', folder: 'state/actions', name: 'masses.ts', exports: ['addMass', 'moveMass'] })
    expect(node('main.tsx')).toMatchObject({ layer: 'app', folder: '' })
    expect(node('state/store.ts').exports).toEqual(['createAppStore', 'useApp'])
    expect(node('state/store.ts').lines).toBe(10)
  })

  it('imports between files, resolved; type-only ones marked; packages and css left out', () => {
    const from = (id: string) => map.edges.filter((e) => e.from === id).map((e) => `${e.to}${e.typeOnly ? ' (type)' : ''}`)
    expect(from('main.tsx')).toEqual(['App.tsx'])
    expect(from('state/store.ts')).toEqual(['model/schema.ts (type)', 'engine/derive.ts'])
    expect(from('state/actions/masses.ts')).toEqual(['model/schema.ts (type)']) // { type X } only
    expect(from('engine/massing/metrics.ts')).toEqual(['engine/geom/polygon.ts'])
  })

  it('which store slices a view subscribes to', () => {
    expect(node('views/panels/MetricsPanel.tsx').reads).toEqual(['derived', 'selection'])
    expect(node('App.tsx').reads).toEqual(['project'])
    expect(node('state/store.ts').reads).toEqual([])
  })

  it('reachable: the engine layer follows a module’s engine (modules/<id>/engine/)', () => {
    const m = buildMap({
      '/src/modules/x/actions.ts': `import { y } from './engine/y.ts'
export function setLevel() {}
`,
      '/src/modules/x/engine/y.ts': `import { area } from '../../../engine/geom/polygon.ts'
export function y() {}
`,
      '/src/modules/x/module.ts': `import { setLevel } from './actions.ts'
export const x = 1
`,
      '/src/engine/geom/polygon.ts': `export const area = () => 0
`,
    })
    expect([...reachable(m, 'modules/x/actions.ts', 'engine')].sort()).toEqual(['engine/geom/polygon.ts', 'modules/x/engine/y.ts'])
    expect([...reachable(m, 'modules/x/module.ts', 'engine')]).toEqual([]) // actions.ts is not the engine: the walk stops there
  })

  it('reachable: runtime imports, transitively, inside one layer', () => {
    expect([...reachable(map, 'engine/derive.ts', 'engine')].sort()).toEqual(['engine/geom/polygon.ts', 'engine/massing/metrics.ts'])
    expect([...reachable(map, 'state/store.ts', 'model')]).toEqual([]) // type-only: not at runtime
  })
})

describe('sources (the real app, through import.meta.glob)', () => {
  const real = buildMap(sources)

  it('sees the app but not tests or the dev tool itself', () => {
    const ids = real.nodes.map((n) => n.id)
    expect(ids).toContain('state/store.ts')
    expect(ids).toContain('engine/derive.ts')
    expect(ids.some((id) => id.includes('__tests__') || id.startsWith('devtools/'))).toBe(false)
  })

  it('the action modules list their verbs, and panels their slices', () => {
    const masses = real.nodes.find((n) => n.id === 'state/actions/masses.ts')!
    expect(masses.exports).toEqual(expect.arrayContaining(['addMass', 'moveMass', 'rotateMass']))
    const metrics = real.nodes.find((n) => n.id === 'views/panels/SummaryPanel.tsx')!
    expect(metrics.reads).toContain('derived')
  })
})
