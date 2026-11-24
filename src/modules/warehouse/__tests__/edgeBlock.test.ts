// A block's walls as the On edge engine's host (Phase D.3, task 9): the dock rule and the bays' groups live in the module's pure engine
// (`engine/dockRule.ts`); the views' `handleMath.ts` no longer re-exports them (task 10: the views import the engine).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { demoProject } from '../../../state/demo.ts'
import { actions } from '../../../state/actions/index.ts'
import { bayModules, dockMask, dragModules, moduleOn, onDockRule, paintModules, runAlongEdge } from '../engine/dockRule.ts'
import { generate } from '../engine/generate.ts'

/** The new block as it is (docks on every module of e1's interior bays), and the same with no dock at all (the rule's own default). */
function block(docks = true) {
  const { project, id } = actions.addWarehouseType(demoProject())
  const t = project.warehouseTypes!.find((x) => x.id === id)!
  return generate(docks ? t : { ...t, elements: [] })
}

describe('the dock rule in the engine', () => {
  it('the new block’s rule: a bay of four modules gives its two middle ones, of three its middle one', () => {
    const g = block(false)
    const mask = dockMask(g)
    expect([...mask(4)]).toEqual([1, 2])
    // and the block's own docked bays set the rule: here every module of a four-module bay holds one
    expect([...dockMask(block())(4)]).toEqual([0, 1, 2, 3])
    expect([...mask(3)]).toEqual([1])
  })

  it('onDockRule keeps a bay’s rule modules; a module in no bay stays; paintModules applies it to a drag of docks only', () => {
    const g = block(false)
    const e = g.edges.find((x) => x.id === 'e1')!
    expect(onDockRule(g, e, [3, 4, 5, 6])).toEqual([4, 5])
    expect(paintModules(g, 'dock', e, [3], 6, true).length).toBeLessThan(dragModules(g.runs, e, [3], 6).length)
    expect(paintModules(g, 'door', e, [3], 6, true)).toEqual(dragModules(g.runs, e, [3], 6))
    expect(paintModules(g, 'dock', e, [3], 6, false)).toEqual(dragModules(g.runs, e, [3], 6))
  })

  it('the bays’ modules, and the module under a point along a wall', () => {
    const g = block()
    const e = g.edges.find((x) => x.id === 'e1')!
    expect(bayModules(g.runs, e, 0)).toEqual([0, 1, 2])
    expect(bayModules(g.runs, e, 1)).toEqual([3, 4, 5, 6])
    expect(moduleOn(g.runs, e, 1)).toBeCloseTo(0, 6)
    expect(runAlongEdge(g.runs, e)).toBe(g.runs.x)
  })

  it('the views’ handleMath keeps no copy of the rule, nor a re-export of it', () => {
    expect(readFileSync('src/modules/warehouse/views/handleMath.ts', 'utf8')).not.toMatch(/export {[^}]*(onDockRule|dockMask|paintModules|bayModules)/)
    const src = readFileSync('src/modules/warehouse/views/handleMath.ts', 'utf8')
    expect(src).not.toMatch(/function (dockMask|onDockRule|paintModules)\b/)
  })
})
