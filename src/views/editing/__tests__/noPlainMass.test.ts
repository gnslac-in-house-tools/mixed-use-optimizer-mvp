// No view and no agent tool makes a plain mass (Phase D.2 task 7, Decision "Draw makes a block"): every building is a block, so the Draw
// tool, the agent's tools and the graph make blocks (`actions.drawBlock`), and every file read migrates. The plain mass stays inside
// the engine: `addMass` and the mass adapter are core verbs the tests' projects (`state/demo.ts`) and the circulation's stress test use.
// What the test scans: every source file under `src/views/`, `src/modules/*/views/` and `src/api/tools/` that is not a test, as text, comments
// left out. Rule: none of them calls `actions.addMass`; an exception would be named below with its reason (`copyMasses`, which copies what is
// there, calls it inside the engine, never as `actions.addMass`).
// The second rule (the review): the verbs that copy or cut a plain mass (`copyMasses`, `copyMass`, `copyMassToLevel`, `splitAtGridLine`) are not
// called from a view or a tool on a block's hall: a block is copied whole (`copyWithBlocks`) and cut in its block editor. The files that call one
// are named below, each with the guard that keeps a block's hall out of it.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(['/src/views/**/*.{ts,tsx}', '/src/modules/*/views/**/*.{ts,tsx}', '/src/api/tools/**/*.{ts,tsx}', '!**/__tests__/**', '!**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * The files that may call `actions.addMass`, each with its reason. None: even the dry run of `checkMasses` and the search of `packMasses` try
 * blocks (`tryMasses` draws them on a copy), so what they say is what the layout placed says.
 */
const EXCEPTIONS: Record<string, string> = {
  // mixed-use-mvp: Uso mixto draws free masses, its tower, podium and core in one building (VENDOR.md)
  '/src/views/plan/tools/DrawMass.tsx': 'addMass while the typology offers the residential module',
}

/** The files that call a verb that copies or cuts a plain mass, each with what keeps a block's hall away from it. */
const MASS_COPIERS: Record<string, string> = {
  '/src/views/panels/Properties.tsx': 'copyMassToLevel: Copy up and Copy down are greyed for a block (blockNoPlainCopies.test.tsx)',
  '/src/views/panels/gridCommands.ts': 'splitAtGridLine: Split is greyed for a block (blockNoPlainCopies.test.tsx)',
  '/src/api/tools/edit.ts': 'copyMass: a block goes through copyWithBlocks (agent tools tests)',
}

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The files that call the verb of a plain mass. */
const callers = (files: Record<string, string>) =>
  Object.entries(files)
    .filter(([, src]) => /\bactions\s*\.\s*addMass\b/.test(code(src)))
    .map(([path]) => path)
    .sort()

/** The files that call a verb that copies or cuts a plain mass. */
const copiers = (files: Record<string, string>) =>
  Object.entries(files)
    .filter(([, src]) => /\bactions\s*\.\s*(?:copyMasses|copyMass|copyMassToLevel|splitAtGridLine)\b/.test(code(src)))
    .map(([path]) => path)
    .sort()

describe('no plain mass from a view or an agent tool', () => {
  it('finds the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    expect(Object.keys(sources).some((p) => p.startsWith('/src/api/tools/'))).toBe(true)
    expect(Object.keys(sources).some((p) => p.startsWith('/src/modules/warehouse/views/'))).toBe(true)
  })

  it('none calls actions.addMass', () => {
    expect(callers(sources)).toEqual(Object.keys(EXCEPTIONS).sort())
  })

  it('a view that calls it is caught (a spoiled copy, in memory: the repository is never touched)', () => {
    const spoiled = { ...sources, '/src/views/plan/tools/DrawMass.tsx': `${sources['/src/views/plan/tools/DrawMass.tsx']}\nconst bad = () => actions.addMass(p, init)\n` }
    expect(callers(spoiled)).toContain('/src/views/plan/tools/DrawMass.tsx')
    const tool = { ...sources, '/src/api/tools/edit.ts': `${sources['/src/api/tools/edit.ts']}\nactions.addMass(p, init)\n` }
    expect(callers(tool)).toContain('/src/api/tools/edit.ts')
  })

  it('a comment that names it is not a call', () => {
    expect(callers({ '/src/views/x.ts': '// actions.addMass is the engine’s\n/* actions.addMass */\n' })).toEqual([])
  })

  it('only the guarded files copy or cut a plain mass (a block is copied whole, copyWithBlocks)', () => {
    expect(copiers(sources)).toEqual(Object.keys(MASS_COPIERS).sort())
  })

  it('a view that copies a hall as a plain mass is caught, and so is each verb (spoiled copies, in memory)', () => {
    for (const verb of ['copyMasses', 'copyMass', 'copyMassToLevel', 'splitAtGridLine']) {
      const spoiled = { ...sources, '/src/views/panels/buildingCommands.ts': `${sources['/src/views/panels/buildingCommands.ts']}
const bad = () => actions.${verb}(p, m)
` }
      expect(copiers(spoiled), verb).toContain('/src/views/panels/buildingCommands.ts')
    }
    expect(copiers({ '/src/views/x.ts': '// actions.copyMasses is the engine’s\n/* actions.copyMass */\nactions.copyWithBlocks(p, m, d, o)\n' })).toEqual([])
  })

  it('the copiers’ guards are still needed (a stale one is dropped)', () => {
    for (const path of Object.keys(MASS_COPIERS)) expect(copiers({ [path]: sources[path] }), path).toEqual([path])
  })

  it('the exceptions are still needed (a stale one is dropped)', () => {
    for (const path of Object.keys(EXCEPTIONS)) expect(callers({ [path]: sources[path] }), path).toEqual([path])
  })
})
