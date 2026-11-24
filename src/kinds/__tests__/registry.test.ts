// The kinds' registry (Phase AS.4, Decision "Kinds"): every kind of the plan's table with its id, label, plural label, group
// and the base verbs it takes; a module's kinds come through the catalog, listed while the project's typology offers the
// module; the *Kinds* table of docs/ARCHITECTURE.md says what the registry says; `src/kinds/` is pure.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../state/demo.ts'
import { blank } from '../../typologies/blank.ts'
import { newProject, TYPOLOGIES } from '../../typologies/index.ts'
import { kindOf, kinds, kindsOfGroup, ownVerbsOf } from '../index.ts'
import type { BaseVerb, LayerGroup } from '../types.ts'

const sources = import.meta.glob<string>(['/src/kinds/**/*.{ts,tsx}', '!**/__tests__/**'], { query: '?raw', import: 'default', eager: true })

/** The base verbs each kind takes (the plan's table, *Base verbs by kind*: a new cell counts as taken). */
const BASE: Record<string, BaseVerb[]> = {
  mass: ['rename', 'duplicate', 'copy', 'delete', 'select-all', 'lock', 'hide', 'properties'],
  'mass-hole': [],
  building: ['rename', 'delete', 'select-all', 'lock', 'hide', 'properties'],
  level: ['rename', 'delete', 'lock', 'properties'],
  street: ['copy', 'delete', 'select-all', 'lock', 'hide', 'properties'],
  'existing-road': ['rename', 'copy', 'delete', 'select-all', 'lock', 'hide', 'properties'],
  gate: ['delete', 'select-all', 'lock', 'hide', 'properties'],
  lot: ['rename', 'delete', 'select-all', 'lock', 'hide', 'properties'],
  dimension: ['delete', 'select-all', 'hide', 'properties'],
  'reference-line': ['delete', 'select-all', 'lock', 'hide', 'properties'],
  note: ['rename', 'delete', 'select-all', 'lock', 'hide', 'properties'],
  boundary: [],
  drawing: ['delete', 'lock', 'hide', 'properties'],
  'drawing-layer': ['lock', 'hide', 'properties'],
  parcels: ['lock', 'hide', 'properties'],
  grid: ['hide', 'properties'],
  'block-type': ['rename', 'duplicate', 'delete', 'select-all'],
  zone: [],
  hole: [],
  court: [],
  'block-court': [],
  element: [],
  edge: [],
}
const GROUPS: Record<string, LayerGroup | null> = {
  mass: 'buildings',
  'mass-hole': null,
  building: 'buildings',
  level: 'buildings',
  street: 'circulation',
  'existing-road': 'site',
  gate: 'circulation',
  lot: 'parking',
  dimension: 'annotations',
  'reference-line': 'reference',
  note: 'annotations',
  boundary: null,
  drawing: 'site',
  'drawing-layer': 'site',
  parcels: 'site',
  grid: 'reference',
  'block-type': null,
  zone: null,
  hole: null,
  court: null,
  'block-court': null,
  element: null,
  edge: null,
}

