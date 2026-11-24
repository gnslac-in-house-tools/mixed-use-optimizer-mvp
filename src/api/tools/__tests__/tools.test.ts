// The agent's tools (Decision "Agent tools"): every verb is a tool or left out on purpose; each tool has a JSON Schema;
// a call is checked, run and settled, and one that cannot run says why.
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { edgeAt } from '../../../engine/geom/perimeter.ts'
import { contourFromPolygon } from '../../../engine/geom/contour.ts'
import { ProjectSchema, type Project } from '../../../model/schema.ts'
import { callTool as hostCall } from '../../../plugins/host.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { shapedSite } from '../../../modules/docks/__tests__/shapedCourtFixture.ts'
import { callTool, defaultContext, LEFT_OUT, toolSchemas, TOOLS } from '../index.ts'

const VERBS = Object.keys(actions)
const toolVerbs = new Set(TOOLS.flatMap((t) => t.verbs))

describe('the list', () => {
  it('every verb of actions is a tool’s or left out, with a reason; nothing else is named', () => {
    expect(VERBS.filter((v) => !toolVerbs.has(v) && !(v in LEFT_OUT))).toEqual([])
    expect([...toolVerbs, ...Object.keys(LEFT_OUT)].filter((v) => !VERBS.includes(v))).toEqual([])
    expect(Object.keys(LEFT_OUT).filter((v) => toolVerbs.has(v))).toEqual([])
  })

  it('names are unique; each has a description and an object JSON Schema', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const s of toolSchemas()) {
      expect(s.description.length, s.name).toBeGreaterThan(10)
      expect(s.inputSchema.type, s.name).toBe('object')
    }
  })
})

describe('a call', () => {
  const p = demoProject()
  const ctx = defaultContext(p)

  it('getProject gives the ids every other tool takes', () => {
    const r = callTool(p, 'getProject', {})
    expect(r.ok && r.changed).toBe(false)
    const out = (r.ok ? r.output : null) as { masses: { id: string; name: string; area: number }[]; options: { id: string; inView: boolean }[] }
    expect(out.masses.map((m) => m.id)).toContain('m1')
    expect(out.masses.find((m) => m.id === 'm1')!.area).toBeGreaterThan(0)
    expect(out.options.find((o) => o.inView)!.id).toBe(ctx.option)
  })

  it('getIssues and getKpis read the engine', () => {
    const d = derive(p, ctx.option)
    const issues = callTool(p, 'getIssues', {})
    expect(issues.ok && (issues.output as unknown[]).length).toBe(d.issues.length)
    // each says its step (Decision "Flow step"): what settles it, the masses or the roads
    const noGate = { ...p, site: { ...p.site, gates: [] } }
    const steps = callTool(noGate, 'getIssues', {})
    const out = (steps.ok ? steps.output : []) as { code: string; step: string }[]
    expect(out.find((i) => i.code === 'gate')?.step).toBe('flow')
    expect(out.find((i) => i.code === 'relation')?.step).toBe('massing')
    const kpis = callTool(p, 'getKpis', { ids: ['coverage'] })
    expect(kpis.ok && kpis.output).toEqual([expect.objectContaining({ id: 'coverage', unit: 'pct', help: expect.any(String) })])
  })

  it('an edit gives the project after it, the same verb’s result', () => {
    const r = callTool(p, 'moveMass', { mass: 'm1', dx: 5, dy: 0 })
    expect(r.ok && r.changed).toBe(true)
    expect(r.ok && r.project).toEqual(actions.moveMass(p, 'm1', { x: 5, y: 0 }))
  })

  it('takes a name where an id is asked (a model often says Warehouse 1)', () => {
    const r = callTool(p, 'moveMass', { mass: 'warehouse 1', dx: 5, dy: 0 })
    expect(r.ok && r.project).toEqual(actions.moveMass(p, 'm1', { x: 5, y: 0 }))
  })

  it('updateMass resizes a rectangle; a verb that makes something says its id', () => {
    const r = callTool(p, 'updateMass', { mass: 'm1', width: 100 })
    const m = r.ok ? r.project.masses.find((x) => x.id === 'm1')! : null
    expect(m?.footprint.kind === 'rect' && m.footprint.width).toBe(100)
    const added = callTool(p, 'addMass', { program: p.programs[0].id, x: 0, y: 0, width: 20, depth: 10 })
    expect(added.ok && added.output).toEqual({ done: true, id: expect.any(String) })
  })

  it('a wrong input, a missing id or an unknown tool comes back as its reason, the project unchanged', () => {
    const bad = callTool(p, 'moveMass', { mass: 'm1', dx: 'far' })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.error).toMatch(/^moveMass: .*dx/s)
    const missing = callTool(p, 'moveMass', { mass: 'nope', dx: 1, dy: 0 })
    expect(!missing.ok && missing.error).toMatch(/No mass "nope"\. There are: m1 \(Warehouse 1\)/)
    expect(callTool(p, 'flyAway', {})).toEqual({ ok: false, error: 'No tool "flyAway".' })
  })

  it('solve places what the brief asks and says what it did', () => {
    const r = callTool(p, 'solve', {})
    expect(r.ok && r.output).toMatchObject({ done: true, added: expect.any(Array), missing: expect.any(Number) })
  })
})

