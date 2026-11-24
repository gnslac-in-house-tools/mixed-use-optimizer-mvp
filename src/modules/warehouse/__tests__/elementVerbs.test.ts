// The element tools' verbs (Decisions "Elements by module", "Truck court"; BE.4): `putElements` puts one element a
// module on an edge's modules, or takes those away; `removeElements` takes some away by id; `setEdgeCourt` gives an
// edge its own court depth, puts a court in front of an edge without docks, or takes it away (a docked edge always has
// its court). Nothing changed: the same project.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import { demoProject } from '../../../state/demo.ts'
import { addWarehouseType, lockWarehouseStep, putElements, removeElements, renameElements, setEdgeCourt, setElementsWidth, updateWarehouseStep } from '../actions.ts'

/** The new block (200 × 96 m, bays of 12 m in 4 modules of 3 m, end bays of 10 m in 3; 66 × 32 modules): one dock on
 *  every module of its front's interior bays (modules 3–62 of e1). */
function block(): { p: Project; id: string } {
  const { project: p, id } = addWarehouseType(demoProject())
  return { p, id }
}
const typeIn = (p: Project, id: string) => p.warehouseTypes!.find((t) => t.id === id)!
const on = (p: Project, id: string, kind: string, edge: string) =>
  typeIn(p, id)
    .elements.filter((e) => e.kind === kind && e.edge === edge)
    .map((e) => e.module)
    .sort((a, b) => a - b)

describe('putElements', () => {
  it('puts one a module, the modules not holding that kind; a module twice: one', () => {
    const { p, id } = block()
    expect(on(p, id, 'dock', 'e1')).toHaveLength(60)
    const q = putElements(p, id, 'dock', 'e1', [0, 1, 1, 3], true)
    // module 3 held already: 0 and 1 put, each as wide as the last dock (3 m), ids free
    expect(on(q, id, 'dock', 'e1')).toEqual([0, 1, ...Array.from({ length: 60 }, (_, i) => i + 3)])
    const fresh = typeIn(q, id).elements.filter((e) => e.module < 2)
    expect(fresh.map((e) => [e.id, e.kind, e.edge, e.module, e.width])).toEqual([
      ['e61', 'dock', 'e1', 0, 3],
      ['e62', 'dock', 'e1', 1, 3],
    ])
  })

  it('takes those of the kind on the modules away, the others kept', () => {
    const { p, id } = block()
    const q = putElements(p, id, 'dock', 'e1', [31, 32, 33, 34], false)
    expect(on(q, id, 'dock', 'e1')).toHaveLength(56)
    expect(on(q, id, 'dock', 'e1').some((k) => k >= 31 && k <= 34)).toBe(false)
    // a door on those modules is not a dock: it stays
    const d = putElements(p, id, 'door', 'e1', [31], true)
    expect(on(putElements(d, id, 'dock', 'e1', [31], false), id, 'door', 'e1')).toEqual([31])
  })

  it('a module off the edge’s span, one already holding it on, one empty off, an edge not there: the same project', () => {
    const { p, id } = block()
    // e1 spans modules 0–65 (66 of them)
    expect(putElements(p, id, 'dock', 'e1', [66, 70], true)).toBe(p)
    expect(putElements(p, id, 'dock', 'e1', [3, 4], true)).toBe(p)
    expect(putElements(p, id, 'dock', 'e1', [0], false)).toBe(p)
    expect(putElements(p, id, 'dock', 'e9', [3], true)).toBe(p)
    expect(putElements(p, id, 'dock', 'e1', [], true)).toBe(p)
    expect(putElements(p, 'nope', 'dock', 'e1', [0], true)).toBe(p)
  })

  it('the width of the last of its kind, else its kind’s own (a door 4 m)', () => {
    const { p, id } = block()
    let q = putElements(p, id, 'door', 'e4', [0], true)
    expect(typeIn(q, id).elements.find((e) => e.kind === 'door')!.width).toBe(4)
    q = updateWarehouseStep(q, id, 'elements', typeIn(q, id).elements.map((e) => (e.kind === 'door' ? { ...e, width: 5 } : e)))
    q = putElements(q, id, 'door', 'e2', [10], true)
    expect(typeIn(q, id).elements.filter((e) => e.kind === 'door').map((e) => [e.edge, e.module, e.width])).toEqual([
      ['e4', 0, 5],
      ['e2', 10, 5],
    ])
  })

  it('a pattern by its name: the last pattern’s (else Downpipe), its width; another name on the same module is another pattern', () => {
    const { p, id } = block()
    let q = putElements(p, id, 'pattern', 'e1', [10], true)
    expect(typeIn(q, id).elements.filter((e) => e.kind === 'pattern').map((e) => [e.name, e.module, e.width])).toEqual([['Downpipe', 10, 0.3]])
    // a Skylight there too, named, not the first pattern's name copied
    q = putElements(q, id, 'pattern', 'e1', [10, 11], true, 'Skylight')
    const patterns = () => typeIn(q, id).elements.filter((e) => e.kind === 'pattern').map((e) => [e.name, e.module])
    expect(patterns()).toEqual([
      ['Downpipe', 10],
      ['Skylight', 10],
      ['Skylight', 11],
    ])
    // no name: the last pattern's (Skylight); off takes only that name's away
    q = putElements(q, id, 'pattern', 'e1', [10], false)
    expect(patterns()).toEqual([
      ['Downpipe', 10],
      ['Skylight', 11],
    ])
  })


  it('docks added to an edge with a depthless court entry drop it (the docked edge has its court anyway); an own depth stays', () => {
    const { p, id } = block()
    // e3 (the back) has no docks: its court-only entry is { edge }
    let q = setEdgeCourt(p, id, 'e3', {})
    q = setEdgeCourt(q, id, 'e2', { depth: 20 })
    expect(typeIn(q, id).courts).toEqual([{ edge: 'e3' }, { edge: 'e2', depth: 20 }])
    q = putElements(q, id, 'dock', 'e3', [5], true)
    expect(typeIn(q, id).courts).toEqual([{ edge: 'e2', depth: 20 }])
    // the last entry gone: no courts at all
    let r = setEdgeCourt(p, id, 'e3', {})
    r = putElements(r, id, 'dock', 'e3', [5], true)
    expect(typeIn(r, id).courts).toBeUndefined()
    // an own depth on that edge stays
    let s = setEdgeCourt(p, id, 'e3', { depth: 25 })
    s = putElements(s, id, 'dock', 'e3', [5], true)
    expect(typeIn(s, id).courts).toEqual([{ edge: 'e3', depth: 25 }])
  })

  it('opens the elements step, as an edit of it does (Decision "Free steps")', () => {
    let { p, id } = block()
    for (const s of ['grid', 'hall', 'columns', 'envelope', 'morphology', 'elements'] as const) p = lockWarehouseStep(p, id, s)
    expect(typeIn(p, id).locks?.elements).toBe('locked')
    const q = putElements(p, id, 'dock', 'e1', [0], true)
    expect(typeIn(q, id).locks?.elements).toBeUndefined()
  })
})

