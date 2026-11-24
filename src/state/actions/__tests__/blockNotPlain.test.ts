// No verb makes a plain mass out of a block (Phase D.2 review): a block is a building of its own, so Copy up and Down, Split at a grid line and
// the agent's copyMass do not copy or cut its hall into plain masses. The verbs say no (null) and the agent's copy makes a block.
import { describe, expect, it } from 'vitest'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { gridOf, linesInside } from '../../../engine/grid/index.ts'
import type { Footprint, Project } from '../../../model/schema.ts'
import { callTool } from '../../../api/tools/index.ts'
import { actions } from '../index.ts'
import { demoProject } from '../../demo.ts'

/** A rectangle along the demo's grid (its lines every 12 m from its origin), a few bays across. */
const along = (p: Project): Footprint => {
  const o = gridOf(p, 'o1')!.origin
  return { kind: 'rect', center: { x: o.x + 60, y: o.y + 60 }, width: 48, depth: 24, rotation: 0 }
}

describe('a block’s hall is not copied to a level or split as a plain mass', () => {
  const p = demoProject()
  const footprint = along(p)
  const made = actions.drawBlock(p, { programId: 'office', footprint, optionId: 'o1' })!
  const plain = actions.addMass(p, { programId: 'office', footprint, levelId: 'l1' })

  it('Copy up and Copy down: a plain mass goes to the level above, a block’s hall nowhere', () => {
    expect(actions.copyMassToLevel(plain.project, plain.id, 1)).not.toBeNull()
    expect(actions.copyMassToLevel(made.project, made.id, 1)).toBeNull()
    expect(actions.copyMassToLevel(made.project, made.id, -1)).toBeNull()
  })

  it('Split at a grid line: a plain mass splits, a block’s hall does not', () => {
    const line = linesInside(gridOf(plain.project, 'o1')!, footprintPolygon(footprint))[0]
    expect(actions.splitAtGridLine(plain.project, 'o1', plain.id, line.axis, line.k)).not.toBeNull()
    expect(actions.splitAtGridLine(made.project, 'o1', made.id, line.axis, line.k)).toBeNull()
  })
})

describe('the agent’s copyMass on a block copies the block', () => {
  const p = demoProject()
  const made = actions.drawBlock(p, { programId: 'office', footprint: along(p), optionId: 'o1' })!

  it('a new block of its type (a building of its own), moved by dx, dy; its hall’s id comes back', () => {
    const r = callTool(made.project, 'copyMass', { mass: made.id, dx: 100, dy: 0 })
    if (!r.ok) throw new Error(r.error)
    const id = (r.output as { id: string }).id
    const hall = r.project.masses.find((m) => m.id === id)!
    expect(hall.part).toBe('hall')
    expect(hall.id).not.toBe(made.id)
    expect(r.project.buildings).toHaveLength(made.project.buildings.length + 1)
    expect(r.project.buildings.filter((b) => b.warehouse).length).toBe(made.project.buildings.filter((b) => b.warehouse).length + 1)
  })

  it('a plain mass is copied as before', () => {
    const r = callTool(p, 'copyMass', { mass: 'm1', dx: 5, dy: 5 })
    if (!r.ok) throw new Error(r.error)
    expect(r.project.masses).toHaveLength(p.masses.length + 1)
  })
})