describe('point by point (H.0)', () => {
  const p = demoProject()
  const L = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 20 },
    { x: 20, y: 20 },
    { x: 20, y: 40 },
    { x: 0, y: 40 },
  ]
  const made = (r: ReturnType<typeof callTool>) => {
    if (!r.ok) throw new Error(r.error)
    const id = (r.output as { id: string }).id
    return { project: r.project, mass: r.project.masses.find((m) => m.id === id)! }
  }
  const outline = (q: typeof p, mass: string) => {
    const r = callTool(q, 'getMassOutline', { mass })
    if (!r.ok) throw new Error(r.error)
    return r.output as { kind: string; area: number; corners: { i: number; x: number; y: number; radius: number }[]; walls: { i: number; length: number }[] }
  }

  it('addMassFromPoints makes an L, and getMassOutline numbers its corners and walls', () => {
    const { project, mass } = made(callTool(p, 'addMassFromPoints', { program: p.programs[0].id, points: L }))
    expect(mass.footprint.kind).toBe('contour')
    const o = outline(project, mass.id)
    expect(o.area).toBe(1200)
    expect(o.corners).toHaveLength(6)
    expect(o.walls.map((w) => w.length).sort((a, b) => a - b)).toEqual([20, 20, 20, 20, 40, 40])
  })

  it('takes the points either way round, the first repeated or not; four on a square box are a rectangle', () => {
    const back = made(callTool(p, 'addMassFromPoints', { program: null, points: [...L].reverse() }))
    expect(outline(back.project, back.mass.id).area).toBe(1200)
    const closed = made(callTool(p, 'addMassFromPoints', { program: null, points: [...L, L[0]] }))
    expect(outline(closed.project, closed.mass.id).corners).toHaveLength(6)
    const box = made(callTool(p, 'addMassFromPoints', { program: null, points: [L[0], L[1], { x: 40, y: 40 }, L[5]] }))
    expect(box.mass.footprint).toMatchObject({ kind: 'rect', width: 40, depth: 40 })
  })

  it('a crossing or flat outline is refused with why', () => {
    const bow = callTool(p, 'addMassFromPoints', { program: null, points: [L[0], { x: 40, y: 40 }, L[1], { x: 0, y: 20 }] })
    expect(!bow.ok && bow.error).toMatch(/crosses itself/)
    const flat = callTool(p, 'addMassFromPoints', { program: null, points: [L[0], L[1], { x: 80, y: 0 }] })
    expect(!flat.ok && flat.error).toMatch(/encloses nothing/)
  })

  /** A plain mass of the L (the engine's own, as the tests' projects have them): its corner edits are the mass's; a block's are below (D.2). */
  const plainL = () => {
    const r = actions.addMass(p, { programId: null, footprint: { kind: 'contour', contour: contourFromPolygon(L) } })
    return { project: r.project, mass: r.project.masses.find((m) => m.id === r.id)! }
  }

  it('moves, adds, removes and rounds corners; setMassOutline redraws it', () => {
    const { project, mass } = plainL()
    const call = (q: typeof p, name: string, input: object) => {
      const r = callTool(q, name, { mass: mass.id, ...input })
      if (!r.ok) throw new Error(r.error)
      return r.project
    }
    const moved = call(project, 'moveVertex', { corner: 3, x: 25, y: 20 })
    expect(outline(moved, mass.id).area).toBe(1250)
    const added = call(project, 'insertVertex', { wall: 0, x: 10, y: -3 })
    expect(outline(added, mass.id).corners[1]).toMatchObject({ x: 10, y: 0 })
    expect(outline(call(added, 'moveVertex', { corner: 1, x: 10, y: -5 }), mass.id).area).toBe(1300)
    expect(outline(call(project, 'removeVertex', { corner: 3 }), mass.id).corners).toHaveLength(5)
    expect(outline(call(project, 'setCornerRadius', { corner: 0, radius: 5 }), mass.id).corners[0].radius).toBe(5)
    const square = call(project, 'setMassOutline', { points: [L[0], L[1], { x: 40, y: 40 }, L[5]] })
    expect(square.masses.find((m) => m.id === mass.id)).toMatchObject({ name: mass.name, footprint: { kind: 'rect' } })
  })

  it('getMassOutline shows a chamfer; setCornerRadius 0 leaves it, over 0 takes it away; no tool sets one', () => {
    const { project, mass } = plainL()
    const cut = actions.editShape(project, { kind: 'mass', id: mass.id }, { op: 'chamfer', vertex: 0, a: 4, b: 6 }).project
    expect(cut).not.toBe(project)
    const o = outline(cut, mass.id)
    expect(o.corners[0]).toMatchObject({ i: 0, radius: 0, chamfer: [4, 6] })
    expect('chamfer' in o.corners[1]).toBe(false)
    const same = callTool(cut, 'setCornerRadius', { mass: mass.id, corner: 0, radius: 0 })
    expect(same.ok && outline(same.project, mass.id).corners[0]).toMatchObject({ chamfer: [4, 6] })
    const round = callTool(cut, 'setCornerRadius', { mass: mass.id, corner: 0, radius: 2 })
    expect(round.ok && outline(round.project, mass.id).corners[0]).toMatchObject({ radius: 2 })
    expect(round.ok && 'chamfer' in outline(round.project, mass.id).corners[0]).toBe(false)
    const texts = toolSchemas().filter((t) => ['getMassOutline', 'setMassOutline', 'setCornerRadius'].includes(t.name))
    expect(texts.map((t) => /chamfer/i.test(t.description))).toEqual([true, true, true])
    expect(toolSchemas().some((t) => /chamfer/i.test(t.name))).toBe(false)
  })

  const placedBlock = () => {
    const base = demoProject()
    const added = actions.addWarehouseType(base)
    const placed = actions.placeWarehouse(added.project, added.id, { x: 300, y: 100 }, 0, base.options[0].id)!
    const levels = new Set(placed.project.buildings.find((b) => b.id === placed.id)!.levels.map((l) => l.id))
    const hall = placed.project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
    return { project: placed.project, hall, building: placed.id }
  }
  const ownOutline = (q: Project, building: string) => q.buildings.find((b) => b.id === building)!.warehouse!.overrides?.morphology?.outline

  it('the shape tools reach a block’s outline (D.2): a corner moved, one added, one rounded, a wall pushed by the metres asked; the copy a variant', () => {
    const { project, hall, building } = placedBlock()
    const v = outline(project, hall.id).corners[0]
    const moved = callTool(project, 'moveVertex', { mass: hall.id, corner: 0, x: v.x + 1.3, y: v.y + 0.7 })
    expect(moved.ok && moved.changed).toBe(true)
    expect(moved.ok && ownOutline(moved.project, building)).toHaveLength(4)
    const m0 = moved.ok ? outline(moved.project, hall.id).corners[0] : v
    expect(m0.x).toBeCloseTo(v.x + 1.3, 3)
    expect(m0.y).toBeCloseTo(v.y + 0.7, 3)
    const w = outline(project, hall.id).corners[1]
    const added = callTool(project, 'insertVertex', { mass: hall.id, wall: 0, x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 })
    expect(added.ok && ownOutline(added.project, building)).toHaveLength(5)
    const round = callTool(project, 'setCornerRadius', { mass: hall.id, corner: 0, radius: 2 })
    expect(round.ok && ownOutline(round.project, building)![0].r).toBeCloseTo(2, 6)
    // a wall by 0.2 m goes by 0.2 m, not by whole modules; a corner that is not there says so
    const pushed = callTool(project, 'moveWall', { mass: hall.id, wall: 0, d: 0.2 })
    expect(pushed.ok && pushed.changed).toBe(true)
    const none = callTool(project, 'moveVertex', { mass: hall.id, corner: 9, x: 0, y: 0 })
    expect(none.ok).toBe(false)
  })

  it('setMassOutline sets a block’s outline (a variant on the site); updateMass’s width and depth stretch its box; its name and its place stay free', () => {
    const { project, hall, building } = placedBlock()
    expect(hall.footprint.kind).toBe('rect')
    const f = hall.footprint as Extract<typeof hall.footprint, { kind: 'rect' }>
    const corners = outline(project, hall.id).corners
    // a trapezoid: its far corner pulled in 30 m
    const points = corners.map((c, i) => (i === 2 ? { x: c.x - 30, y: c.y } : { x: c.x, y: c.y }))
    const redraw = callTool(project, 'setMassOutline', { mass: hall.id, points })
    expect(redraw.ok).toBe(true)
    const after = redraw.ok ? redraw.project : project
    expect(ownOutline(after, building)).toHaveLength(4)
    const made = outline(after, hall.id).corners
    expect(made).toHaveLength(4)
    expect(made[2].x).toBeCloseTo(corners[2].x - 30, 2)
    expect(ProjectSchema.safeParse(after).success).toBe(true)
    // an outline that crosses itself is refused, with the reason
    const bow = callTool(project, 'setMassOutline', { mass: hall.id, points: [points[0], points[2], points[1], points[3]] })
    expect(bow.ok).toBe(false)
    const wider = callTool(project, 'updateMass', { mass: hall.id, width: f.width + 1.3 })
    expect(wider.ok).toBe(true)
    const grown = wider.ok ? (wider.project.masses.find((m) => m.id === hall.id)!.footprint as typeof f) : f
    expect(grown.width).toBeCloseTo(f.width + 1.3, 6)
    // what is not its shape goes: its name, its height, its place
    const named = callTool(project, 'updateMass', { mass: hall.id, name: 'Hall A', height: 9 })
    expect(named.ok).toBe(true)
    const moved = callTool(project, 'updateMass', { mass: hall.id, x: f.center.x + 5, y: f.center.y })
    expect(moved.ok).toBe(true)
    // the same size is not a change of shape
    const same = callTool(project, 'updateMass', { mass: hall.id, width: f.width, depth: f.depth })
    expect(same.ok).toBe(true)
  })

  it('a corner that is not there, or an edit the geometry rejects, says why and changes nothing', () => {
    const { project, mass } = made(callTool(p, 'addMassFromPoints', { program: null, points: L }))
    expect(callTool(project, 'moveVertex', { mass: mass.id, corner: 9, x: 0, y: 0 })).toEqual({ ok: false, error: `${mass.name} has 6 corners, 0 to 5: getMassOutline lists them.` })
    const crossing = callTool(project, 'moveVertex', { mass: mass.id, corner: 3, x: -10, y: 30 })
    expect(!crossing.ok && crossing.error).toMatch(/cross itself or flip/)
  })
})