describe('removeElements', () => {
  it('one of a bay’s three taken away, the other two on their modules; ids not there: the same project', () => {
    let { p, id } = block()
    // the first end bay (modules 0–2): three docks
    p = putElements(p, id, 'dock', 'e1', [0, 1, 2], true)
    const ids = typeIn(p, id).elements.filter((e) => e.module < 3).map((e) => e.id)
    expect(ids).toHaveLength(3)
    const q = removeElements(p, id, [ids[1]])
    expect(on(q, id, 'dock', 'e1').filter((k) => k < 3)).toEqual([0, 2])
    expect(typeIn(q, id).elements).toHaveLength(62)
    expect(removeElements(p, id, ['x1'])).toBe(p)
    expect(removeElements(p, id, [])).toBe(p)
  })
})

describe('setElementsWidth and renameElements (step 6)', () => {
  it('a width for some elements by id; not a width, ids not there, or the same width: the same project', () => {
    const { p, id } = block()
    const q = setElementsWidth(p, id, ['e1', 'e2'], 2.5)
    expect(typeIn(q, id).elements.filter((e) => e.width === 2.5).map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(typeIn(q, id).elements).toHaveLength(60)
    expect(setElementsWidth(p, id, ['e1'], 0)).toBe(p)
    expect(setElementsWidth(p, id, ['e1'], Number.NaN)).toBe(p)
    expect(setElementsWidth(p, id, ['nope'], 2)).toBe(p)
    expect(setElementsWidth(p, id, ['e1'], 3)).toBe(p)
    expect(setElementsWidth(p, 'nope', ['e1'], 2)).toBe(p)
  })

  it('opens the elements step, as an edit of it does', () => {
    let { p, id } = block()
    for (const s of ['grid', 'hall', 'columns', 'envelope', 'morphology', 'elements'] as const) p = lockWarehouseStep(p, id, s)
    expect(typeIn(setElementsWidth(p, id, ['e1'], 2), id).locks?.elements).toBeUndefined()
  })

  it('a name for patterns only, trimmed, not empty; a pattern taking the name of one on its module joins it', () => {
    const { p, id } = block()
    let q = putElements(p, id, 'pattern', 'e1', [20, 21], true, 'Downpipe')
    q = putElements(q, id, 'pattern', 'e1', [21], true, 'Skylight')
    const ids = typeIn(q, id).elements.filter((e) => e.kind === 'pattern').map((e) => e.id)
    expect(ids).toHaveLength(3)
    // a dock's id among them is left as it is
    const r = renameElements(q, id, [...ids, 'e1'], '  Gutter ')
    expect(typeIn(r, id).elements.filter((e) => e.kind === 'pattern').map((e) => [e.module, e.name])).toEqual([[20, 'Gutter'], [21, 'Gutter']])
    expect(typeIn(r, id).elements.find((e) => e.id === 'e1')!.name).toBeUndefined()
    expect(renameElements(q, id, ids, '   ')).toBe(q)
    expect(renameElements(q, id, ['e1'], 'X')).toBe(q)
    expect(renameElements(r, id, ids, 'Gutter')).toBe(r)
  })
})

describe('setEdgeCourt', () => {
  it('an edge without docks: a court put (its own depth or not), one entry an edge, taken away with null', () => {
    const { p, id } = block()
    let q = setEdgeCourt(p, id, 'e3', {})
    expect(typeIn(q, id).courts).toEqual([{ edge: 'e3' }])
    q = setEdgeCourt(q, id, 'e3', { depth: 20 })
    expect(typeIn(q, id).courts).toEqual([{ edge: 'e3', depth: 20 }])
    q = setEdgeCourt(q, id, 'e3', { depth: 25 })
    expect(typeIn(q, id).courts).toEqual([{ edge: 'e3', depth: 25 }])
    q = setEdgeCourt(q, id, 'e3', null)
    expect(typeIn(q, id).courts).toBeUndefined()
    expect(setEdgeCourt(p, id, 'e3', null)).toBe(p)
  })

  it('a docked edge always has its court: its own depth given, null clears only its depth, no depth of its own adds nothing', () => {
    const { p, id } = block()
    let q = setEdgeCourt(p, id, 'e1', { depth: 30 })
    expect(typeIn(q, id).courts).toEqual([{ edge: 'e1', depth: 30 }])
    q = setEdgeCourt(q, id, 'e1', null)
    // the court stays (its docks give it), at the block's depth
    expect(typeIn(q, id).courts).toBeUndefined()
    expect(on(q, id, 'dock', 'e1')).toHaveLength(60)
    expect(setEdgeCourt(p, id, 'e1', {})).toBe(p)
    expect(setEdgeCourt(p, id, 'e1', null)).toBe(p)
  })

  it('keeps one entry an edge (two left by an older edit made one), the others as they were', () => {
    const { p, id } = block()
    const twice: Project = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => ({ ...t, courts: [{ edge: 'e3', depth: 20 }, { edge: 'e2' }, { edge: 'e3' }] })) }
    expect(typeIn(setEdgeCourt(twice, id, 'e3', { depth: 22 }), id).courts).toEqual([{ edge: 'e3', depth: 22 }, { edge: 'e2' }])
    expect(typeIn(setEdgeCourt(twice, id, 'e3', null), id).courts).toEqual([{ edge: 'e2' }])
  })

  it('not a depth, or an edge not there: the same project', () => {
    const { p, id } = block()
    expect(setEdgeCourt(p, id, 'e3', { depth: 0 })).toBe(p)
    expect(setEdgeCourt(p, id, 'e3', { depth: -5 })).toBe(p)
    expect(setEdgeCourt(p, id, 'e3', { depth: Number.NaN })).toBe(p)
    expect(setEdgeCourt(p, id, 'e9', {})).toBe(p)
  })
})
