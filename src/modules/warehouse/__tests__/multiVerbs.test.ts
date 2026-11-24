// The block plan's verbs for several things at once (Decision "Multi-selection", BE.9): `moveGridLines` moves some
// column lines together by whole modules, none past a neighbour not moved (all or none; the box's first and last
// never move); `slideElements` slides some docks, doors and patterns along their walls by whole modules, all or none;
// `removePicked` deletes a mixed selection in one step. Nothing changed: the same project.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import { demoProject } from '../../../state/demo.ts'
import { lineModules } from '../engine/bays.ts'
import { generate } from '../engine/generate.ts'
import { canSlide } from '../engine/shape.ts'
import { addWarehouseType, moveGridLines, removePicked, shapeWarehouse, slideElements } from '../actions.ts'
import { actions } from '../../../state/actions/index.ts'

/** The new block (200 × 96 m, 66 × 32 modules; column lines along x on modules 0, 3, 7, 11… 63, 66): a dock on every
 *  module of its front's interior bays (e1 on module 3 … e60 on module 62), its court in front. */
function block(): { p: Project; id: string } {
  const { project: p, id } = addWarehouseType(demoProject())
  return { p, id }
}
const typeIn = (p: Project, id: string) => p.warehouseTypes!.find((t) => t.id === id)!
const linesX = (p: Project, id: string) => lineModules(generate(typeIn(p, id)).runs.x)
const moduleOf = (p: Project, id: string, el: string) => typeIn(p, id).elements.find((e) => e.id === el)?.module

describe('moveGridLines', () => {
  it('two lines by +1 module, together', () => {
    const { p, id } = block()
    expect(linesX(p, id).slice(0, 4)).toEqual([0, 3, 7, 11])
    const q = moveGridLines(p, id, 'x', [1, 2], 1)
    expect(linesX(q, id).slice(0, 4)).toEqual([0, 4, 8, 11])
    expect(moveGridLines(q, id, 'x', [1, 2], -1)).not.toBe(q)
    expect(linesX(moveGridLines(q, id, 'x', [1, 2], -1), id).slice(0, 4)).toEqual([0, 3, 7, 11])
  })

  it('blocked by a neighbour not moved: none moves', () => {
    const { p, id } = block()
    // C on 7 by +4 would stand on D (11)
    expect(moveGridLines(p, id, 'x', [1, 2], 4)).toBe(p)
    // B on 3 by −3 would stand on the wall A (0)
    expect(moveGridLines(p, id, 'x', [1, 2], -3)).toBe(p)
    // as far as a module short of D: allowed
    expect(linesX(moveGridLines(p, id, 'x', [1, 2], 3), id).slice(0, 4)).toEqual([0, 6, 10, 11])
  })

  it('the box’s first and last never move; only a neighbour not moved blocks', () => {
    const { p, id } = block()
    // A is the wall: it stays, B and C move
    const q = moveGridLines(p, id, 'x', [0, 1, 2], 1)
    expect(linesX(q, id).slice(0, 4)).toEqual([0, 4, 8, 11])
    // B, C and D by +3: D a module short of E (15)
    expect(linesX(moveGridLines(p, id, 'x', [1, 2, 3], 3), id).slice(0, 5)).toEqual([0, 6, 10, 14, 15])
    expect(moveGridLines(p, id, 'x', [0], 1)).toBe(p)
    expect(moveGridLines(p, id, 'x', [17], -1)).toBe(p)
    expect(moveGridLines(p, id, 'x', [1, 2], 0)).toBe(p)
  })
})

