// The brief's rules on the masses (Decision "Rules"): the geometry they are measured with, the pairing (each mass with
// its nearest partner; apart, with every one), the Issues (an error when required), the spacing exemption, the links
// (moves with), the verbs and the contract. The demo: Warehouse 1 (m1, x 40–200, y 70–150), Warehouse 2 (m2, x
// 250–390), Office 1 (m3, 40 × 20 at 120,200: 40 m above Warehouse 1); 20 m between buildings. Its industrial rules:
// Office must be adjacent to Warehouse (rule1), Outdoor storage within 40 m of Warehouse (rule2), Guard house at least
// 30 m from Warehouse (rule3).
import { describe, expect, it } from 'vitest'
import type { Polygon, Project } from '../../model/schema.ts'
import { ProjectSchema } from '../../model/schema.ts'
import { addRule, removeRule, updateRule } from '../../state/actions/graph.ts'
import { addMass, moveMass, rotateMass, toggleMassLock } from '../../state/actions/masses.ts'
import { removeProgram } from '../../state/actions/programs.ts'
import { demoProject } from '../../state/demo.ts'
import { derive } from '../derive.ts'
import { snapTo, withFollowers } from '../graph/links.ts'
import { rectAround } from '../graph/place.ts'
import { measureRule, polygonDistance, ruleSentence, sharedWall } from '../graph/relations.ts'

const box = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const rect = (x: number, y: number, w: number, d: number) => ({ kind: 'rect' as const, center: { x, y }, width: w, depth: d, rotation: 0 })
const centre = (p: Project, id: string) => {
  const f = p.masses.find((m) => m.id === id)!.footprint
  return f.kind === 'rect' ? f.center : null
}
const rule = (p: Project, init: Parameters<typeof addRule>[1]) => addRule(p, init)!.project
/** The demo with only the rules given. */
const only = (...rules: Parameters<typeof addRule>[1][]): Project => rules.reduce<Project>((p, r) => rule(p, r), { ...demoProject(), rules: undefined })

