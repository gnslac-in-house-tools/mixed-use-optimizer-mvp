// The paving in 3D (Phase S.4): the roads, courts and stalls the plan draws, by layer, at their widths.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { regionsArea } from '../../../engine/geom/boolean.ts'
import { callTool } from '../../../api/tools/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { pavingOf } from '../Paving.tsx'

describe('pavingOf', () => {
  it('the streets, the courts and the stalls of the demo; a street of the context with the streets', () => {
    const p = demoProject()
    const c = derive(p).circulation
    const paved = pavingOf(c)
    // its streets (the roads it derived before ST.4) and its south street (an existing one), one layer
    expect(regionsArea(paved.byHand)).toBeGreaterThan(c.totals.roadArea)
    expect('derived' in paved).toBe(false)
    expect(paved.courts.length).toBe(c.docks.length + c.approaches.length)
    expect(paved.stalls.length).toBe(c.stalls.length)
    const r = callTool(p, 'addExistingRoad', { points: [{ x: -50, y: 300 }, { x: 500, y: 300 }], width: 12 })
    if (!r.ok) throw new Error(r.error)
    const withStreet = pavingOf(derive(r.project).circulation)
    // the south street and the new one, 550 m × 12 m
    expect(regionsArea(withStreet.byHand) - regionsArea(paved.byHand)).toBeCloseTo(550 * 12, -1)
  })
})