describe('holes and corridors (H.5)', () => {
  const p = demoProject()
  const sq = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
  // the teammates' case: an irregular polygon with two holes, a corridor round each, in one call
  const ask = {
    program: 'warehouse',
    points: [{ x: 0, y: -200 }, { x: 80, y: -200 }, { x: 100, y: -170 }, { x: 80, y: -140 }, { x: 0, y: -140 }],
    holes: [
      { points: sq(10, -190, 30, -170), corridor: 2 },
      { points: sq(45, -190, 65, -170), corridor: 2 },
    ],
  }
  const run = (q: typeof p, name: string, input: object) => {
    const r = callTool(q, name, input)
    if (!r.ok) throw new Error(r.error)
    return r
  }

  it('addMassFromPoints takes the holes and their corridors; getMassOutline lists them', () => {
    const r = run(p, 'addMassFromPoints', ask)
    const id = (r.output as { id: string }).id
    const d = derive(r.project)
    const outline = 80 * 60 + (60 * 20) / 2
    expect(d.masses[id].area).toBeCloseTo(outline - 2 * 400, 6)
    expect(d.masses[id].corridors.map((c) => c.area)).toEqual([expect.closeTo(24 * 24 - 400, 6), expect.closeTo(24 * 24 - 400, 6)])
    const o = run(r.project, 'getMassOutline', { mass: id }).output as { holes: { k: number; corridor: number; corridorArea: number; corners: unknown[] }[] }
    expect(o.holes).toEqual([
      expect.objectContaining({ k: 0, corridor: 2, corridorArea: 176, corners: expect.any(Array) }),
      expect.objectContaining({ k: 1, corridor: 2, corridorArea: 176 }),
    ])
  })

  it('addHole, setHoleCorridor, moveHole, setHoleOutline, removeHole; one outside the mass is refused', () => {
    const added = run(p, 'addHole', { mass: 'm1', points: sq(100, 100, 120, 120), corridor: 3 })
    expect(added.output).toEqual({ done: true, k: 0 })
    let q = added.project
    expect(derive(q).masses.m1.corridors[0].area).toBeCloseTo(276, 6)
    q = run(q, 'setHoleCorridor', { mass: 'm1', hole: 0, width: 0 }).project
    expect(derive(q).masses.m1.corridors).toEqual([])
    q = run(q, 'moveHole', { mass: 'm1', hole: 0, dx: 10, dy: 0 }).project
    expect(q.masses[0].holes![0].vertices[0]).toMatchObject({ x: 110, y: 100 })
    q = run(q, 'setHoleOutline', { mass: 'm1', hole: 0, points: sq(60, 80, 70, 90) }).project
    expect(derive(q).masses.m1.area).toBeCloseTo(12800 - 100, 6)
    expect(run(q, 'removeHole', { mass: 'm1', hole: 0 }).project.masses[0]).not.toHaveProperty('holes')
    const outside = callTool(p, 'addHole', { mass: 'm1', points: sq(300, 200, 310, 210) })
    expect(outside).toEqual({ ok: false, error: 'The hole falls outside Warehouse 1: give corners inside its outline.' })
  })

  it('a hole’s corners and walls; what is not there, or cannot go, says why', () => {
    const q = run(p, 'addHole', { mass: 'm1', points: sq(100, 100, 120, 120) }).project
    expect(run(q, 'moveHoleVertex', { mass: 'm1', hole: 0, corner: 2, x: 125, y: 125 }).project.masses[0].holes![0].vertices[2]).toMatchObject({ x: 125, y: 125 })
    expect(run(q, 'insertHoleVertex', { mass: 'm1', hole: 0, wall: 0, x: 110, y: 99 }).project.masses[0].holes![0].vertices).toHaveLength(5)
    expect(derive(run(q, 'moveHoleWall', { mass: 'm1', hole: 0, wall: 0, d: 5 }).project).masses.m1.area).toBeCloseTo(12800 - 500, 6)
    const three = run(q, 'removeHoleVertex', { mass: 'm1', hole: 0, corner: 0 }).project
    expect(callTool(three, 'removeHoleVertex', { mass: 'm1', hole: 0, corner: 0 })).toEqual({ ok: false, error: 'That corner cannot go: the shape needs at least 3 corners.' })
    expect(callTool(p, 'moveHole', { mass: 'm1', hole: 0, dx: 1, dy: 0 })).toEqual({ ok: false, error: 'Warehouse 1 has no holes.' })
    expect(callTool(q, 'removeHole', { mass: 'm1', hole: 3 })).toEqual({ ok: false, error: 'Warehouse 1 has one hole, 0.' })
  })
})

