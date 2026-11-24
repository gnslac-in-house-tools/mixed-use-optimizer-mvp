// Elements that merge on a relay or a regrid are told (late review, the controller's ruling): a displaced element moves
// to a free neighbour only (within one new module of where it stood), otherwise it merges, and the block editor says
// how many, once, by kind ("1 dock merged where modules joined").
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import type { HallElement } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { hallRuns } from '../../engine/generate.ts'
import { endsAutomatically, updateStep } from '../commands.ts'

const docks = (n: number): HallElement[] => Array.from({ length: n }, (_, k) => ({ id: `d${k}`, kind: 'dock', edge: 'e1', module: k, width: 3 }))
const typeOf = () => useApp.getState().project.warehouseTypes![0]
const told = () => useToast.getState().toast?.text ?? ''

/** A block `length` × 96 m (12 m bays, 3 m modules), its end bay at the start, a dock on each module of its front. */
function full(length: number) {
  let { project: p, id } = actions.addWarehouseType(demoProject())
  p = actions.updateWarehouseStep(p, id, 'hall', { length, width: 96, ends: 'start' })
  const n = hallRuns(p.warehouseTypes![0]).x.modules.length - 1
  p = actions.updateWarehouseStep(p, id, 'elements', docks(n))
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory() })
  return { id, n }
}

beforeEach(() => useToast.setState({ toast: null }))

describe('merges told', () => {
  it('a full front that loses a module under Set end bays automatically: one dock merged, and told', () => {
    const { id, n } = full(110)
    endsAutomatically(id)
    const now = hallRuns(typeOf()).x.modules.length - 1
    expect(now).toBe(n - 1)
    expect(typeOf().elements).toHaveLength(n - 1)
    expect(told()).toContain('1 dock merged where modules joined')
  })

  it('a step 1 grid edit that merges docks says how many', () => {
    const { id, n } = full(108)
    updateStep(id, 'grid', { modules: 3 })
    const left = typeOf().elements.length
    expect(left).toBeLessThan(n)
    expect(told()).toContain(`${n - left} docks merged where modules joined`)
  })

  it('nothing merged: nothing told of it', () => {
    let { project: p, id } = actions.addWarehouseType(demoProject())
    p = actions.updateWarehouseStep(p, id, 'hall', { length: 110, width: 96, ends: 'start' })
    p = actions.updateWarehouseStep(p, id, 'elements', [{ id: 'd', kind: 'dock', edge: 'e1', module: 10, width: 3 }])
    useApp.setState({ project: p, derived: derive(p), history: emptyHistory() })
    endsAutomatically(id)
    expect(typeOf().elements).toHaveLength(1)
    expect(told()).not.toContain('merged')
  })
})
