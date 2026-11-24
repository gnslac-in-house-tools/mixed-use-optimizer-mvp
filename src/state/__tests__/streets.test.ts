// The streets' model and verbs (Decision "Streets", ST.1): nodes and segments in an option, street types, a point
// that joins a node or splits a segment, and the engine reading a run of segments as one road.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Project, type Streets } from '../../model/schema.ts'
import { defaultStreetTypes, streetRoads, streetTypesOf } from '../../engine/circulation/streets.ts'
import { derive } from '../../engine/derive.ts'
import {
  drawStreet,
  moveStreetNode,
  moveStreetNodes,
  removeStreetNode,
  removeStreetSegment,
  setStreetSegmentType,
  setStreetTypes,
  splitStreetSegment,
} from '../actions/streets.ts'
import { demoProject } from '../demo.ts'
import { migrate } from '../../model/migrate.ts'
import { distancePointSegment } from '../../engine/geom/polygon.ts'

/** The demo without its streets (since ST.4 it has the ones it derived before): each test draws its own. */
const bare = () => demoProject({ streets: false })

const o1 = 'o1'
const streets = (p: Project): Streets => p.options.find((o) => o.id === o1)!.streets ?? { nodes: [], segments: [] }
const drawn = (p: Project, points: { x: number; y: number }[], type?: string) => drawStreet(p, o1, points, type)!.project

describe('street types', () => {
  it('are trucks and cars at the standards’ road widths until the project has its own', () => {
    const p = bare()
    const [trucks, cars] = streetTypesOf(p)
    expect(trucks).toMatchObject({ id: 'trucks', vehicles: 'trucks', width: 8 })
    expect(cars).toMatchObject({ id: 'cars', vehicles: 'cars', width: 6 })
    // an option's searched width (the optimizer's road.width) reaches the default types
    expect(defaultStreetTypes(p, { standards: { roadWidth: 10 } })[0].width).toBe(10)
    const own = setStreetTypes(p, [{ id: 'main', name: 'Main', width: 12, radius: 15, vehicles: 'all' }])
    expect(streetTypesOf(own).map((t) => t.id)).toEqual(['main'])
    expect(ProjectSchema.safeParse(own).success).toBe(true)
  })

  it('are never none, nor two of one id', () => {
    const p = bare()
    expect(setStreetTypes(p, [])).toBe(p)
    const t = { id: 'x', name: 'X', width: 7, radius: 6, vehicles: 'cars' as const }
    expect(setStreetTypes(p, [t, t])).toBe(p)
  })
})

