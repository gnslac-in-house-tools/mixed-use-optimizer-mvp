// The Streets rows of Layers (Phase PE.1 review, batch A): a street whose width changes derives as several runs, and is one row, one
// number, one padlock and one eye: the row's object is the street's id and its segments are every run's.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import type { Project } from '../../../model/schema.ts'
import { demoProject } from '../../../state/demo.ts'
import { street as streetKey } from '../keys.ts'
import { flatRows, layerTree, type LayerRow } from '../tree.ts'
import { nameOfRef } from '../locks.ts'
import { useApp } from '../../../state/store.ts'

/** Two streets: `street:s1` of three segments, the middle one wider (three runs), and `street:s4` of one. */
function world(lockedSegment?: string): Project {
  const base = demoProject()
  const nodes = [
    { id: 'n1', x: 60, y: 161 },
    { id: 'n2', x: 60, y: 185 },
    { id: 'n3', x: 60, y: 205 },
    { id: 'n4', x: 60, y: 230 },
    { id: 'n5', x: 120, y: 161 },
    { id: 'n6', x: 120, y: 230 },
  ]
  const g = (id: string, a: string, b: string, left = 4, right = 4) => ({ id, a, b, type: 'trucks', left, right, ...(id === lockedSegment ? { locked: true } : {}) })
  const streets = { nodes, segments: [g('s1', 'n1', 'n2'), g('s2', 'n2', 'n3', 4, 8), g('s3', 'n3', 'n4'), g('s4', 'n5', 'n6')] }
  return { ...base, options: [{ ...base.options[0], streets }] }
}

const rows = (p: Project, off: string[] = []): LayerRow[] => flatRows(layerTree(p, 'o1', derive(p, 'o1'), { terrain: false, parking: true }, new Set(off)))
const find = (r: LayerRow[], id: string) => r.find((x) => x.id === id)

describe('a widened street is one row', () => {
  it('the Streets row counts streets, not runs', () => {
    expect(derive(world(), 'o1').circulation.roads.filter((r) => r.kind === 'street')).toHaveLength(4)
    expect(find(rows(world()), 'streets')!.count).toBe(2)
  })

  it('a locked segment of it is one row for the street: its id, every segment, one number', () => {
    const p = world('s3')
    const children = find(rows(p), 'streets')!.children!
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({ id: 'street:s1', label: 'Street 1', lock: 'mixed', ref: { object: 'street:s1', segments: ['s1', 's2', 's3'] } })
    expect(children[0].eyes.map((e) => ('key' in e ? e.key : null))).toEqual([streetKey('s1'), streetKey('s2'), streetKey('s3')])
  })

  it('a hidden street (its segments’ eyes off) is one row, hidden in all its runs', () => {
    const p = world()
    const children = find(rows(p, [streetKey('s1'), streetKey('s2'), streetKey('s3')]), 'streets')!.children!
    expect(children.map((r) => [r.id, r.label])).toEqual([['street:s1', 'Street 1']])
  })

  it('its number is the one the plan’s notices say', () => {
    const p = world('s3')
    useApp.setState({ project: p, derived: derive(p, 'o1'), option: 'o1' })
    expect(nameOfRef({ kind: 'street', id: 'street:s1' })).toBe('Street 1')
    expect(find(rows(p), 'streets')!.children![0].label).toBe(nameOfRef({ kind: 'street', id: 'street:s1' }))
  })

  it('a street with a second one locked is numbered among the streets, not the runs', () => {
    const p = world()
    const locked: Project = { ...p, options: [{ ...p.options[0], streets: { ...p.options[0].streets!, segments: p.options[0].streets!.segments.map((s) => (s.id === 's4' ? { ...s, locked: true } : s)) } }] }
    expect(find(rows(locked), 'streets')!.children!.map((r) => r.label)).toEqual(['Street 2'])
  })
})

describe('an existing road’s detail reads every stretch', () => {
  it('a road of two widths says both', () => {
    const p = demoProject()
    const wide: Project = { ...p, site: { ...p.site, existingRoads: [{ id: 'r1', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], stretches: [{ left: 3, right: 3 }, { left: 5, right: 7 }] }] } }
    expect(find(rows(wide), 'existing-road:r1')!.detail).toBe('100 m · 6 m – 12 m wide')
    const even: Project = { ...p, site: { ...p.site, existingRoads: [{ id: 'r1', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], stretches: [{ left: 3, right: 3 }, { left: 2, right: 4 }] }] } }
    expect(find(rows(even), 'existing-road:r1')!.detail).toBe('100 m · 6 m wide')
  })
})
