// A widened street is one street to a group (Phase PE.1 review, batch A): it derives as several runs (a street whose middle
// stretch is wider), but Group, Ungroup and the cleanup of a group of one read it once, by its street id.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { groupIdsIn, isThere, membersOfGroup, refGroupMembers, roadIdOfSegment, roadSegmentIds, withGroupOn } from '../../../engine/groups.ts'
import type { Project } from '../../../model/schema.ts'
import { addLot } from '../../../modules/parking/actions.ts'
import { demoProject } from '../../demo.ts'
import { settle } from '../../settle.ts'
import { actions } from '../index.ts'

const OPTION = 'o1'
const STREET = { kind: 'street', id: 'street:s1' }

/** The demo with one street of three segments (the middle one wider: three runs) and a free lot. */
function world() {
  const base = demoProject()
  const nodes = [
    { id: 'n1', x: 60, y: 161 },
    { id: 'n2', x: 60, y: 185 },
    { id: 'n3', x: 60, y: 205 },
    { id: 'n4', x: 60, y: 230 },
  ]
  const g = (id: string, a: string, b: string, left = 4, right = 4) => ({ id, a, b, type: 'trucks', left, right })
  const streets = { nodes, segments: [g('s1', 'n1', 'n2'), g('s2', 'n2', 'n3', 4, 8), g('s3', 'n3', 'n4')] }
  let p: Project = { ...base, options: [{ ...base.options[0], streets }] }
  const lot = addLot(p, OPTION, { rect: { center: { x: 220, y: 200 }, width: 40, depth: 30, rotation: 0 } })!
  p = lot.project
  return { p, lot: { kind: 'lot', id: lot.id } }
}

const segs = (p: Project) => p.options[0].streets!.segments

describe('a widened street is one street to a group', () => {
  it('is three runs and one street', () => {
    const { p } = world()
    expect(derive(p, OPTION).circulation.roads.filter((r) => r.kind === 'street')).toHaveLength(3)
    expect(roadSegmentIds(p, OPTION, 'street:s1')).toEqual(['s1', 's2', 's3'])
    expect(roadIdOfSegment(p, OPTION, 's3')).toBe('street:s1')
    expect(isThere(p, OPTION, STREET)).toBe(true)
    expect(isThere(p, OPTION, { kind: 'street', id: 'street:s2' })).toBe(false)
  })

  it('Group puts the group on every segment of the street', () => {
    const { p, lot } = world()
    const made = actions.groupRefs(p, OPTION, [STREET, lot])!
    expect(segs(made.project).map((s) => s.group)).toEqual([made.id, made.id, made.id])
    expect(membersOfGroup(made.project, OPTION, made.id)).toEqual([STREET, lot])
  })

  it('a group made before the widening counts the street once', () => {
    const { p, lot } = world()
    const q = withGroupOn(p, OPTION, [{ kind: 'segment', id: 's1' }, { kind: 'segment', id: 's2' }, { kind: 'segment', id: 's3' }, lot], 'g1')
    expect(membersOfGroup(q, OPTION, 'g1')).toEqual([STREET, lot])
    expect(refGroupMembers(q, OPTION, lot)).toHaveLength(2)
  })

  it('deleting the lot leaves no group of one street', () => {
    const { p, lot } = world()
    const q = actions.groupRefs(p, OPTION, [STREET, lot])!.project
    const r = settle(q, actions.removeLots(q, OPTION, [lot.id]))
    if (!('project' in r)) throw new Error(r.refused)
    expect(groupIdsIn(r.project)).toEqual([])
    expect(segs(r.project).every((s) => s.group === undefined)).toBe(true)
  })

  it('Ungroup takes the street apart from the lot, whole', () => {
    const { p, lot } = world()
    const q = actions.groupRefs(p, OPTION, [STREET, lot])!.project
    const free = actions.ungroupRefs(q, OPTION, [lot])
    expect(groupIdsIn(free)).toEqual([])
    expect(segs(free).every((s) => s.group === undefined)).toBe(true)
  })

  it('a locked run holds the group of the whole street', () => {
    const { p, lot } = world()
    const locked = actions.lockStreets(p, ['s3'], true, OPTION)
    expect(actions.groupRefs(locked, OPTION, [STREET, lot])).toBeNull()
  })
})