describe('geometry', () => {
  it('polygonDistance: the gap between footprints; 0 when they touch, overlap or one holds the other', () => {
    expect(polygonDistance(box(0, 0, 10, 10), box(15, 0, 20, 10))).toBeCloseTo(5)
    expect(polygonDistance(box(0, 0, 10, 10), box(13, 14, 20, 20))).toBeCloseTo(5)
    expect(polygonDistance(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(0)
    expect(polygonDistance(box(0, 0, 100, 100), box(40, 40, 60, 60))).toBe(0)
  })

  it('sharedWall: the overlap of walls on one line, within 5 cm; a corner is not a wall', () => {
    expect(sharedWall(box(0, 0, 10, 10), box(10, 4, 20, 30))).toBeCloseTo(6)
    expect(sharedWall(box(0, 0, 10, 10), box(10.03, 0, 20, 10))).toBeCloseTo(10)
    expect(sharedWall(box(0, 0, 10, 10), box(10.5, 0, 20, 10))).toBe(0)
    expect(sharedWall(box(0, 0, 10, 10), box(10, 10, 20, 20))).toBe(0)
  })

  it('measureRule: each kind met or broken, by how much', () => {
    const base = { id: 'r', a: 'x', b: 'y', weight: 1 }
    const a = box(0, 0, 10, 10)
    expect(measureRule({ ...base, kind: 'adjacent', minShared: 0 }, a, box(10, 2, 20, 8))).toMatchObject({ met: true, value: 6 })
    expect(measureRule({ ...base, kind: 'adjacent', minShared: 8 }, a, box(10, 2, 20, 8))).toMatchObject({ met: false, gap: 2 })
    expect(measureRule({ ...base, kind: 'near', max: 25 }, a, box(40, 0, 50, 10))).toMatchObject({ met: false, value: 30, gap: 5 })
    expect(measureRule({ ...base, kind: 'apart', min: 40 }, a, box(40, 0, 50, 10))).toMatchObject({ met: false, gap: 10 })
    expect(measureRule({ ...base, kind: 'attached' }, a, box(40, 0, 50, 10))).toMatchObject({ met: true })
  })

  it('snapTo: across the wall it is most outside of, onto its line; along it, back over the wall', () => {
    const a = rectAround({ x: 0, y: 0 }, 20, 10)
    expect(snapTo(a, rectAround({ x: 30, y: 0 }, 10, 4))).toEqual({ x: -15, y: 0 })
    expect(snapTo(a, rectAround({ x: 30, y: 40 }, 4, 6))).toEqual({ x: -22, y: -32 })
    expect(snapTo(a, rectAround({ x: 8, y: 0 }, 6, 4))).toEqual({ x: 5, y: 0 })
  })
})

describe('the rules on the masses', () => {
  it('the demo: its office is not against its warehouse — a warning about both, in a sentence', () => {
    const d = derive(demoProject())
    // (and the guard house the brief asks for: Decision "Brief issues")
    d.issues = d.issues.filter((i) => i.code !== 'brief')
    expect(d.relations).toEqual([expect.objectContaining({ id: 'rule1|m3|m1', rule: 'rule1', kind: 'adjacent', a: 'm3', b: 'm1', met: false, value: 0, gap: 1 })])
    expect(d.issues).toEqual([
      {
        code: 'relation',
        severity: 'warning',
        massIds: ['m3', 'm1'],
        message: 'Office 1 and Warehouse 1: Office must be adjacent to Warehouse; they share 0 m of wall.',
        rule: 'rule1',
      },
    ])
    // required: an error
    const req = updateRule(demoProject(), 'rule1', { required: true })
    expect(derive(req).issues[0].severity).toBe('error')
  })

  it('each mass pairs with its nearest partner, found again when the massing moves', () => {
    const p = only({ kind: 'near', a: 'office', b: 'warehouse', max: 60 })
    expect(derive(p).relations.map((x) => x.b)).toEqual(['m1'])
    // the office over Warehouse 2 now: its nearest is Warehouse 2
    const q = moveMass(p, 'm3', { x: 200, y: 0 })
    expect(derive(q).relations.map((x) => x.b)).toEqual(['m2'])
  })

  it('apart: with every partner; a program with itself: one relation per pair', () => {
    const p = only({ kind: 'apart', a: 'warehouse', b: 'warehouse', min: 60 })
    const d = derive(p)
    expect(d.relations).toHaveLength(1)
    expect(d.relations[0]).toMatchObject({ met: false, value: 50, gap: 10 })
    const q = only({ kind: 'apart', a: 'office', b: 'warehouse', min: 30 })
    expect(derive(q).relations.map((x) => `${x.a}-${x.b}`)).toEqual(['m3-m1', 'm3-m2'])
  })

  it('no partner yet: nothing to apply it to, nothing broken', () => {
    const p = only({ kind: 'near', a: 'guardhouse', b: 'warehouse' })
    expect(derive(p).relations).toEqual([])
    const q = only({ kind: 'near', a: 'office', b: 'guardhouse' })
    expect(derive(q).relations).toEqual([])
  })

  it('adjacent: against the wall is met; overlapping is still an error', () => {
    // against Warehouse 1's top wall (a street drawn before runs there: the office stands on it, a warning)
    let p = moveMass({ ...demoProject(), rules: undefined }, 'm3', { x: 0, y: -40 })
    expect(derive(p).issues.filter((i) => i.code !== 'brief' && i.code !== 'road')).toEqual([])
    p = rule(p, { kind: 'adjacent', a: 'office', b: 'warehouse' })
    const d = derive(p)
    expect(d.issues.filter((i) => i.code !== 'brief' && i.code !== 'road')).toEqual([])
    expect(d.relations[0]).toMatchObject({ met: true, value: 40 })
    expect(derive(moveMass(p, 'm3', { x: 0, y: -5 })).issues.some((i) => i.code === 'overlap')).toBe(true)
  })

  it('context buildings are not part of the graph', () => {
    const p = demoProject()
    const ctx = { ...p, buildings: p.buildings.map((b) => ({ ...b, context: true })) }
    expect(derive(ctx).relations).toEqual([])
  })
})

describe('moves with', () => {
  /** The office moves with its nearest warehouse (Warehouse 1). */
  const linked = () => only({ kind: 'attached', a: 'office', b: 'warehouse' })

  it('moving the warehouse moves the office the same; moving the office alone leaves the warehouse', () => {
    const p = linked()
    expect(withFollowers(p, ['m1'])).toEqual(['m1', 'm3'])
    expect(withFollowers(p, ['m2'])).toEqual(['m2'])
    const q = moveMass(p, 'm1', { x: 10, y: -5 })
    expect(centre(q, 'm3')).toEqual({ x: 130, y: 195 })
    expect(centre(moveMass(p, 'm3', { x: 30, y: 0 }), 'm1')).toEqual({ x: 120, y: 110 })
  })

  it('turning the warehouse turns the office around its centre; a locked office stays', () => {
    const q = rotateMass(linked(), 'm1', 90)
    const c = centre(q, 'm3')!
    expect(c.x).toBeCloseTo(30) // 90 m above the centre → 90 m to its left
    expect(c.y).toBeCloseTo(110)
    const locked = toggleMassLock(linked(), 'm3')
    expect(withFollowers(locked, ['m1'])).toEqual(['m1'])
  })
})

describe('verbs and contract', () => {
  it('addRule: defaults, no twin of the same kind and programs, not a missing program', () => {
    const p = { ...demoProject(), rules: undefined }
    const a = addRule(p, { kind: 'near', a: 'office', b: 'warehouse' })!
    expect(a.project.rules).toEqual([{ id: 'rule1', kind: 'near', a: 'office', b: 'warehouse', weight: 1, max: 50 }])
    expect(addRule(a.project, { kind: 'near', a: 'office', b: 'warehouse' })).toEqual({ project: a.project, id: 'rule1' })
    expect(addRule(p, { kind: 'near', a: 'office', b: 'nope' })).toBeNull()
    expect(rule(p, { kind: 'adjacent', a: 'office', b: 'warehouse', required: true, reason: 'Supervision' }).rules![0]).toMatchObject({ minShared: 0, required: true, reason: 'Supervision' })
  })

  it('updateRule: its programs, parameter and weight; another kind starts from its defaults; removeRule', () => {
    const p = only({ kind: 'near', a: 'office', b: 'warehouse', max: 70 })
    expect(updateRule(p, 'rule1', { max: 70 })).toBe(p)
    expect(updateRule(p, 'rule1', { kind: 'apart' }).rules![0]).toEqual({ id: 'rule1', kind: 'apart', a: 'office', b: 'warehouse', weight: 1, min: 30 })
    expect(updateRule(p, 'rule1', { b: 'guardhouse' }).rules![0]).toMatchObject({ b: 'guardhouse', max: 70 })
    expect(updateRule(p, 'rule1', { b: 'nope' })).toBe(p)
    expect('rules' in removeRule(p, 'rule1')).toBe(false)
  })

  it('removing a program removes its rules', () => {
    const p = demoProject()
    expect(removeProgram(p, 'guardhouse').rules!.map((r) => r.id)).toEqual(['rule1', 'rule2'])
  })

  it('a sentence per rule', () => {
    const name = (id: string) => ({ office: 'Office', warehouse: 'Warehouse' })[id] ?? id
    const base = { id: 'r', a: 'office', b: 'warehouse', weight: 1 }
    expect(ruleSentence({ ...base, kind: 'adjacent', minShared: 0 }, name)).toBe('Office must be adjacent to Warehouse')
    expect(ruleSentence({ ...base, kind: 'adjacent', minShared: 12 }, name)).toBe('Office must be adjacent to Warehouse (12 m of wall)')
    expect(ruleSentence({ ...base, kind: 'near', max: 50 }, name)).toBe('Office within 50 m of Warehouse')
    expect(ruleSentence({ ...base, kind: 'apart', min: 30 }, name)).toBe('Office at least 30 m from Warehouse')
    expect(ruleSentence({ ...base, kind: 'attached' }, name)).toBe('Office moves with Warehouse')
  })

  it('the schema: unique ids, both programs exist; the demo validates', () => {
    const p = demoProject()
    expect(ProjectSchema.safeParse(p).success).toBe(true)
    const bad = (rules: unknown) => ProjectSchema.safeParse({ ...p, rules }).success
    expect(bad([...p.rules!, { ...p.rules![0] }])).toBe(false)
    expect(bad([{ ...p.rules![0], b: 'ghost' }])).toBe(false)
    expect(bad([{ ...p.rules![0], kind: 'aligned' }])).toBe(false)
    // a mass with a program has a place in the graph; one added later too
    const q = addMass(p, { programId: 'guardhouse', footprint: rect(400, 250, 6, 4) }).project
    expect(derive(q).relations.some((x) => x.rule === 'rule3')).toBe(true)
  })
})