describe('slideElements', () => {
  it('slides docks along their wall by whole modules, all together', () => {
    const { p, id } = block()
    // e59 on 61, e60 on 62: by +3 to 64 and 65, the front's last module
    const q = slideElements(p, id, ['e59', 'e60'], 3)
    expect([moduleOf(q, id, 'e59'), moduleOf(q, id, 'e60')]).toEqual([64, 65])
  })

  it('past the edge’s end, or onto a dock not moved: none slides', () => {
    const { p, id } = block()
    // to 65 and 66: the front has modules 0–65
    expect(slideElements(p, id, ['e59', 'e60'], 4)).toBe(p)
    // e1 on 3 by −4: module −1
    expect(slideElements(p, id, ['e1', 'e60'], -4)).toBe(p)
    // e30 on 32 by +1: e31 stands on 33
    expect(slideElements(p, id, ['e30'], 1)).toBe(p)
    // e30 and e31 together by +1: e32 on 34
    expect(slideElements(p, id, ['e30', 'e31'], 1)).toBe(p)
    expect(slideElements(p, id, ['e60'], 0)).toBe(p)
  })

  it('canSlide, the check the plan’s preview and slideElements share (final review, Minor 3)', () => {
    const { p, id } = block()
    const g = generate(typeIn(p, id))
    const on = (ids: string[], by: number) => canSlide(typeIn(p, id).elements, g.edges, ids, by)
    expect(on(['e59', 'e60'], 3)).toBe(true)
    expect(on(['e59', 'e60'], 4)).toBe(false)
    expect(on(['e1', 'e60'], -4)).toBe(false)
    expect(on(['e30'], 1)).toBe(false)
    expect(on(['e30', 'e31'], 1)).toBe(false)
    expect(on(['e60'], 0)).toBe(false)
    expect(on(['nope'], 1)).toBe(false)
    // the verb does what the check says
    for (const [ids, by] of [
      [['e59', 'e60'], 3],
      [['e30'], 1],
      [['e59', 'e60'], -2],
    ] as const)
      expect(slideElements(p, id, [...ids], by) !== p).toBe(on([...ids], by))
  })
})

describe('removePicked', () => {
  it('delete a mixed selection: docks, a column line, a hole and a court-only court, in one step', () => {
    let { p, id } = block()
    p = shapeWarehouse(p, id, { kind: 'hole', x: [10, 14], y: [4, 8] }).project
    const hole = typeIn(p, id).morphology.holes![0].id
    // a court on the back, which has no docks
    p = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? { ...t, courts: [{ edge: 'e3' }] } : t)) }
    const q = removePicked(p, id, [
      { kind: 'element', id: 'e1' },
      { kind: 'element', id: 'e2' },
      { kind: 'line', id: 'x1', axis: 'x', line: 1 },
      { kind: 'line', id: 'x3', axis: 'x', line: 3 },
      { kind: 'hole', id: hole },
      { kind: 'court', id: 'e3' },
      // a zone is not deleted
      { kind: 'zone', id: '1' },
    ])
    const t = typeIn(q, id)
    expect(t.elements).toHaveLength(58)
    expect(t.elements.some((e) => e.id === 'e1' || e.id === 'e2')).toBe(false)
    // B and D gone: A, C, E…
    expect(linesX(q, id).slice(0, 3)).toEqual([0, 7, 15])
    expect(t.morphology.holes ?? []).toHaveLength(0)
    expect(t.courts).toBeUndefined()
    expect(removePicked(p, id, [{ kind: 'zone', id: '1' }])).toBe(p)
  })
})

describe('a block’s dimensions stay with the block (final review, Minor 4)', () => {
  it('its left wall pulled out moves line A back: the dimensions move with what they measure', () => {
    let { p, id } = block()
    const a = { x: 10, y: 0 }
    const b = { x: 22, y: 0 }
    p = actions.addDimension(p, a, b, -5, undefined, { type: id })!.project
    const left = generate(typeIn(p, id)).edges.find((e) => !e.horizontal && e.from.x === 0 && e.to.x === 0)!
    const r = shapeWarehouse(p, id, { kind: 'pull', edge: left.id, from: 1, to: 3, by: 2 })
    expect(r.shift).toEqual({ x: -6, y: 0 })
    const d = typeIn(r.project, id).dimensions![0]
    // what stood at 10 m from A now stands at 16 m from it
    expect(d.a).toEqual({ x: 16, y: 0 })
    expect(d.b).toEqual({ x: 28, y: 0 })
    expect(d.offset).toBe(-5)
    // no shift: as they were
    const hole = shapeWarehouse(p, id, { kind: 'hole', x: [10, 14], y: [4, 8] })
    expect(hole.shift).toEqual({ x: 0, y: 0 })
    expect(typeIn(hole.project, id).dimensions![0]).toMatchObject({ a, b })
  })
})
