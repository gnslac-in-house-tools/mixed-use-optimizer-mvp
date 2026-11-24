// The frontage leaves Layers (Phase PE.2, task 7): a saved frontage is an existing street (project 20), so the tree has no Frontage
// row, no key of its own, and a hidden `frontage` or `frontage:<id>` an old session stored is let go with the objects that are gone.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { aliveIn, keysAlive, rowsAlive } from '../gone.ts'
import * as keys from '../keys.ts'
import { flatRows, layerTree } from '../tree.ts'

describe('Layers has no frontage', () => {
  const p = demoProject()
  const rows = flatRows(layerTree(p, 'o1', derive(p, 'o1'), { terrain: true, parking: true }))

  it('the tree has no Frontage branch and no row of one; the south street is an existing street row', () => {
    expect(rows.filter((r) => r.id === 'frontage' || r.id.startsWith('frontage:') || String(r.kind).startsWith('frontage'))).toEqual([])
    expect(rows.find((r) => r.id === 'existing-roads')?.children?.map((c) => c.label)).toEqual(['South street'])
  })

  it('the keys have no frontage kind and no key of its own', () => {
    expect(Object.keys(keys)).not.toContain('FRONTAGE')
    expect(Object.keys(keys)).not.toContain('frontageOf')
  })

  it('a stored hidden key or a folded row of a frontage is dropped; the others stay', () => {
    const alive = aliveIn(p)
    expect(keysAlive(['frontage', 'frontage:f1', keys.STREETS, keys.gate('g1')], alive)).toEqual([keys.STREETS, keys.gate('g1')])
    expect(rowsAlive(['frontage:f1', 'gate:g1'], alive)).toEqual(['gate:g1'])
  })
})
