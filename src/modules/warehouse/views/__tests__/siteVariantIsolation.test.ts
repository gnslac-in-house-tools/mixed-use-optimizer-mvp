// Phase D.3, browser check: a court edit on the site is the copy's own (`overrides.courts`, a variant); the type and the other copies of it are as they were.
// The sample's Cross-dock 1 (b2) and Cross-dock 2 (b3) are two copies of the type wt1 (b3 already has a longer hall of its own).
import { describe, expect, it } from 'vitest'
import type { Point, Project } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import type { Ref } from '../../../../kinds/index.ts'
import { actions } from '../../../../state/actions/index.ts'
import { sampleProject } from '../../../../state/sample.ts'
import { splitCourts } from '../../../../views/editing/shape/splitCourts.ts'
import { siteCourtRefs } from '../BlockCourtHandles.tsx'

const OPTION = 'o1'
const ONE = 'b2'
const TWO = 'b3'

const courtsOf = (p: Project, id: string) => p.buildings.find((b) => b.id === id)!.warehouse!.overrides?.courts
const typeCourts = (p: Project) => JSON.stringify(p.warehouseTypes!.find((t) => t.id === 'wt1')!.courts)
/** What a copy's courts come to on the plan: its refs and the shape each reads. */
const shapesOf = (p: Project, id: string) => {
  const s = siteCourtRefs(p, id)!
  return JSON.stringify(s.refs.map((r) => [r.id, actions.shapeOf(p, r)]))
}
const docksOf = (p: Project, id: string) => {
  const hall = siteCourtRefs(p, id)!.hall
  return JSON.stringify(derive(p, OPTION).circulation.docks.filter((d) => d.massId === hall.id))
}

/** A line along a dock's court from its wall to past its far side, through the middle: it splits that court in two. */
function lineAcross(p: Project, id: string): { a: Point; b: Point }[] {
  const hall = siteCourtRefs(p, id)!.hall
  return derive(p, OPTION).circulation.docks
    .filter((d) => d.massId === hall.id)
    .map((d) => {
      const m = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }
      return { a: { x: m.x - d.out.x * 1, y: m.y - d.out.y * 1 }, b: { x: m.x + d.out.x * (d.depth + 5), y: m.y + d.out.y * (d.depth + 5) } }
    })
}

/** Copy `id` split by a line across its first court that takes it. */
function splitOne(p: Project, id: string, which = 0) {
  const refs = siteCourtRefs(p, id)!.refs
  const s = splitCourts(p, refs, ...(Object.values(lineAcross(p, id)[which]) as [Point, Point]))
  return s
}

describe('a site edit of one placed block’s courts is that copy’s own', () => {
  it('the sample’s two Cross-docks are two copies of one type', () => {
    const p = sampleProject()
    expect(p.buildings.find((b) => b.id === ONE)!.warehouse!.type).toBe(p.buildings.find((b) => b.id === TWO)!.warehouse!.type)
  })

  it('a Split of one of copy 2’s courts leaves copy 1 and the type as they were', () => {
    const p = sampleProject()
    const before = { one: shapesOf(p, ONE), docks: docksOf(p, ONE), type: typeCourts(p) }
    const n = lineAcross(p, TWO).length
    let done = 0
    for (let i = 0; i < n && done === 0; i++) {
      const s = splitOne(p, TWO, i)
      if (s.count === 0) continue
      done++
      expect(courtsOf(s.project, TWO)).toBeDefined()
      expect(courtsOf(s.project, ONE)).toBeUndefined()
      expect(typeCourts(s.project)).toBe(before.type)
      expect(shapesOf(s.project, ONE)).toBe(before.one)
      expect(docksOf(s.project, ONE)).toBe(before.docks)
      expect(shapesOf(s.project, TWO)).not.toBe(shapesOf(p, TWO))
    }
    expect(done).toBe(1)
  })

  it('a court side pulled and a chamfer on copy 2 leave copy 1 and the type as they were', () => {
    const p = sampleProject()
    const before = { one: shapesOf(p, ONE), docks: docksOf(p, ONE), type: typeCourts(p) }
    const refs: Ref[] = siteCourtRefs(p, TWO)!.refs
    const ref = refs[0]
    const shape = actions.shapeOf(p, ref)!
    let edits = 0
    for (const op of [
      { op: 'push' as const, wall: 1, by: -3 },
      { op: 'chamfer' as const, vertex: 2, a: 4, b: 4 },
    ]) {
      const w = actions.editShape(p, ref, op)
      if (w.project === p) continue
      edits++
      expect(courtsOf(w.project, TWO), op.op).toBeDefined()
      expect(courtsOf(w.project, ONE), op.op).toBeUndefined()
      expect(typeCourts(w.project), op.op).toBe(before.type)
      expect(shapesOf(w.project, ONE), op.op).toBe(before.one)
      expect(docksOf(w.project, ONE), op.op).toBe(before.docks)
    }
    expect(shape).toBeDefined()
    expect(edits).toBe(2)
  })

  it('the Split tool looks across every copy’s courts, yet a segment on copy 2 touches none of copy 1’s (the line runs through a court, not past the drawn segment)', () => {
    const p = sampleProject()
    const { a, b } = lineAcross(p, TWO)[0]
    const all = [...siteCourtRefs(p, ONE)!.refs, ...siteCourtRefs(p, TWO)!.refs]
    const s = splitCourts(p, all, a, b)
    expect(s.count).toBeGreaterThan(0)
    expect(courtsOf(s.project, TWO)).toBeDefined()
    expect(courtsOf(s.project, ONE)).toBeUndefined()
    expect(shapesOf(s.project, ONE)).toBe(shapesOf(p, ONE))
  })
})
