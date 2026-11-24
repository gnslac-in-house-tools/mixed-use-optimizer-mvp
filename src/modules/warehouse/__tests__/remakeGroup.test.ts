// A block copy's masses made again from its type are a group when there are several (`remake`): the group's id is free among every kind's
// (Phase AS.5 review, Decision "Groups of any kind"). A type makes one hall today (Decision "Block shape"), so the second part is added
// to what the type makes, to reach the branch that gives them a group. (The setup file has loaded the actions already: the modules are
// loaded again, after the mock.)
import { describe, expect, it, vi } from 'vitest'

vi.mock('../engine/copies.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../engine/copies.ts')>()
  return {
    ...real,
    copyParts: (...args: Parameters<typeof real.copyParts>) => {
      const parts = real.copyParts(...args)
      return [...parts, { ...parts[0], part: 'annex', name: 'Annex' }]
    },
  }
})

describe('the group of a block copy’s masses', () => {
  it('is not the id of a group of a lot and a note', async () => {
    vi.resetModules()
    const { membersOfGroup } = await import('../../../engine/groups.ts')
    const { addNote } = await import('../../../state/actions/annotations.ts')
    const { groupRefs } = await import('../../../state/actions/groups.ts')
    const { demoProject } = await import('../../../state/demo.ts')
    const { addLot } = await import('../../parking/actions.ts')
    const { addWarehouseType, placeWarehouse } = await import('../actions.ts')

    let p = demoProject({ streets: false })
    const lot = addLot(p, 'o1', { rect: { center: { x: 220, y: 200 }, width: 40, depth: 30, rotation: 0 } })!
    const note = addNote(lot.project, { x: 300, y: 220 }, 'Hello', 'l1')!
    p = groupRefs(note.project, 'o1', [{ kind: 'lot', id: lot.id }, { kind: 'note', id: note.id }])!.project
    expect(p.notes![0].group).toBe('g1')
    const made = addWarehouseType(p)
    const placed = placeWarehouse(made.project, made.id, { x: 200, y: 150 }, 0, 'o1')!
    const levels = new Set(placed.project.buildings.find((b) => b.id === placed.id)!.levels.map((l) => l.id))
    const mine = placed.project.masses.filter((m) => levels.has(m.levelId))
    expect(mine).toHaveLength(2)
    expect(mine[0].group).toBeDefined()
    expect(mine[0].group).toBe(mine[1].group)
    expect(mine[0].group).not.toBe('g1')
    expect(membersOfGroup(placed.project, 'o1', 'g1').map((m) => m.kind)).toEqual(['lot', 'note'])
  })
})
