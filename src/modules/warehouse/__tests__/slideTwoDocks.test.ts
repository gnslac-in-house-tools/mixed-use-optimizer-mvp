// Browser check, 2026-11-18: two picked docks "never slide". They do when they have room: the engine's all-or-none slide leaves the moving picks out of the
// obstacles (their old slots and each other). The sample's docks stand in pairs of adjacent modules with one free between bays, so most pairs of picks really
// have a neighbour in the way (the refusal is right), and a pair with room slides together.
import { describe, expect, it } from 'vitest'
import { actions } from '../../../state/actions/index.ts'
import { sampleProject } from '../../../state/sample.ts'

const ref = { kind: 'mass' as const, id: 'm2' } // Cross-dock 2 · Hall; its e1 wall has docks on slots 5, 6, 9, 10, 13, 14…
const p = sampleProject()
const read = actions.edgeOf(p, ref)!
const dock = (slot: number) => read.elements.find((x) => x.edge === 'e1' && x.kind === 'dock' && x.slot === slot)!.id
const slide = (slots: number[], by: number) => actions.editEdge(p, ref, { op: 'slide', ids: slots.map(dock), by })
const slotsAfter = (q: typeof p) =>
  (actions.edgeOf(q, ref)?.elements ?? []).filter((x) => x.edge === 'e1' && x.kind === 'dock').map((x) => x.slot)

describe('two picked docks slide together', () => {
  it('a neighbouring pair with room slides, one module either way', () => {
    for (const by of [-1, 1]) {
      const w = slide([9, 10], by)
      expect(w.reason).toBeUndefined()
      expect(w.project).not.toBe(p)
      const s = slotsAfter(w.project)
      expect(s).toContain(9 + by)
      expect(s).toContain(10 + by)
    }
  })
  it('the moving picks are not each other’s obstacles: the first of a pair slides onto the slot the second leaves', () => {
    expect(slide([5, 6], 1).reason).toBeUndefined()
    expect(slide([5, 6], -1).reason).toBeUndefined()
  })
  it('a pick with a neighbour that stays in the way is refused, all or none', () => {
    expect(slide([6, 9], -1).reason).toMatch(/cannot slide/)
    expect(slide([5, 9], 1).reason).toMatch(/cannot slide/)
    expect(slide([5, 6], -3).reason).toMatch(/cannot slide/)
  })
})