describe('drawing streets', () => {
  it('makes a node per point and a segment between each two, of the first type unless told', () => {
    const r = drawStreet(bare(), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }])!
    const s = streets(r.project)
    expect(r.nodes).toHaveLength(3)
    expect(s.nodes).toHaveLength(3)
    expect(s.segments.map((g) => g.type)).toEqual(['trucks', 'trucks'])
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    const cars = drawStreet(bare(), o1, [{ x: 0, y: 0 }, { x: 9, y: 0 }], 'cars')!
    expect(streets(cars.project).segments[0].type).toBe('cars')
  })

  it('joins a node it starts on and splits a segment it ends on (a T)', () => {
    let p = drawn(bare(), [{ x: 0, y: 0 }, { x: 100, y: 0 }])
    p = drawn(p, [{ x: 100, y: 0 }, { x: 100, y: 60 }]) // from the first street's end
    expect(streets(p).nodes).toHaveLength(3)
    p = drawn(p, [{ x: 40, y: 50 }, { x: 40, y: 0.01 }]) // onto the first street's middle
    const s = streets(p)
    expect(s.nodes).toHaveLength(5)
    expect(s.segments).toHaveLength(4)
    const t = s.nodes.find((n) => n.x === 40 && n.y === 0)!
    expect(s.segments.filter((g) => g.a === t.id || g.b === t.id)).toHaveLength(3)
  })

  it('makes a node where it crosses a street (an X), and where it crosses itself', () => {
    let p = drawn(bare(), [{ x: 0, y: 0 }, { x: 100, y: 0 }])
    p = drawn(p, [{ x: 50, y: -50 }, { x: 50, y: 50 }])
    const s = streets(p)
    expect(s.nodes).toHaveLength(5)
    expect(s.segments).toHaveLength(4)
    const x = s.nodes.find((n) => n.x === 50 && n.y === 0)!
    expect(s.segments.filter((g) => g.a === x.id || g.b === x.id)).toHaveLength(4)
    const loop = drawn(bare(), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: -40 }, { x: 25, y: 20 }])
    expect(streets(loop).nodes.find((n) => Math.abs(n.x - 25) < 1e-9 && Math.abs(n.y) < 1e-9)).toBeTruthy()
    expect(ProjectSchema.safeParse(loop).success).toBe(true)
  })

  it('draws nothing with fewer than two distinct points, or over a segment already there', () => {
    const p = bare()
    expect(drawStreet(p, o1, [{ x: 0, y: 0 }, { x: 0.01, y: 0 }])).toBeNull()
    expect(drawStreet(p, 'nope', [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeNull()
    const q = drawn(p, [{ x: 0, y: 0 }, { x: 10, y: 0 }])
    expect(drawStreet(q, o1, [{ x: 10, y: 0 }, { x: 0, y: 0 }])).toBeNull()
  })

  it('keeps ids unique across the options', () => {
    let p = drawn(bare(), [{ x: 0, y: 0 }, { x: 10, y: 0 }])
    p = { ...p, options: [...p.options, { id: 'o2', name: 'Option 2', buildingIds: [] }] }
    p = drawStreet(p, 'o2', [{ x: 0, y: 5 }, { x: 10, y: 5 }])!.project
    const all = p.options.flatMap((o) => o.streets?.segments ?? []).map((g) => g.id)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('editing streets', () => {
  const base = () => drawn(bare(), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }])

  it('moves a node, its segments following; moves several by a vector', () => {
    const p = base()
    const corner = streets(p).nodes[1]
    const q = moveStreetNode(p, o1, corner.id, { x: 60, y: 0 })
    expect(streets(q).nodes[1]).toMatchObject({ x: 60, y: 0 })
    const r = moveStreetNodes(p, o1, streets(p).nodes.map((n) => n.id), { x: 5, y: 5 })
    expect(streets(r).nodes.map((n) => [n.x, n.y])).toEqual([[5, 5], [55, 5], [55, 45]])
  })

  it('splits a segment where asked, not at its ends', () => {
    const p = base()
    const g = streets(p).segments[0]
    const r = splitStreetSegment(p, o1, g.id, { x: 20, y: 3 })!
    expect(streets(r.project).nodes.find((n) => n.id === r.id)).toMatchObject({ x: 20, y: 0 })
    expect(streets(r.project).segments).toHaveLength(3)
    expect(splitStreetSegment(p, o1, g.id, { x: 0, y: 0 })).toBeNull()
  })

  it('removes a segment, and the nodes left with nothing; the last one takes the field', () => {
    const p = base()
    const [first, second] = streets(p).segments
    const r = removeStreetSegment(p, o1, first.id)
    expect(streets(r).segments.map((g) => g.id)).toEqual([second.id])
    expect(streets(r).nodes).toHaveLength(2)
    const gone = removeStreetSegment(r, o1, second.id)
    expect(gone.options.find((o) => o.id === o1)!.streets).toBeUndefined()
  })

  it('removes a node: between two segments of one type the street goes on past it; at an end or a T its segments go', () => {
    const p = base()
    const [start, corner, end] = streets(p).nodes
    const joined = removeStreetNode(p, o1, corner.id)
    expect(streets(joined).segments).toHaveLength(1)
    expect(streets(joined).segments[0]).toMatchObject({ a: start.id, b: end.id })
    const shorter = removeStreetNode(p, o1, end.id)
    expect(streets(shorter).segments).toHaveLength(1)
    expect(streets(shorter).nodes.map((n) => n.id)).toEqual([start.id, corner.id])
    // a T: the three meet at the corner, all go
    const t = drawn(p, [{ x: 50, y: 0 }, { x: 90, y: 0 }])
    expect(streets(removeStreetNode(t, o1, corner.id)).segments).toHaveLength(0)
  })

  it('changes a segment’s type, dropping its own vehicles and radius, keeping its sides', () => {
    let p = base()
    const g = streets(p).segments[0]
    p = { ...p, options: p.options.map((o) => (o.id === o1 ? { ...o, streets: { ...o.streets!, segments: o.streets!.segments.map((x) => (x.id === g.id ? { ...x, left: 3, right: 7, vehicles: 'cars' as const, radius: 2 } : x)) } } : o)) }
    const r = setStreetSegmentType(p, o1, [g.id], 'cars')
    expect(streets(r).segments[0]).toEqual({ id: g.id, a: g.a, b: g.b, type: 'cars', left: 3, right: 7 })
    expect(setStreetSegmentType(p, o1, [g.id], 'boats')).toBe(p)
  })

  it('joins a node dropped on another: the segment between them goes, the street goes on through it', () => {
    const p = base()
    const [start, corner, end] = streets(p).nodes
    const q = moveStreetNode(p, o1, corner.id, { x: end.x, y: end.y })
    expect(streets(q).nodes.map((n) => n.id)).toEqual([start.id, end.id])
    expect(streets(q).segments).toHaveLength(1)
    expect(streets(q).segments[0]).toMatchObject({ a: start.id, b: end.id })
    expect(ProjectSchema.safeParse(q).success).toBe(true)
    // all of a street onto one point: nothing is left
    const one = moveStreetNode(moveStreetNode(p, o1, corner.id, { x: 0, y: 0 }), o1, end.id, { x: 0, y: 0 })
    expect(one.options.find((o) => o.id === o1)!.streets).toBeUndefined()
  })

  it('makes a T where a node is dropped on another street, and a node where two streets cross', () => {
    let p = drawn(base(), [{ x: 20, y: 30 }, { x: 20, y: 60 }])
    const free = streets(p).nodes.find((n) => n.x === 20 && n.y === 30)!
    const t = moveStreetNode(p, o1, free.id, { x: 20, y: 0 }) // onto the first street's first segment
    expect(streets(t).segments.filter((g) => g.a === free.id || g.b === free.id)).toHaveLength(3)
    // a whole street moved across another: the crossing is a node of both
    p = drawn(bare(), [{ x: 0, y: 0 }, { x: 100, y: 0 }])
    p = drawn(p, [{ x: 150, y: -50 }, { x: 150, y: 50 }])
    const second = streets(p).nodes.slice(2).map((n) => n.id)
    const x = moveStreetNodes(p, o1, second, { x: -100, y: 0 })
    expect(streets(x).nodes).toHaveLength(5)
    expect(streets(x).segments).toHaveLength(4)
    expect(streets(x).nodes.find((n) => n.x === 50 && n.y === 0)).toBeTruthy()
  })

  it('refuses points that are not numbers', () => {
    const p = base()
    const n = streets(p).nodes[0]
    expect(drawStreet(p, o1, [{ x: 0, y: 0 }, { x: Number.NaN, y: 5 }, { x: 9, y: 9 }])).toBeNull()
    expect(moveStreetNode(p, o1, n.id, { x: Number.POSITIVE_INFINITY, y: 0 })).toBe(p)
    expect(moveStreetNodes(p, o1, [n.id], { x: Number.NaN, y: 0 })).toBe(p)
    expect(splitStreetSegment(p, o1, streets(p).segments[0].id, { x: Number.NaN, y: 0 })).toBeNull()
  })

  it('refuses in the schema a segment to a node that is not there', () => {
    const p = base()
    const bad = { ...p, options: p.options.map((o) => (o.id === o1 ? { ...o, streets: { nodes: o.streets!.nodes.slice(1), segments: o.streets!.segments } } : o)) }
    expect(ProjectSchema.safeParse(bad).success).toBe(false)
  })
})

describe('the engine reads streets', () => {
  it('as one road per run through nodes where only two meet, of one type and width', () => {
    let p = drawn(bare(), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])
    p = drawn(p, [{ x: 50, y: 0 }, { x: 50, y: 60 }], 'cars') // a T at the middle node
    const roads = streetRoads(streets(p), streetTypesOf(p))
    expect(roads).toHaveLength(3)
    expect(roads.every((r) => r.kind === 'street')).toBe(true)
    const straight = drawn(bare(), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])
    const one = streetRoads(streets(straight), streetTypesOf(straight))
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], width: 8, vehicles: 'trucks', streetType: 'trucks' })
    expect(one[0].segments).toHaveLength(2)
  })

  it('rounds its corners with its type’s turning radius, its ends and its nodes where they are', () => {
    const p = drawn(bare(), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }]) // trucks: 15 m
    const [r] = streetRoads(streets(p), streetTypesOf(p))
    expect(r.points[0]).toEqual({ x: 0, y: 0 })
    expect(r.points[r.points.length - 1]).toEqual({ x: 50, y: 40 })
    expect(r.points[1].x).toBeCloseTo(35)
    expect(r.points[r.points.length - 2].y).toBeCloseTo(15)
    // every arc point 15 m from the centre (35, 15)
    for (const q of r.points.slice(1, -1)) expect(Math.hypot(q.x - 35, q.y - 15)).toBeCloseTo(15)
    expect(r.nodePoints).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }])
  })

  it('in the circulation, with its Issues: a street over a building, or ending nowhere', () => {
    const p = bare()
    const m = derive(p, o1).masses
    const anyMass = Object.values(m).find((x) => x.built && x.polygon.length >= 3)!
    const xs = anyMass.polygon.map((q) => q.x)
    const ys = anyMass.polygon.map((q) => q.y)
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const across = drawn(p, [{ x: Math.min(...xs) - 30, y: cy }, { x: Math.max(...xs) + 30, y: cy }])
    const d = derive(across, o1)
    expect(d.circulation.roads.some((r) => r.kind === 'street')).toBe(true)
    const issues = d.issues.filter((i) => i.code === 'road' && i.message.startsWith('A street'))
    expect(issues.some((i) => i.message.includes('runs over'))).toBe(true)
    expect(issues.some((i) => i.message.includes('ends nowhere'))).toBe(true)
  })
})