/** The demo without its south street (an existing street since PE.2): the tests below add the first existing street of a site. */
const demoNoRoad = (opts: { streets?: boolean } = {}): Project => {
  const p = demoProject(opts)
  return { ...p, site: { ...p.site, existingRoads: undefined } }
}

describe('streets and roads (stress test: streets came out as masses)', () => {
  it('an existing street is a road of the context, with its name; getProject lists it; it moves and goes', () => {
    const p = demoNoRoad()
    const r = callTool(p, 'addExistingRoad', { points: [{ x: -50, y: -20 }, { x: 500, y: -20 }], width: 12, name: 'South street' })
    if (!r.ok) throw new Error(r.error)
    const id = (r.output as { id: string }).id
    expect(r.project.masses).toHaveLength(p.masses.length)
    expect(derive(r.project).circulation.roads.some((x) => x.kind === 'existing' && x.sourceId === id)).toBe(true)
    const listed = callTool(r.project, 'getProject', {})
    expect(listed.ok && (listed.output as { existingRoads: unknown[] }).existingRoads).toEqual([{ id, name: 'South street', width: 12, stretches: [{ left: 6, right: 6 }], points: expect.any(Array) }])
    const wider = callTool(r.project, 'updateExistingRoad', { road: id, left: 3, right: 9 })
    expect(wider.ok && wider.project.site.existingRoads![0].stretches).toEqual([{ left: 3, right: 9 }])
    const oneSide = callTool(r.project, 'updateExistingRoad', { road: id, right: 2 })
    expect(oneSide.ok && oneSide.project.site.existingRoads![0].stretches).toEqual([{ left: 6, right: 2 }])
    expect(callTool(r.project, 'updateExistingRoad', { road: id, left: 0, right: 0.1 })).toMatchObject({ ok: false, error: expect.stringMatching(/0\.5 m/) })
    const gone = callTool(r.project, 'removeExistingRoad', { road: id })
    expect(gone.ok && (gone.project.site.existingRoads ?? [])).toEqual([])
  })

  it('updateExistingRoad with points of another count keeps one pair of sides per stretch (PE.1 review)', () => {
    const p = demoNoRoad()
    const r = callTool(p, 'addExistingRoad', { points: [{ x: -50, y: -20 }, { x: 200, y: -20 }, { x: 500, y: 0 }], left: 2, right: 6 })
    if (!r.ok) throw new Error(r.error)
    const id = (r.output as { id: string }).id
    const longer = callTool(r.project, 'updateExistingRoad', { road: id, points: [{ x: -50, y: -20 }, { x: 100, y: -20 }, { x: 200, y: -20 }, { x: 350, y: -10 }, { x: 500, y: 0 }], right: 4 })
    if (!longer.ok) throw new Error(longer.error)
    expect(longer.project.site.existingRoads![0].stretches).toEqual([{ left: 2, right: 4 }, { left: 2, right: 4 }, { left: 2, right: 4 }, { left: 2, right: 4 }])
    expect(ProjectSchema.safeParse(longer.project).success).toBe(true)
    const shorter = callTool(r.project, 'updateExistingRoad', { road: id, points: [{ x: -50, y: -20 }, { x: 500, y: 0 }], left: 3 })
    if (!shorter.ok) throw new Error(shorter.error)
    expect(shorter.project.site.existingRoads![0].stretches).toEqual([{ left: 3, right: 6 }])
    expect(() => derive(shorter.project)).not.toThrow()
  })

  it('a width under 0.5 m is refused by the tools, and a verb called by hand clamps it (PE.1 review)', () => {
    const p = demoProject({ streets: false })
    const line = [{ x: 0, y: 0 }, { x: 60, y: 0 }]
    expect(callTool(p, 'addStreet', { points: line, width: 0.2 })).toMatchObject({ ok: false })
    expect(callTool(p, 'addExistingRoad', { points: line, width: 0.2 })).toMatchObject({ ok: false })
  })

  it('a street of the design goes to the option in view, of a type; it moves, changes type and goes (ST.3)', () => {
    const p = demoProject({ streets: false })
    const r = callTool(p, 'addStreet', { points: [{ x: 210, y: 20 }, { x: 210, y: 200 }], type: 'cars' })
    if (!r.ok) throw new Error(r.error)
    const id = (r.output as { id: string }).id
    expect(r.project.options[0].streets!.segments).toEqual([expect.objectContaining({ id, type: 'cars' })])
    const moved = callTool(r.project, 'moveStreet', { segments: [id], dx: 5, dy: 0 })
    expect(moved.ok && moved.project.options[0].streets!.nodes.map((n) => n.x)).toEqual([215, 215])
    const trucks = callTool(r.project, 'setStreetType', { segments: [id], type: 'trucks' })
    expect(trucks.ok && trucks.project.options[0].streets!.segments[0].type).toBe('trucks')
    const node = r.project.options[0].streets!.nodes[1].id
    const longer = callTool(r.project, 'moveStreetNode', { node, x: 210, y: 220 })
    expect(longer.ok && longer.project.options[0].streets!.nodes[1]).toMatchObject({ x: 210, y: 220 })
    const gone = callTool(r.project, 'removeStreet', { segments: [id] })
    expect(gone.ok && gone.project.options[0].streets).toBeUndefined()
    expect(callTool(r.project, 'removeStreet', { segments: ['nope'] })).toMatchObject({ ok: false, error: expect.stringMatching(/No street segment "nope"/) })
  })

  it('a street takes its sides: left and right, or a width and a side; both forms are refused (PE.1)', () => {
    const p = demoNoRoad({ streets: false })
    const line = [{ x: 210, y: 20 }, { x: 210, y: 200 }]
    const edges = (q: Project) => q.options[0].streets!.segments.map((g) => [g.left, g.right])
    const a = callTool(p, 'addStreet', { points: line, type: 'cars', side: 'left', width: 10 })
    expect(a.ok && edges(a.project)).toEqual([[0, 10]])
    const b = callTool(p, 'addStreet', { points: line, type: 'cars', left: 2, right: 6 })
    expect(b.ok && edges(b.project)).toEqual([[2, 6]])
    const c = callTool(p, 'addStreet', { points: line, type: 'cars', width: 10 })
    expect(c.ok && edges(c.project)).toEqual([[5, 5]])
    expect(callTool(p, 'addStreet', { points: line, left: 2, right: 6, width: 8 })).toMatchObject({ ok: false, error: expect.stringMatching(/either/) })
    expect(callTool(p, 'addStreet', { points: line, left: 2, right: 3, side: 'left' })).toMatchObject({ ok: false, error: expect.stringMatching(/either/) })
    expect(callTool(p, 'addStreet', { points: line, left: 0, right: 0.1 })).toMatchObject({ ok: false, error: expect.stringMatching(/0\.5 m/) })
    const e = callTool(p, 'addExistingRoad', { points: line, left: 1, right: 7 })
    expect(e.ok && e.project.site.existingRoads![0].stretches).toEqual([{ left: 1, right: 7 }])
    const f = callTool(p, 'addExistingRoad', { points: line, width: 8, side: 'right' })
    expect(f.ok && f.project.site.existingRoads![0].stretches).toEqual([{ left: 8, right: 0 }])
    expect(callTool(p, 'addExistingRoad', { points: line, left: 1, right: 7, width: 8 })).toMatchObject({ ok: false, error: expect.stringMatching(/either/) })
  })

  it('setStreetEdges sets the sides of segments, leaves a locked one out and says it (PE.1)', () => {
    const p = demoProject({ streets: false })
    const r = callTool(p, 'addStreet', { points: [{ x: 210, y: 20 }, { x: 210, y: 100 }, { x: 260, y: 100 }], type: 'cars' })
    if (!r.ok) throw new Error(r.error)
    const [s1, s2] = (r.output as { segments: string[] }).segments
    const both = callTool(r.project, 'setStreetEdges', { segments: [s1, s2], left: 0, right: 8 })
    expect(both.ok && both.project.options[0].streets!.segments.map((g) => [g.left, g.right])).toEqual([[0, 8], [0, 8]])
    const one = callTool(r.project, 'setStreetEdges', { segments: [s1], right: 3 })
    expect(one.ok && one.project.options[0].streets!.segments.map((g) => g.right)).toEqual([3, r.project.options[0].streets!.segments[1].right])
    const locked = (callTool(r.project, 'lockStreets', { segments: [s2], locked: true }) as { project: Project }).project
    const some = callTool(locked, 'setStreetEdges', { segments: [s1, s2], left: 1, right: 1 })
    if (!some.ok) throw new Error(some.error)
    expect(some.project.options[0].streets!.segments.map((g) => [g.left, g.right])[0]).toEqual([1, 1])
    expect(some.project.options[0].streets!.segments[1]).toEqual(locked.options[0].streets!.segments[1])
    expect(JSON.stringify(some.output)).toMatch(/locked/)
    expect(callTool(r.project, 'setStreetEdges', { segments: [s1] })).toMatchObject({ ok: false })
    expect(callTool(r.project, 'setStreetEdges', { segments: [s1], left: 0, right: 0.1 })).toMatchObject({ ok: false, error: expect.stringMatching(/0\.5 m/) })
  })

  it('getSite reports a street’s sides per run and its id (PE.1)', () => {
    const r = callTool(demoProject({ streets: false }), 'addStreet', { points: [{ x: 210, y: 20 }, { x: 210, y: 100 }, { x: 260, y: 100 }], type: 'cars' })
    if (!r.ok) throw new Error(r.error)
    const [s1] = (r.output as { segments: string[] }).segments
    const q = callTool(r.project, 'setStreetEdges', { segments: [s1], left: 0, right: 9 })
    if (!q.ok) throw new Error(q.error)
    const site = callTool(q.project, 'getSite', {})
    if (!site.ok) throw new Error(site.error)
    const st = (site.output as { streets: { street: string; segments: string[]; left: number; right: number; links: unknown[] }[] }).streets
    // the two stretches differ: two runs of one street, each with its own sides
    expect(st.map((x) => [x.left, x.right])).toEqual([[0, 9], [expect.any(Number), expect.any(Number)]])
    expect(new Set(st.map((x) => x.street)).size).toBe(1)
    expect(st[0].links).toEqual([])
  })

  it('Connect draws the ways the courts lack, once; again, nothing changed (ST.7)', () => {
    const r = callTool(demoProject({ streets: false }), 'connectStreets', {})
    if (!r.ok) throw new Error(r.error)
    expect(r.output).toMatchObject({ done: true, linked: 2, left: 0 })
    expect(derive(r.project, 'o1').circulation.reached.sort()).toEqual(['m1', 'm2'])
    const again = callTool(r.project, 'connectStreets', {})
    expect(again.ok && again.output).toBe('Nothing changed.')
  })

  it('a shaped wall’s own depth is refused with the reason (review S2)', () => {
    const { p, hall } = shapedSite()
    const t = hall.blockCourts!.find((c) => c.shape)!.t
    const poly = footprintPolygon(hall.footprint)
    const r = callTool(p, 'setCourtDepth', { mass: hall.id, wall: edgeAt(poly, t).i, depth: 40 })
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/own shape/) })
  })

  it('a docked wall’s court depth, by its index; getDocks says it and who shares it (ST.5, ST.9)', () => {
    const p = demoProject()
    const r = callTool(p, 'setCourtDepth', { mass: 'm1', wall: 0, depth: 32 })
    if (!r.ok) throw new Error(r.error)
    const docks = callTool(r.project, 'getDocks', { mass: 'm1' })
    const walls = ((docks.ok ? docks.output : null) as { masses: { walls: { wall: number; depth: number }[] }[] }).masses[0].walls
    expect(walls).toEqual([expect.objectContaining({ wall: 0, depth: 32 })])
    const back = callTool(r.project, 'setCourtDepth', { mass: 'm1', wall: 0, depth: null })
    expect(back.ok && back.project.masses[0].courts).toBeUndefined()
    expect(callTool(p, 'setCourtDepth', { mass: 'm3', wall: 9, depth: 30 })).toMatchObject({ ok: false, error: expect.stringMatching(/no wall 9/) })
  })

  it('a block’s court: its depth and range; getProject lists the blocks with theirs; a range that misses the depth refused', () => {
    const t = actions.addWarehouseType(demoProject())
    const r = callTool(t.project, 'setBlockCourt', { type: t.id, court: { depth: 35, from: 30, to: 40 } })
    if (!r.ok) throw new Error(r.error)
    const info = callTool(r.project, 'getProject', {})
    expect((info.ok ? info.output : null) as { warehouseTypes: unknown[] }).toMatchObject({ warehouseTypes: [{ id: t.id, court: { depth: 35, range: [30, 40] } }] })
    expect(callTool(r.project, 'setBlockCourt', { type: t.id, court: { depth: 50, from: 30, to: 40 } })).toMatchObject({ ok: false, error: expect.stringMatching(/within its range/) })
    const none = callTool(r.project, 'setBlockCourt', { type: t.id, court: null })
    expect(none.ok && none.project.warehouseTypes![0].court).toBeUndefined()
  })
})

