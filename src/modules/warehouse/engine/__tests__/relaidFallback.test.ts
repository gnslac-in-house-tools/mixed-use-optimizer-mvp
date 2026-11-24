// *Set end bays automatically* on a box whose shape cannot be relaid (`relaidShape` null; residual review of BE): the
// shape falls back to its lines kept from the nearer wall, but the docks still keep their place in m, each on the
// module whose centre is nearest where it stood, never on the module of the same index that now stands elsewhere.
import { describe, expect, it, vi } from 'vitest'
import type { HallElement, Project, WarehouseType } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { addWarehouseType, moveBlockEdge, placeWarehouse, setEndsAutomatically, shapeWarehouse, updateWarehouseStep } from '../../actions.ts'
import { nearestModule } from '../bays.ts'
import { copyGenerated, onPlace } from '../copies.ts'
import { generate, hallRuns } from '../generate.ts'

vi.mock('../shape.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shape.ts')>()), relaidShape: () => null }))

const HALF = 1.5 + 1e-6
const docks = (modules: number[]): HallElement[] => modules.map((module, i) => ({ id: `d${i + 1}`, kind: 'dock', edge: 'e1', module, width: 3 }))
const typeIn = (p: Project, id: string): WarehouseType => p.warehouseTypes!.find((t) => t.id === id)!

/** 218 × 96 m (12 m bays, 3 m modules), its end bay at the start: 73 modules, 72 after the button. */
function laid() {
  let { project: p, id } = addWarehouseType(demoProject())
  p = updateWarehouseStep(p, id, 'hall', { length: 218, width: 96, ends: 'start' })
  const n = hallRuns(typeIn(p, id)).x.modules.length - 1
  p = updateWarehouseStep(p, id, 'elements', docks([1, 2, Math.floor(n / 2), n - 3, n - 2]))
  return { p, id }
}

describe('a box relaid whose shape cannot be: its docks by the nearest centre', () => {
  it('a type: each dock within half a module of where it stood, on the module whose centre is nearest', () => {
    const { p, id } = laid()
    const before = generate(typeIn(p, id)).doors.filter((d) => d.edge === 'e1')
    const t = typeIn(setEndsAutomatically(p, id), id)
    const runs = hallRuns(t)
    const after = generate(t).doors.filter((d) => d.edge === 'e1')
    expect(after).toHaveLength(before.length)
    after.forEach((d, i) => {
      expect(Math.abs(d.at.x - before[i].at.x)).toBeLessThanOrEqual(HALF)
      expect(d.module).toBe(nearestModule(runs.x, before[i].at.x))
    })
  })

  it('an own-shape copy: its docks keep their place on the site', () => {
    let { p, id } = laid()
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 40, to: 48, by: -1 }).project
    const placed = placeWarehouse(p, id, { x: 100, y: 100 }, 0, p.options[0].id)!
    p = placed.project
    const w0 = p.buildings.find((b) => b.id === placed.id)!.warehouse!
    const side = copyGenerated(typeIn(p, id), w0).edges.find((e) => !e.outer && !e.horizontal)!
    p = moveBlockEdge(p, placed.id, side.id, 1).project
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!.morphology!.outline!.length).toBeGreaterThanOrEqual(4)
    const onSite = (pr: Project) => {
      const w = pr.buildings.find((b) => b.id === placed.id)!.warehouse!
      return copyGenerated(typeIn(pr, id), w)
        .doors.filter((d) => d.edge === 'e1')
        .map((d) => onPlace(w.place, d.at).x)
    }
    const before = onSite(p)
    const after = onSite(setEndsAutomatically(p, id))
    expect(after).toHaveLength(before.length)
    after.forEach((x, i) => expect(Math.abs(x - before[i])).toBeLessThanOrEqual(HALF))
  })
})