describe('the kinds’ registry', () => {
  it('has every kind of the plan’s table, with its group and the base verbs it takes', () => {
    expect(kinds().map((k) => k.id).sort()).toEqual(Object.keys(BASE).sort())
    for (const k of kinds()) {
      expect(k.base, k.id).toEqual(BASE[k.id])
      expect(k.group, k.id).toBe(GROUPS[k.id])
      expect(k.label.length, k.id).toBeGreaterThan(0)
      expect(k.plural.length, k.id).toBeGreaterThan(0)
    }
  })

  it('every kind but a block type’s (and the block’s parts) has Properties, once, last', () => {
    for (const k of kinds()) {
      const n = k.base.filter((v) => v === 'properties').length
      expect(n, k.id).toBe(BASE[k.id].includes('properties') ? 1 : 0)
    }
    expect(kindOf('block-type')?.base).not.toContain('properties')
    expect(kindOf('mass')?.base.at(-1)).toBe('properties')
  })

  it('ids are unique; kindOf finds by id and answers undefined for what it does not know', () => {
    expect(new Set(kinds().map((k) => k.id)).size).toBe(kinds().length)
    expect(kindOf('street')?.label).toBe('Street')
    expect(kindOf('nope')).toBeUndefined()
  })

  it('kindsOfGroup lists the kinds of a branch of the Layers tree', () => {
    expect(kindsOfGroup('buildings').map((k) => k.id)).toEqual(['mass', 'building', 'level'])
    expect(kindsOfGroup('circulation').map((k) => k.id)).toEqual(['street', 'gate'])
    expect(kindsOfGroup('reference').map((k) => k.id)).toEqual(['grid', 'reference-line'])
    expect(kindsOfGroup('annotations').map((k) => k.id)).toEqual(['dimension', 'note'])
  })

  it('a kind’s own verbs have an id and a label, none twice', () => {
    for (const k of kinds()) {
      expect(new Set(k.own.map((v) => v.id)).size, k.id).toBe(k.own.length)
      for (const v of k.own) expect(v.id.length > 0 && v.label.length > 0, `${k.id}/${v.id}`).toBe(true)
    }
    expect(kindOf('mass')!.own.map((v) => v.id)).toEqual(expect.arrayContaining(['group', 'ungroup', 'union', 'rotate90', 'to-building', 'program', 'own-platform', 'back-to-building', 'split-at-line']))
    expect(kindOf('building')!.own.map((v) => v.label)).toEqual(expect.arrayContaining(['Assign the selection', 'Select its masses', 'Context', 'In another option', 'Make unique', 'Remove from the option']))
    expect(kindOf('level')!.own.map((v) => v.label)).toEqual(['Go to'])
    expect(kindOf('dimension')!.own.map((v) => v.label)).toEqual(['Fixed length', 'Group', 'Ungroup'])
    expect(kindOf('grid')!.own.map((v) => v.label)).toEqual(['Restore original'])
    expect(kindOf('drawing')!.own.map((v) => v.label)).toEqual(['Separate / Join layers', 'On top'])
    // Phase AS.5: the reference line and the note, and the shared verbs (the menu of several kinds shows those every picked kind has)
    expect(kindOf('reference-line')).toMatchObject({ label: 'Reference line', plural: 'Reference lines' })
    expect(kindOf('reference-line')!.own.map((v) => v.id)).toEqual(['on-top', 'group', 'ungroup'])
    expect(kindOf('note')).toMatchObject({ label: 'Note', plural: 'Notes' })
    expect(kindOf('note')!.own.map((v) => v.id)).toEqual(['group', 'ungroup'])
  })

  it('a kind’s `shape` (Phase D.1) says what its outline refuses, as data: a mass takes all but a move and a split, a mass’s hole no bump, radius, chamfer or split', () => {
    expect(kindOf('mass')!.shape).toEqual({ without: ['move', 'split'] })
    expect(kindOf('mass-hole')).toMatchObject({ label: 'Hole', plural: 'Holes', group: null, base: [], own: [], shape: { without: ['bump', 'radius', 'chamfer', 'split'] } })
    expect(kinds().filter((k) => k.shape).map((k) => k.id)).toEqual(expect.arrayContaining(['mass', 'mass-hole']))
  })

  it('a block takes every op of the shape engine but a move and a split (only a truck court splits: Phase D.3): its outline is free (Phase D.2); a hole of the block editor takes no bump, radius, chamfer or split', () => {
    expect(kindOf('block-type', demoProject())!.shape).toEqual({ without: ['move', 'split'] })
    expect(kindOf('hole', demoProject())!.shape).toEqual({ without: ['bump', 'radius', 'chamfer', 'split'] })
    expect(kinds(demoProject()).filter((k) => k.shape).map((k) => k.id)).toEqual(expect.arrayContaining(['mass', 'mass-hole', 'block-type', 'hole']))
  })

  it('a truck court is a shape of its own (Phase D.3): the block editor’s `court` and a placed block’s `block-court` take every op but a move, a split among them', () => {
    for (const id of ['court', 'block-court']) {
      expect(kindOf(id, demoProject())!.shape, id).toEqual({ without: ['move'] })
      expect(kindOf(id, demoProject())).toMatchObject({ label: 'Truck court', plural: 'Truck courts', group: null, base: [] })
    }
    expect(kinds(demoProject()).filter((k) => k.shape).map((k) => k.id)).toEqual(expect.arrayContaining(['court', 'block-court']))
  })

  it('group and ungroup are shared verbs of every kind that can be in a group (a mass, a street, an existing street, a lot, a gate, a dimension, a reference line, a note); no other own verb is', () => {
    const shared = kinds().flatMap((k) => k.own.filter((v) => v.shared).map((v) => `${k.id}/${v.id}`))
    const kinds8 = ['dimension', 'existing-road', 'gate', 'lot', 'mass', 'note', 'reference-line', 'street']
    expect(shared.sort()).toEqual(kinds8.flatMap((k) => [`${k}/group`, `${k}/ungroup`]))
    // the lot and the gate have no other own verb; the street and the existing road have *Equal sides* (Phase PE.1 task 11), the Path engine's `equal` op
    for (const k of ['lot', 'gate']) expect(kindOf(k)!.own.map((v) => v.id)).toEqual(['group', 'ungroup'])
    expect(kindOf('street')!.own.map((v) => v.id)).toEqual(['group', 'ungroup', 'equal-sides', 'equal-lanes'])
    expect(kindOf('existing-road')!.own.map((v) => v.id)).toEqual(['group', 'ungroup', 'equal-sides', 'equal-lanes'])
  })
})

