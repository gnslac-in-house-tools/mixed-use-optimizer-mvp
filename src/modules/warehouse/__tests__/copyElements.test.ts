// A placed block's own docks, doors, patterns and courts (GT.7, Decision "Blocks on the site"): a site edit is that copy's
// only, the type never changes; from the first element touched there its type's element edits no longer reach it (never
// silently: the type's edit says how many keep their own), until Back to type, which clears its own docks, its own
// courts and its hall's court depths.
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import type { Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { typeWith } from '../engine/generate.ts'
import { putElements as putTypeElements, setEdgeCourt, shapeEdit } from '../views/commands.ts'

/** The new block (one dock on every module of its front's interior bays, modules 3–62 of e1) and two copies of it. */
function placed(): { p: Project; id: string; a: string; b: string } {
  let { project: p, id } = actions.addWarehouseType(demoProject())
  const option = p.options[0].id
  const r1 = actions.placeWarehouse(p, id, { x: 0, y: 0 }, 0, option)!
  const r2 = actions.placeWarehouseAt(r1.project, id, { x: 400, y: 0, angle: 0 }, option)!
  p = r2.project
  return { p, id, a: r1.id, b: r2.id }
}
const typeIn = (p: Project, id: string) => p.warehouseTypes!.find((t) => t.id === id)!
const copyIn = (p: Project, id: string) => p.buildings.find((b) => b.id === id)!
/** A copy's elements as it has them: its own, else its type's. */
const effective = (p: Project, id: string) => {
  const w = copyIn(p, id).warehouse!
  return typeWith(typeIn(p, w.type), w.overrides)
}
const docksOn = (p: Project, id: string, edge: string) =>
  effective(p, id)
    .elements.filter((e) => e.kind === 'dock' && e.edge === edge)
    .map((e) => e.module)
    .sort((x, y) => x - y)
const hallOf = (p: Project, buildingId: string) => {
  const levels = new Set(copyIn(p, buildingId).levels.map((l) => l.id))
  return p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
}

beforeEach(() => useToast.setState({ toast: null }))

describe('a placed block’s own docks', () => {
  it('a dock put on a copy is that copy’s only: the type and the other copies keep theirs', () => {
    const { p, id, a, b } = placed()
    const q = actions.putCopyElements(p, a, 'dock', 'e1', [0, 1], true)
    expect(q).not.toBe(p)
    expect(typeIn(q, id)).toEqual(typeIn(p, id))
    expect(docksOn(q, a, 'e1')).toEqual([0, 1, ...Array.from({ length: 60 }, (_, i) => i + 3)])
    expect(docksOn(q, b, 'e1')).toEqual(docksOn(p, b, 'e1'))
    expect(copyIn(q, a).warehouse!.overrides?.elements).toBeDefined()
    expect(copyIn(q, b).warehouse!.overrides).toBeUndefined()
    // nothing changed: the same project
    expect(actions.putCopyElements(p, a, 'dock', 'e1', [3], true)).toBe(p)
    expect(actions.putCopyElements(p, 'nope', 'dock', 'e1', [0], true)).toBe(p)
  })

  it('a copy with its own docks keeps them when its type’s docks change', () => {
    const { p, id, a, b } = placed()
    const q = actions.putCopyElements(p, a, 'dock', 'e1', [0], true)
    const mine = docksOn(q, a, 'e1')
    const r = actions.putElements(q, id, 'dock', 'e1', [3, 4, 5], false)
    expect(docksOn(r, a, 'e1')).toEqual(mine)
    expect(docksOn(r, b, 'e1')).not.toContain(4)
  })

  it('a stretched copy’s dock goes on its own box', () => {
    const { p, a } = placed()
    const s = actions.setWarehouseOverrides(p, a, { hall: { length: 224 } })
    const before = docksOn(s, a, 'e1')
    const q = actions.putCopyElements(s, a, 'dock', 'e1', [0], true)
    expect(docksOn(q, a, 'e1')).toEqual([0, ...before])
    expect(copyIn(q, a).warehouse!.overrides?.hall).toEqual({ length: 224 })
  })

  it('the type’s dock edit tells how many copies keep their own', () => {
    const { p, id, a } = placed()
    const q = actions.putCopyElements(p, a, 'dock', 'e1', [0], true)
    useApp.setState({ project: q, derived: derive(q), history: emptyHistory() })
    putTypeElements(id, 'dock', 'e1', [3], false)
    expect(useToast.getState().toast?.text).toContain('1 copy keeps its own docks')
  })

  it('no copy with its own docks: nothing told of it', () => {
    const { p, id } = placed()
    useApp.setState({ project: p, derived: derive(p), history: emptyHistory() })
    putTypeElements(id, 'dock', 'e1', [3], false)
    expect(useToast.getState().toast?.text ?? '').not.toContain('own docks')
  })
})

describe('a placed block’s own courts', () => {
  it('a court put on a copy’s wall without docks is the copy’s own', () => {
    const { p, id, a, b } = placed()
    const wall = ['e2', 'e3', 'e4'].find((e) => !effective(p, a).elements.some((x) => x.kind === 'dock' && x.edge === e))!
    const q = actions.setCopyEdgeCourt(p, a, wall, {})
    expect(copyIn(q, a).warehouse!.overrides?.courts).toEqual([...(typeIn(p, id).courts ?? []), { edge: wall }])
    expect(typeIn(q, id)).toEqual(typeIn(p, id))
    expect(copyIn(q, b).warehouse!.overrides).toBeUndefined()
    // taken away again: none of its own left that differs from its type's
    const r = actions.setCopyEdgeCourt(q, a, wall, null)
    expect(effective(r, a).courts ?? []).toEqual(typeIn(p, id).courts ?? [])
    // nothing changed, not a depth, no such edge: the same project
    expect(actions.setCopyEdgeCourt(p, a, wall, null)).toBe(p)
    expect(actions.setCopyEdgeCourt(p, a, wall, { depth: -3 })).toBe(p)
    expect(actions.setCopyEdgeCourt(p, a, 'e9', {})).toBe(p)
  })
})

describe('the type’s shape and court edits are never silent either', () => {
  it('a type shape edit tells how many copies keep their own shape', () => {
    const { p, id, a, b } = placed()
    let q = actions.putCopyElements(p, a, 'dock', 'e1', [0], true)
    q = actions.putCopyElements(q, b, 'dock', 'e1', [1], true)
    expect(copyIn(q, a).warehouse!.overrides?.morphology?.outline).toBeDefined()
    useApp.setState({ project: q, derived: derive(q), history: emptyHistory() })
    shapeEdit(id, { kind: 'hole', x: [30, 34], y: [4, 8] })
    expect(typeIn(useApp.getState().project, id).morphology.holes).not.toEqual(typeIn(q, id).morphology.holes)
    expect(useToast.getState().toast?.text).toContain('2 copies keep their own shape')
    // none with its own outline: nothing told of it
    useToast.setState({ toast: null })
    useApp.setState({ project: p, derived: derive(p), history: emptyHistory() })
    shapeEdit(id, { kind: 'hole', x: [30, 34], y: [4, 8] })
    expect(useToast.getState().toast?.text ?? '').not.toContain('own shape')
  })

  it('a type court edit tells how many copies keep their own courts', () => {
    const { p, id, a } = placed()
    const free = (e: string) => !typeIn(p, id).elements.some((x) => x.kind === 'dock' && x.edge === e)
    const [wall, other] = ['e2', 'e3', 'e4'].filter(free)
    const q = actions.setCopyEdgeCourt(p, a, wall, {})
    useApp.setState({ project: q, derived: derive(q), history: emptyHistory() })
    setEdgeCourt(id, other, {})
    expect(typeIn(useApp.getState().project, id).courts).not.toEqual(typeIn(q, id).courts)
    expect(useToast.getState().toast?.text).toContain('1 copy keeps its own courts')
    expect(useToast.getState().toast?.text).not.toContain('own docks')
  })
})

describe('Back to type', () => {
  it('Back to type clears the copy’s own docks, its courts and the hall’s court depths', () => {
    const { p, a } = placed()
    let q = actions.putCopyElements(p, a, 'dock', 'e1', [0], true)
    const wall = ['e2', 'e3', 'e4'].find((e) => !effective(q, a).elements.some((x) => x.kind === 'dock' && x.edge === e))!
    q = actions.setCopyEdgeCourt(q, a, wall, {})
    q = actions.setCourtDepth(q, hallOf(q, a).id, 0.1, 40)
    expect(hallOf(q, a).courts).toBeDefined()
    const r = actions.copyBackToType(q, a)
    expect(copyIn(r, a).warehouse!.overrides).toBeUndefined()
    expect(hallOf(r, a).courts).toBeUndefined()
    expect(docksOn(r, a, 'e1')).toEqual(docksOn(p, a, 'e1'))
    // a copy as its type already: the same project
    expect(actions.copyBackToType(p, a)).toBe(p)
  })
})