describe('the roads drawn by hand of an old project (v9 → v10, ST.3)', () => {
  it('become its streets: a node per point (shared where two roads meet), its type by its vehicles, its own width and vehicles where they differ', () => {
    const p = bare()
    const { version: _, ...rest } = p
    const roads = [
      { id: 'r1', points: [{ x: 0, y: -40 }, { x: 100, y: -40 }], width: 8, vehicles: 'trucks' },
      { id: 'r2', points: [{ x: 100, y: -40 }, { x: 100, y: -90 }, { x: 140, y: -90 }], width: 10, vehicles: 'all' },
      { id: 'r3', points: [{ x: 0, y: -60 }, { x: 0.01, y: -60 }, { x: 0, y: -100 }], width: 6, vehicles: 'cars', replaces: { x: 5, y: 5 } },
    ]
    const old = { ...rest, version: 9, options: p.options.map((o, i) => (i === 0 ? { ...o, roads, removedRoads: [{ x: 1, y: 1 }] } : o)) }
    const v10 = migrate(old as never, 10) as unknown as Project & { options: { removedRoads?: unknown }[] }
    const o = v10.options[0]
    expect('roads' in o).toBe(false)
    const s = o.streets!
    // r1's end is r2's start: one node
    expect(s.nodes).toHaveLength(2 + 2 + 2)
    expect(s.segments.map((g) => ({ type: g.type, width: (g as { width?: number }).width, vehicles: g.vehicles }))).toEqual([
      { type: 'trucks', width: undefined, vehicles: undefined },
      { type: 'trucks', width: 10, vehicles: 'all' },
      { type: 'trucks', width: 10, vehicles: 'all' },
      // a point 1 cm from the one before it is that one: one segment, of the cars' type at the cars' width
      { type: 'cars', width: undefined, vehicles: undefined },
    ])
    expect(o.removedRoads).toEqual([{ x: 1, y: 1 }, { x: 5, y: 5 }])
    // read whole (v11, with the roads it derived drawn too): each still a street of its width and vehicles
    const q = ProjectSchema.parse(migrate(old as never))
    const roadsAt = (x: number, y: number) =>
      derive(q, o.id)
        .circulation.roads.filter((r) => r.points.slice(1).some((b, i) => distancePointSegment({ x, y }, r.points[i], b) < 0.05))
        .map((r) => [r.width, r.vehicles])
    expect([roadsAt(50, -40), roadsAt(100, -65), roadsAt(0, -80)]).toEqual([[[8, 'trucks']], [[10, 'all']], [[6, 'cars']]])
  })
})