// ---- Lanes, gates on streets, existing streets moved (Phase PE.2, task 13) ----

describe('lanes, gates on streets and existing streets moved (Phase PE.2)', () => {
  const seg = (q: Project, id: string) => q.options[0].streets!.segments.find((g) => g.id === id)!
  /** An option street of two stretches (10.5 m of paving, the first 80 m long, a bend, the second 50 m) and its segment ids. */
  function twoStretches() {
    const r = callTool(demoNoRoad({ streets: false }), 'addStreet', { points: [{ x: 210, y: 20 }, { x: 210, y: 100 }, { x: 260, y: 100 }], type: 'cars', width: 10.5 })
    if (!r.ok) throw new Error(r.error)
    const [s1, s2] = (r.output as { segments: string[] }).segments
    return { p: r.project, s1, s2 }
  }
  /** An existing street 7 m wide along y = -20, its id. */
  function oneRoad(extra: Record<string, unknown> = {}) {
    const r = callTool(demoNoRoad({ streets: false }), 'addExistingRoad', { points: [{ x: 0, y: -20 }, { x: 100, y: -20 }], width: 7, ...extra })
    if (!r.ok) throw new Error(r.error)
    return { p: r.project, id: (r.output as { id: string }).id }
  }

  it('setStreetLanes: a count makes equal lanes, widths set them; one of each is asked', () => {
    const { p, s1, s2 } = twoStretches()
    const three = callTool(p, 'setStreetLanes', { street: s1, count: 3 })
    if (!three.ok) throw new Error(three.error)
    expect(seg(three.project, s1).lanes).toEqual([3.5, 3.5, 3.5])
    expect(seg(three.project, s2).lanes).toEqual([3.5, 3.5, 3.5])
    expect(ProjectSchema.safeParse(three.project).success).toBe(true)
    const two = callTool(p, 'setStreetLanes', { street: `street:${s1}`, widths: [3, 7.5] })
    expect(two.ok && seg(two.project, s2).lanes).toEqual([3, 7.5])
    expect(callTool(p, 'setStreetLanes', { street: s1, widths: [3, 3] })).toMatchObject({ ok: false, error: expect.stringMatching(/add up to the street/) })
    expect(callTool(p, 'setStreetLanes', { street: s1, count: 6 })).toMatchObject({ ok: false, error: expect.stringMatching(/2 m wide at least/) })
    expect(callTool(p, 'setStreetLanes', { street: s1, count: 2, widths: [5, 5.5] })).toMatchObject({ ok: false, error: expect.stringMatching(/either/) })
    expect(callTool(p, 'setStreetLanes', { street: s1 })).toMatchObject({ ok: false, error: expect.stringMatching(/count or widths/) })
    expect(callTool(p, 'setStreetLanes', { count: 2 })).toMatchObject({ ok: false, error: expect.stringMatching(/street or road/) })
    expect(callTool(p, 'setStreetLanes', { street: s1, road: 'e1', count: 2 })).toMatchObject({ ok: false, error: expect.stringMatching(/street or road/) })
    expect(callTool(p, 'setStreetLanes', { street: 'nope', count: 2 })).toMatchObject({ ok: false })
  })

  it('setStreetLanes leaves a locked segment out and says it', () => {
    const { p, s1, s2 } = twoStretches()
    const locked = (callTool(p, 'lockStreets', { segments: [s2], locked: true }) as { project: Project }).project
    const r = callTool(locked, 'setStreetLanes', { street: s1, count: 3 })
    if (!r.ok) throw new Error(r.error)
    expect(seg(r.project, s1).lanes).toEqual([3.5, 3.5, 3.5])
    expect(seg(r.project, s2)).toEqual(seg(locked, s2))
    expect(JSON.stringify(r.output)).toContain(s2)
    expect(JSON.stringify(r.output)).toMatch(/locked/)
    const all = (callTool(locked, 'lockStreets', { segments: [s1], locked: true }) as { project: Project }).project
    expect(callTool(all, 'setStreetLanes', { street: s1, count: 3 })).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) })
  })

  it('setStreetLanes on an existing street; getSite reports the lanes of a run (equal stretches are one run) and of a road, its padlock and group', () => {
    const { p, id } = oneRoad()
    const r = callTool(p, 'setStreetLanes', { road: id, widths: [2.5, 4.5] })
    if (!r.ok) throw new Error(r.error)
    expect(r.project.site.existingRoads![0].stretches).toEqual([{ left: 3.5, right: 3.5, lanes: [2.5, 4.5] }])
    const lockedRoad = callTool(r.project, 'updateExistingRoad', { road: id, locked: true })
    if (!lockedRoad.ok) throw new Error(lockedRoad.error)
    expect(callTool(lockedRoad.project, 'setStreetLanes', { road: id, count: 3 })).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) })
    const site = callTool({ ...lockedRoad.project, site: { ...lockedRoad.project.site, existingRoads: lockedRoad.project.site.existingRoads!.map((x) => ({ ...x, group: 'g1' })) } }, 'getSite', {})
    if (!site.ok) throw new Error(site.error)
    expect((site.output as { existingRoads: unknown[] }).existingRoads).toEqual([expect.objectContaining({ id, locked: true, group: 'g1', stretches: [{ left: 3.5, right: 3.5, lanes: [2.5, 4.5] }] })])
    // lanes it shows when none are stored: the standard's width
    const plain = callTool(p, 'getSite', {})
    expect(plain.ok && (plain.output as { existingRoads: { stretches: unknown[] }[] }).existingRoads[0].stretches).toEqual([{ left: 3.5, right: 3.5, lanes: [3.5, 3.5] }])
    const { p: q, s1 } = twoStretches()
    const withLanes = callTool(q, 'setStreetLanes', { street: s1, count: 3 })
    if (!withLanes.ok) throw new Error(withLanes.error)
    const runs = callTool(withLanes.project, 'getSite', {})
    expect(runs.ok && (runs.output as { streets: { lanes: number[] }[] }).streets.map((x) => x.lanes)).toEqual([[3.5, 3.5, 3.5]])
  })

  it('updateExistingRoad keeps the lanes: a side pulled takes its edge lane, and a longer line carries them on (task 2 hand-over)', () => {
    const { p, id } = oneRoad({ width: 10.5 })
    const lanes = callTool(p, 'setStreetLanes', { road: id, count: 3 })
    if (!lanes.ok) throw new Error(lanes.error)
    const out = callTool(lanes.project, 'updateExistingRoad', { road: id, right: 7.25 })
    expect(out.ok && out.project.site.existingRoads![0].stretches).toEqual([{ left: 5.25, right: 7.25, lanes: [3.5, 3.5, 5.5] }])
    const inward = callTool(lanes.project, 'updateExistingRoad', { road: id, left: 3.25 })
    if (!inward.ok) throw new Error(inward.error)
    const st = inward.project.site.existingRoads![0].stretches[0]
    expect(st.left).toBe(3.25)
    expect(st.lanes!.reduce((a, b) => a + b, 0)).toBeCloseTo(8.5, 6)
    expect(ProjectSchema.safeParse(inward.project).success).toBe(true)
    const longer = callTool(lanes.project, 'updateExistingRoad', { road: id, points: [{ x: 0, y: -20 }, { x: 50, y: -20 }, { x: 100, y: -20 }] })
    expect(longer.ok && longer.project.site.existingRoads![0].stretches).toEqual([{ left: 5.25, right: 5.25, lanes: [3.5, 3.5, 3.5] }, { left: 5.25, right: 5.25, lanes: [3.5, 3.5, 3.5] }])
    const both = callTool(lanes.project, 'updateExistingRoad', { road: id, points: [{ x: 0, y: -20 }, { x: 50, y: -20 }, { x: 100, y: -20 }], right: 7.25 })
    expect(both.ok && both.project.site.existingRoads![0].stretches.map((s) => s.lanes)).toEqual([[3.5, 3.5, 5.5], [3.5, 3.5, 5.5]])
  })

  it('updateExistingRoad takes locked; a locked street refuses the other changes and a delete, in the padlock’s words', () => {
    const { p, id } = oneRoad()
    const on = callTool(p, 'updateExistingRoad', { road: id, locked: true })
    expect(on.ok && on.project.site.existingRoads![0].locked).toBe(true)
    if (!on.ok) throw new Error(on.error)
    expect(callTool(on.project, 'updateExistingRoad', { road: id, name: 'Main' })).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) })
    expect(callTool(on.project, 'removeExistingRoad', { road: id })).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) })
    expect(callTool(on.project, 'moveExistingRoad', { road: id, dx: 5, dy: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) })
    expect(callTool(on.project, 'rotateExistingRoad', { road: id, degrees: 90 })).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) })
    const off = callTool(on.project, 'updateExistingRoad', { road: id, locked: false })
    expect(off.ok && off.project.site.existingRoads![0].locked).toBeUndefined()
  })

  it('moveExistingRoad moves a street and the street end linked to it', () => {
    const { p: base, id } = oneRoad()
    const r = callTool(base, 'addStreet', { points: [{ x: 50, y: 20 }, { x: 50, y: -20 }], type: 'cars' })
    if (!r.ok) throw new Error(r.error)
    const linked = r.project.options[0].streets!.nodes.find((n) => n.road === id)
    expect(linked).toBeDefined()
    const moved = callTool(r.project, 'moveExistingRoad', { road: id, dx: 10, dy: 5 })
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.project.site.existingRoads![0].points).toEqual([{ x: 10, y: -15 }, { x: 110, y: -15 }])
    const end = moved.project.options[0].streets!.nodes.find((n) => n.id === linked!.id)!
    expect(end.x).toBeCloseTo(60, 6)
    expect(end.y).toBeCloseTo(-15, 6)
    expect(callTool(r.project, 'moveExistingRoad', { road: 'nope', dx: 1, dy: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/No existing road/) })
    expect(callTool(r.project, 'moveExistingRoad', { road: id, dx: 0, dy: 0 })).toMatchObject({ ok: true, changed: false })
  })

  it('rotateExistingRoad turns it about a pivot, the middle of its points by default', () => {
    const { p, id } = oneRoad()
    const mid = callTool(p, 'rotateExistingRoad', { road: id, degrees: 90 })
    if (!mid.ok) throw new Error(mid.error)
    const [a, b] = mid.project.site.existingRoads![0].points
    expect([a.x, a.y, b.x, b.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([50, -70, 50, 30])
    const about = callTool(p, 'rotateExistingRoad', { road: id, degrees: 90, x: 0, y: -20 })
    if (!about.ok) throw new Error(about.error)
    const [c, d] = about.project.site.existingRoads![0].points
    expect([c.x, c.y, d.x, d.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, -20, 0, 80])
    expect(callTool(p, 'rotateExistingRoad', { road: id, degrees: 90, x: 5 })).toMatchObject({ ok: false, error: expect.stringMatching(/x and y/) })
  })

  it('addGate and updateGate take a place on a street’s side or an existing street’s, in place of t', () => {
    const { p, s1 } = twoStretches()
    const r = callTool(p, 'addGate', { on: { street: s1, side: 'right', at: 30 }, width: 9 })
    if (!r.ok) throw new Error(r.error)
    const id = (r.output as { id: string }).id
    const own = r.project.options[0].gates!.find((g) => g.id === id)!
    expect(own).toMatchObject({ on: { kind: 'street', id: s1, side: 'right', at: 30 }, width: 9 })
    expect(own.t).toBeUndefined()
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    const site = callTool(r.project, 'getSite', {})
    expect(site.ok && (site.output as { gates: { id: string; on?: unknown; edge?: number }[] }).gates.find((g) => g.id === id)).toMatchObject({ on: { kind: 'street', id: s1, side: 'right' } })
    const listed = callTool(r.project, 'getProject', {})
    expect(listed.ok && (listed.output as { gates: { id: string; on?: unknown }[] }).gates.find((g) => g.id === id)).toMatchObject({ on: { kind: 'street', id: s1, side: 'right', at: 30 } })
    // slid along, then to the other side, then back to the boundary
    const slid = callTool(r.project, 'updateGate', { gate: id, on: { street: s1, side: 'left', at: 12 } })
    expect(slid.ok && slid.project.options[0].gates!.find((g) => g.id === id)).toMatchObject({ on: { kind: 'street', id: s1, side: 'left', at: 12 } })
    const home = callTool(r.project, 'updateGate', { gate: id, t: 0.25 })
    if (!home.ok) throw new Error(home.error)
    const back = home.project.options[0].gates!.find((g) => g.id === id)!
    expect(back.t).toBe(0.25)
    expect(back.on).toBeUndefined()
    expect(ProjectSchema.safeParse(home.project).success).toBe(true)
    // both, neither, a host that is not there
    expect(callTool(p, 'addGate', { t: 0.5, on: { street: s1, side: 'right', at: 3 } })).toMatchObject({ ok: false, error: expect.stringMatching(/either t or on/) })
    expect(callTool(p, 'addGate', {})).toMatchObject({ ok: false, error: expect.stringMatching(/either t or on/) })
    expect(callTool(p, 'addGate', { on: { street: 'nope', side: 'left', at: 3 } })).toMatchObject({ ok: false, error: expect.stringMatching(/No street segment "nope"/) })
    expect(callTool(p, 'addGate', { on: { side: 'left', at: 3 } })).toMatchObject({ ok: false, error: expect.stringMatching(/street or road/) })
    expect(callTool(p, 'updateGate', { gate: id, t: 0.2, on: { street: s1, side: 'left', at: 3 } })).toMatchObject({ ok: false })
  })

  it('a gate on an existing street goes into the gates the option uses, and follows the street when it moves', () => {
    const { p, id } = oneRoad()
    const g = callTool(p, 'addGate', { on: { road: id, side: 'left', at: 40 } })
    if (!g.ok) throw new Error(g.error)
    const gid = (g.output as { id: string }).id
    expect(g.project.site.gates!.find((x) => x.id === gid)).toMatchObject({ on: { kind: 'existing-road', id, side: 'left', at: 40 } })
    expect(callTool(p, 'addGate', { on: { road: 'nope', side: 'left', at: 40 } })).toMatchObject({ ok: false, error: expect.stringMatching(/No existing road "nope"/) })
    const moved = callTool(g.project, 'moveExistingRoad', { road: id, dx: 0, dy: 30 })
    if (!moved.ok) throw new Error(moved.error)
    const at = derive(moved.project, 'o1').circulation.gates.find((x) => x.id === gid)!.at
    expect(at.x).toBeCloseTo(40, 6)
    expect(at.y).toBeGreaterThan(5)
  })
})

describe('through the host (the agent in the app)', () => {
  beforeEach(() => {
    const p = demoProject()
    useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null })
  })

  it('an edit is one undo step, logged as the agent’s with its verb; a reading changes nothing', async () => {
    await act(() => hostCall('moveMass', { mass: 'm1', dx: 5, dy: 0 }))
    expect(useApp.getState().history.past).toHaveLength(1)
    expect(useApp.getState().project.log!.at(-1)).toMatchObject({ by: 'agent', verb: 'moveMass', what: 'Move mass: Warehouse 1' })
    const read = await hostCall('getIssues', {})
    expect(read.ok).toBe(true)
    expect(useApp.getState().history.past).toHaveLength(1)
    const wrong = await hostCall('moveMass', { mass: 'nope', dx: 1, dy: 0 })
    expect(wrong.ok).toBe(false)
    expect(useApp.getState().history.past).toHaveLength(1)
  })
})
