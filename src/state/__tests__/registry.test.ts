// Guards for the state graph: every verb goes through `actions` (state/actions/index.ts), so none runs untraced.
import { describe, expect, it } from 'vitest'
import { actions } from '../actions/index.ts'
import { demoProject } from '../demo.ts'
import { recordCalls } from '../trace/calls.ts'

// the verb modules: state/actions/*.ts, and each module's actions.ts (src/modules/<id>/, Decision "Catalog")
const modules = import.meta.glob<Record<string, unknown>>(['../actions/*.ts', '../../modules/*/actions.ts'], { eager: true })
const views = import.meta.glob<string>(['/src/views/**/*.{ts,tsx}', '/src/modules/*/views/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })

describe('actions registry', () => {
  it('registers every verb of every action module', () => {
    const missing: string[] = []
    for (const [path, m] of Object.entries(modules)) {
      if (path.endsWith('/index.ts')) continue
      for (const [name, value] of Object.entries(m)) {
        if (typeof value === 'function' && !(name in actions)) missing.push(`${path}: ${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('each module is labelled with its own path, so the state graph finds its node', () => {
    const p = demoProject()
    for (const [path, m] of Object.entries(modules)) {
      if (path.endsWith('/index.ts')) continue
      const name = Object.keys(m).find((k) => typeof m[k] === 'function')!
      const verb = (actions as Record<string, (...args: unknown[]) => unknown>)[name]
      const { calls } = recordCalls(() => {
        try {
          verb(p) // missing args may throw: the call is recorded before it runs
        } catch {
          /* only the label matters */
        }
      })
      // '../actions/masses.ts' → 'state/actions/masses'; '../../modules/terrain/actions.ts' → 'modules/terrain/actions'
      expect(calls[0].module).toBe(path.replace(/^\.\.\/\.\.\//, '').replace(/^\.\.\//, 'state/').replace(/\.ts$/, ''))
    }
  })

  it('views import verbs only through the registry', () => {
    const direct = Object.entries(views)
      .filter(([, src]) => /from '[./]*state\/actions\/(?!index\.ts')[^']+'|from '[./]*modules\/[^/]+\/actions\.ts'/.test(src))
      .map(([path]) => path)
    expect(direct).toEqual([])
  })
})
