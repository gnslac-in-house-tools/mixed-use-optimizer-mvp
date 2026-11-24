// The bridge, measured (Phase AS.4 task 4, Decision "The bridge, measured"): "nothing outside the bridge reads the stores to know what is picked" is held for what asks across
// kinds. No file but `views/plan/mix.ts` imports two or more of the seven selection hooks: `useApp`'s selection, `useRoads`, `useLots`, `useAccess`, `useDimensions`,
// `useAnnotations` (the reference lines' and the notes', Phase AS.5), `useDrawingPick`. A kind's own layer and commands keep reading their own store (one hook), and what asks of several asks the bridge (`pickedRefs`, `usePickedRefs`,
// `pickedNow`, `pickRefs`…): Layers' tab does since task 5. How a file is counted:
//   - the six stores' hooks count when the file imports them by name (a type import is not a read, nor a name that only a comment says);
//   - `useApp` is every file's store, so it counts only when the file reads the mass selection from it: a `.selection` access on the app's state, or `selection` destructured from it.
// The exceptions are listed below with the reason, each a file that cannot ask the bridge: the stores and the subscriptions that keep them in step (the bridge is made of
// them). Nothing else may be added without a reason; the list shrinks.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!**/__tests__/**', '!**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

const BRIDGE = '/src/views/plan/mix.ts'
const STORE_HOOKS = ['useRoads', 'useLots', 'useAccess', 'useDimensions', 'useAnnotations', 'useDrawingPick']

/** The files that import two or more of the hooks and why they cannot ask the bridge instead. */
const EXCEPTIONS: Record<string, string> = {
  '/src/views/plan/circulation/roadState.ts': 'the streets’ own store: it lets the dimensions go when a street is picked alone, so it names both (the bridge is made of these stores)',
  '/src/modules/parking/views/lotState.ts': 'the lots’ own store: it lets the masses, dimensions, streets and gates go when a lot is picked alone (one kind at a time)',
  '/src/views/plan/access/accessState.ts': 'the access’s own store: it lets the masses, streets and dimensions go when a gate is picked alone (one kind at a time)',
  '/src/views/editing/path/pathState.ts': 'the path handles’ pick: they stand on a street (the streets’ store) or an existing street (the access’s), so it names both',
  '/src/views/layers/layerPick.ts': 'Layers’ row pick: a subscription to every store (the reference lines’ and notes’ too), so a row lets go of every object and any object lets the row go (what the bridge’s `letGoAll` cannot see)',
  '/src/views/layers/letGo.ts': 'the one subscription that lets go of what an eye hides or a padlock takes (it is loaded by the bridge and reads the stores it prunes)',
}

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const importedNames = (src: string): string[] =>
  [...code(src).matchAll(/import\s+(?!type\b)\{([^}]*)\}\s*from/g)].flatMap((m) => m[1].split(',').map((n) => n.trim().replace(/^type\s+.*/, '').replace(/\s+as\s+\w+$/, '')))

/** The selection hooks a file counts for: the six stores it imports, and `useApp` when it reads the mass selection. */
function hooksRead(src: string): string[] {
  const names = importedNames(src)
  const stores = STORE_HOOKS.filter((h) => names.includes(h))
  const c = code(src)
  const readsSelection = /\.selection\b/.test(c) || /\{[^}]*\bselection\b[^}]*\}\s*=\s*\w+/.test(c)
  return names.includes('useApp') && readsSelection ? [...stores, 'useApp (selection)'] : stores
}

describe('the bridge of the selection stores', () => {
  const files = Object.entries(sources).filter(([path]) => path !== BRIDGE)

  it('only views/plan/mix.ts imports two or more of the seven selection hooks, but the listed files', () => {
    const offenders = files.filter(([path, src]) => hooksRead(src).length >= 2 && !(path in EXCEPTIONS)).map(([path, src]) => `${path}: ${hooksRead(src).join(', ')}`)
    expect(offenders).toEqual([])
  })

  it('a file on the list still needs to be there: one that no longer breaks the rule is taken off', () => {
    for (const path of Object.keys(EXCEPTIONS)) {
      expect(sources[path], `${path} does not exist`).toBeDefined()
      expect(hooksRead(sources[path]).length, `${path} no longer imports two hooks: take it off the list`).toBeGreaterThanOrEqual(2)
    }
  })

  it('the bridge is the one that imports them all', () => {
    expect(hooksRead(sources[BRIDGE]).length).toBe(7)
  })

  it('every exception has a reason of one line', () => {
    for (const [path, why] of Object.entries(EXCEPTIONS)) expect(why.length, path).toBeGreaterThan(20)
  })

  it('counts as the test says: a comment is not an import, a type is not a read, useApp counts only for its selection', () => {
    expect(hooksRead("import { useRoads } from './a'\nimport { useLots } from './b'")).toEqual(['useRoads', 'useLots'])
    expect(hooksRead("// import { useRoads } from './a'\nimport { useLots } from './b'")).toEqual(['useLots'])
    expect(hooksRead("import { useApp } from './s'\nconst s = useApp((x) => x.project)")).toEqual([])
    expect(hooksRead("import { useApp } from './s'\nimport { useLots } from './b'\nconst s = useApp((x) => x.selection.massIds)")).toEqual(['useLots', 'useApp (selection)'])
    expect(hooksRead("import { useApp } from './s'\nconst { selection } = useApp.getState()")).toEqual(['useApp (selection)'])
    expect(hooksRead("import type { useRoads } from './a'\nimport { useLots } from './b'")).toEqual(['useLots'])
  })
})
