// Project 19 (Phase PE.1): a street segment keeps the paving each side of its drawn line (`left`, `right`) in place of
// `width` and `side`. Version 18 files read to 19 with the same streets.
import { describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import { difference, offset, regionsArea } from '../../engine/geom/boolean.ts'
import { stripRegions } from '../../engine/path/strip.ts'
import { readGft } from '../../io/gft.ts'
import { demoProject } from '../../state/demo.ts'
import { migrate } from '../migrate.ts'
import { ProjectSchema, type Project } from '../schema.ts'

type Json = Record<string, unknown>

/** The project as a version 18 file: each segment with a `width` and `side` in place of `left` and `right`. */
function asV18(p: Project, old: (left: number, right: number, i: number) => Json): Json {
  const json = JSON.parse(JSON.stringify(p)) as Json
  json.version = 18
  json.options = (json.options as Json[]).map((o) => {
    const streets = o.streets as { segments: Json[] } | undefined
    if (!streets) return o
    const segments = streets.segments.map(({ left, right, ...g }, i) => ({ ...g, ...old(left as number, right as number, i) }))
    return { ...o, streets: { ...streets, segments } }
  })
  return json
}
const segmentsOf = (j: Json) => (((j.options as Json[])[0].streets as { segments: Json[] }).segments as Json[]).map((g) => [g.left, g.right, 'width' in g, 'side' in g])

describe('version 18 to 19: a street’s sides', () => {
  const p = demoProject()

  it('its own width 10 by its left edge: 0 + 10; by its right edge: 10 + 0', () => {
    expect(segmentsOf(migrate(asV18(p, (_l, _r, i) => ({ width: 10, side: i % 2 ? 'right' : 'left' }))))[0]).toEqual([0, 10, false, false])
    expect(segmentsOf(migrate(asV18(p, () => ({ width: 10, side: 'right' }))))[0]).toEqual([10, 0, false, false])
  })

  it('the type’s width, centred: trucks 7.5 → 3.75 + 3.75', () => {
    const q = { ...p, standards: { ...p.standards, streetTypes: [{ id: 'trucks', name: 'Trucks', width: 7.5, radius: 15, vehicles: 'trucks' as const }] } }
    expect(segmentsOf(migrate(asV18(q, () => ({}))))[0]).toEqual([3.75, 3.75, false, false])
  })

  it('an option whose standards say a road width of 9: its type-following segments 4.5 + 4.5', () => {
    const q = { ...p, options: p.options.map((o, i) => (i === 0 ? { ...o, standards: { roadWidth: 9 } } : o)) }
    const j = asV18(q, () => ({}))
    if (j.standards) delete (j.standards as Json).streetTypes
    const segs = (((migrate(j).options as Json[])[0].streets as { segments: Json[] }).segments as Json[]).filter((g) => g.type === 'trucks')
    expect(segs.length).toBeGreaterThan(0)
    expect(segs.every((g) => g.left === 4.5 && g.right === 4.5)).toBe(true)
  })

  it('a segment that has its sides already keeps them', () => {
    const j = asV18(p, (l, r) => ({ left: l + 1, right: r }))
    expect((segmentsOf(migrate(j))[0] as number[])[0]).toBe((p.options[0].streets!.segments[0].left as number) + 1)
  })

  it('a .gft of 18 opens at 19 with the same derived roads (points within 1 mm)', () => {
    const j = asV18(p, (l, r) => ({ width: l + r, ...(l === 0 ? { side: 'left' } : r === 0 ? { side: 'right' } : {}) }))
    const r = readGft(JSON.stringify({ format: 'gfit', ...j }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.version).toBe(20)
    const a = derive(p).circulation.roads
    const b = derive(r.project).circulation.roads
    expect(b).toHaveLength(a.length)
    a.forEach((road, i) => road.points.forEach((q, k) => {
      expect(Math.abs(q.x - b[i].points[k].x)).toBeLessThan(1e-3)
      expect(Math.abs(q.y - b[i].points[k].y)).toBeLessThan(1e-3)
    }))
  })

  it('the schema refuses a street under 0.5 m', () => {
    const q = JSON.parse(JSON.stringify(p)) as Project
    q.options[0].streets!.segments[0].left = 0.1
    q.options[0].streets!.segments[0].right = 0.1
    expect(ProjectSchema.safeParse(q).success).toBe(false)
  })
})

describe('version 18 to 19: an existing road’s sides', () => {
  /** The project as a version 18 file: its existing roads with a `width` in place of `stretches`. */
  function withRoads(p: Project): Json {
    const json = JSON.parse(JSON.stringify(p)) as Json
    json.version = 18
    const site = json.site as Json
    site.existingRoads = [{ id: 'r1', points: [{ x: -50, y: 140 }, { x: 200, y: 140 }, { x: 460, y: 160 }], width: 12, name: 'Old road' }]
    return json
  }

  it('a road of width 12 is 6 + 6 on every stretch, its width gone', () => {
    const road = ((migrate(withRoads(demoProject())).site as Json).existingRoads as Json[])[0]
    expect(road.stretches).toEqual([{ left: 6, right: 6 }, { left: 6, right: 6 }])
    expect('width' in road).toBe(false)
    expect(road.name).toBe('Old road')
  })

  it('the buildable area of the sample is the one of version 18: the site less its setback and a 12 m strip along the line', () => {
    const base = demoProject()
    const read = readGft(JSON.stringify({ format: 'gfit', ...withRoads(base) }))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    // version 18 read an existing road as a strip of its `width` about its centre line: made here from the line and 12, not from stretches
    const bare: Project = { ...base, site: { ...base.site, existingRoads: undefined } }
    const around = derive(bare).site.buildable
    const strip = stripRegions([{ points: [{ x: -50, y: 140 }, { x: 200, y: 140 }, { x: 460, y: 160 }], width: 12 }])
    const keepOff = base.site.rules.setback > 0 ? offset(strip.flat(), base.site.rules.setback) : strip
    const v18 = regionsArea(difference(around.flat(), keepOff.flat()))
    expect(regionsArea(around) - v18).toBeGreaterThan(100)
    expect(Math.abs(derive(read.project).metrics.buildableArea - v18)).toBeLessThan(1)
  })

  it('the schema wants a pair of sides per stretch, 0.5 m wide at least', () => {
    const q = JSON.parse(JSON.stringify(migrate(withRoads(demoProject())))) as Project
    q.site.existingRoads![0].stretches.pop()
    expect(ProjectSchema.safeParse(q).success).toBe(false)
    const r = JSON.parse(JSON.stringify(migrate(withRoads(demoProject())))) as Project
    r.site.existingRoads![0].stretches[1] = { left: 0.1, right: 0.1 }
    expect(ProjectSchema.safeParse(r).success).toBe(false)
  })
})