describe('a module’s kinds, through the catalog', () => {
  it('the warehouse module brings the block type and the block’s parts', () => {
    const ids = kinds(demoProject()).map((k) => k.id)
    for (const id of ['block-type', 'zone', 'hole', 'court', 'block-court', 'element', 'edge']) expect(ids).toContain(id)
  })

  it('they are listed only while the typology offers the module', () => {
    // every known typology offers the warehouse since Phase D.2; one that offers none lists none
    TYPOLOGIES.push({ ...blank, id: 'bare', name: 'Bare', modules: ['terrain'] })
    const bare = { ...newProject('blank'), typology: 'bare' }
    expect(kinds(newProject('blank')).map((k) => k.id)).toContain('block-type')
    expect(kinds(bare).map((k) => k.id)).not.toContain('block-type')
    expect(kindOf('block-type', bare)).toBeUndefined()
    expect(kindOf('block-type', demoProject())).toBeDefined()
    // with no project every kind of every module is there (a saved reference names it)
    expect(kindOf('block-type')).toBeDefined()
    expect(kinds(bare).map((k) => k.id)).toContain('mass')
    TYPOLOGIES.pop()
  })

  it('a block’s own verbs (the warehouse’s) are on the mass only where the module is offered', () => {
    const own = (p?: Parameters<typeof ownVerbsOf>[1]) => ownVerbsOf('mass', p).map((v) => v.label)
    expect(own(demoProject())).toEqual(expect.arrayContaining(['Edit in the block editor', 'Save to the library']))
    TYPOLOGIES.push({ ...blank, id: 'bare', name: 'Bare', modules: ['terrain'] })
    expect(own({ ...newProject('blank'), typology: 'bare' })).not.toContain('Edit in the block editor')
    TYPOLOGIES.pop()
    expect(own(newProject('blank'))).toContain('Edit in the block editor')
    expect(own()).toContain('Save to the library')
  })
})

describe('the Kinds table of docs/ARCHITECTURE.md', () => {
  const text = readFileSync('docs/ARCHITECTURE.md', 'utf8')
  const section = text.split(/^## /m).find((s) => s.startsWith('Kinds'))
  const rows = (section ?? '')
    .split('\n')
    .filter((l) => l.startsWith('| `'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))

  it('says what the registry says: ids, labels, groups and base verbs', () => {
    expect(section, 'a "## Kinds" section').toBeDefined()
    const registry = kinds().map((k) => [`\`${k.id}\``, k.label, k.group ?? '—', k.base.join(', ') || '—'])
    expect(rows).toEqual(registry)
  })
})

describe('src/kinds/ is pure', () => {
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const importsOf = (path: string, t: string) =>
    [...code(t).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)'([^']+)'/g)].map((m) => (m[1].startsWith('.') ? new URL(m[1], `file://${path}`).pathname : m[1]))

  it('finds its files', () => {
    expect(Object.keys(sources).sort()).toEqual(expect.arrayContaining(['/src/kinds/core.ts', '/src/kinds/index.ts', '/src/kinds/types.ts']))
  })

  it('imports nothing but src/model/, the pure engine, the catalog, the modules’ types and itself', () => {
    // the engine is pure too (locked.ts reads a street’s segments from the derived roads); nothing of views, state or plugins
    const ok = (i: string) => i.startsWith('/src/model/') || i.startsWith('/src/engine/') || i === '/src/modules/catalog.ts' || i === '/src/modules/types.ts' || i.startsWith('/src/kinds/')
    const bad = Object.entries(sources).flatMap(([path, t]) => importsOf(path, t).filter((i) => !ok(i)).map((i) => `${path} → ${i}`))
    expect(bad).toEqual([])
  })
})
