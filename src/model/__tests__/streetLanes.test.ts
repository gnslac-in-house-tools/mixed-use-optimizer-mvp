// Project 20 (Phase PE.2, task 2): a street segment and an existing road's stretch may keep the lanes they are divided in
// (`lanes`, m left to right, adding up to the width within 1 mm), and the standards a `laneWidth`. Version 19 files read to 20 unchanged.
import { describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import { readGft } from '../../io/gft.ts'
import { demoProject } from '../../state/demo.ts'
import { migrate } from '../migrate.ts'
import { PROJECT_VERSION, ProjectSchema, type Project } from '../schema.ts'

type Json = Record<string, unknown>

const clone = (p: Project): Project => JSON.parse(JSON.stringify(p)) as Project
const withLanes = (lanes: number[] | undefined, left = 0, right = 10.5): Project => {
  const q = clone(demoProject())
  Object.assign(q.options[0].streets!.segments[0], { left, right, ...(lanes ? { lanes } : {}) })
  return q
}

describe('the lanes of a segment', () => {
  it('the project is at version 20', () => {
    expect(PROJECT_VERSION).toBe(20)
  })

  it('lanes that add up to the width are valid; absent lanes too', () => {
    expect(ProjectSchema.safeParse(withLanes([3.5, 3.5, 3.5])).success).toBe(true)
    expect(ProjectSchema.safeParse(withLanes(undefined)).success).toBe(true)
  })

  it('lanes that add up to 10.4 m of 10.5 m are refused, and so is a lane of 0 or an empty list', () => {
    const r = ProjectSchema.safeParse(withLanes([3.5, 3.5, 3.4]))
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('The lanes add up to the street’s width')
    expect(ProjectSchema.safeParse(withLanes([0, 10.5])).success).toBe(false)
    expect(ProjectSchema.safeParse(withLanes([])).success).toBe(false)
  })

  it('lanes within a millimetre of the width are valid', () => {
    expect(ProjectSchema.safeParse(withLanes([3.5, 3.5, 3.5005])).success).toBe(true)
  })
})

describe('the lanes of an existing road’s stretch', () => {
  const road = (stretches: Json[]): Project => {
    const q = clone(demoProject())
    q.site.existingRoads = [{ id: 'r1', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], stretches } as never]
    return q
  }

  it('valid when they add up to the stretch’s width, refused when they do not', () => {
    expect(ProjectSchema.safeParse(road([{ left: 3, right: 4, lanes: [3.5, 3.5] }, { left: 3, right: 4 }])).success).toBe(true)
    const bad = ProjectSchema.safeParse(road([{ left: 3, right: 4, lanes: [3.5, 3.4] }, { left: 3, right: 4 }]))
    expect(bad.success).toBe(false)
    if (!bad.success) expect(bad.error.issues.map((i) => i.message)).toContain('The lanes add up to the street’s width')
  })
})

describe('the standards’ lane width', () => {
  it('is a positive number, optional', () => {
    const q = clone(demoProject())
    expect(ProjectSchema.safeParse({ ...q, standards: { ...q.standards, laneWidth: 3 } }).success).toBe(true)
    expect(ProjectSchema.safeParse({ ...q, standards: { ...q.standards, laneWidth: 0 } }).success).toBe(false)
  })
})

describe('version 19 to 20', () => {
  it('a file of 19 opens at 20 with nothing else changed, and derives the same roads (within 1 mm)', () => {
    const p = demoProject()
    const v19 = { ...clone(p), version: 19 } as unknown as Json
    const read = migrate(v19)
    expect(read).toEqual({ ...v19, version: 20 })
    const r = readGft(JSON.stringify({ format: 'gfit', ...v19 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.version).toBe(20)
    const a = derive(p).circulation.roads
    const b = derive(r.project).circulation.roads
    expect(b).toHaveLength(a.length)
    a.forEach((road, i) => {
      expect(b[i].id).toBe(road.id)
      road.points.forEach((q, k) => {
        expect(Math.abs(q.x - b[i].points[k].x)).toBeLessThan(1e-3)
        expect(Math.abs(q.y - b[i].points[k].y)).toBeLessThan(1e-3)
      })
    })
  })
})
