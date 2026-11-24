// Alt+drag onto a building (buildingCommands' copyInto) and a block (Phase D.2 review): a block's hall is never copied as a plain mass. Every
// building's mass is a block (guard views/editing/__tests__/noPlainMass.test.ts), so the copy of a block is a new block of its type, a
// building of its own in the option; a plain mass dropped in the same drag still goes into the target building, as before.
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import { buildingOf } from '../../../engine/buildings.ts'
import { actions } from '../../../state/actions/index.ts'
import { addBuilding } from '../../../state/actions/buildings.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { copyInto } from '../buildingCommands.ts'

const s = () => useApp.getState()

/** A block on the grid (48 × 24 m), and an empty building of the option to drop it on. */
function setup() {
  const p = demoProject()
  const o = gridOf(p, 'o1')!.origin
  const footprint = { kind: 'rect' as const, center: { x: o.x + 60, y: o.y + 60 }, width: 48, depth: 24, rotation: 0 }
  const block = actions.drawBlock(p, { programId: 'office', footprint, optionId: 'o1' })!
  const target = addBuilding(block.project, { optionId: 'o1' })
  useApp.setState({ project: target.project, derived: derive(target.project, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', option: 'o1' })
  return { block: block.id, building: target.id }
}

beforeEach(() => {
  localStorage.clear()
  useToast.setState({ toast: null, confirmation: null })
})

describe('copyInto, a block’s hall', () => {
  it('comes out as a new block of its own, never a plain mass, and is not put in the target building', () => {
    const w = setup()
    const before = s().project
    const source = before.masses.find((m) => m.id === w.block)!
    expect(actions.isBlockMass(before, source)).toBe(true)
    copyInto([w.block], 'o1', w.building)
    const after = s().project
    const made = after.masses.filter((m) => !before.masses.some((x) => x.id === m.id))
    expect(made.length).toBeGreaterThan(0)
    for (const m of made) expect(actions.isBlockMass(after, m), m.id).toBe(true)
    // a building of its own, not the target's, in the option in view
    expect(after.buildings).toHaveLength(before.buildings.length + 1)
    for (const m of made) expect(buildingOf(after, m).id).not.toBe(w.building)
    expect(after.buildings.at(-1)!.warehouse).toBeDefined()
    expect(after.options.find((o) => o.id === 'o1')!.buildingIds).toContain(after.buildings.at(-1)!.id)
    // the target keeps its masses; the source stays
    expect(after.masses.filter((m) => buildingOf(after, m).id === w.building)).toEqual(before.masses.filter((m) => buildingOf(before, m).id === w.building))
    expect(after.masses.find((m) => m.id === w.block)).toEqual(source)
    expect(s().selection.massIds).toContain(made[0].id)
    expect(useToast.getState().toast?.text).toMatch(/new block/)
  })

  it('with a plain mass in the same drag: the mass goes into the building, the block becomes a block', () => {
    const w = setup()
    const before = s().project
    copyInto([w.block, 'm3'], 'o1', w.building)
    const after = s().project
    const made = after.masses.filter((m) => !before.masses.some((x) => x.id === m.id))
    const plain = made.filter((m) => !actions.isBlockMass(after, m))
    const blocks = made.filter((m) => actions.isBlockMass(after, m))
    expect(plain).toHaveLength(1)
    expect(plain[0]).toMatchObject({ programId: 'office' })
    expect(buildingOf(after, plain[0]).id).toBe(w.building)
    expect(blocks.length).toBeGreaterThan(0)
    for (const m of blocks) expect(buildingOf(after, m).id).not.toBe(w.building)
  })
})
