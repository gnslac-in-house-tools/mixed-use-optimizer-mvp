// The sample project (Decision "Sample project"): what Home offers first and where the tour runs. An industrial park of
// about 15 ha on ground that falls some 25 m with a ridge and a hollow (its contours every metre), two smart blocks (a
// cross-dock and a rear-load warehouse, Decision "Smart blocks") and three options that place them differently, each
// with its streets drawn by Connect. Built in code, so it is always the same and needs no file; `demo.ts` stays as it is
// (the tests' project).
import type { ContourLine, HallElement, HallZone, Id, Point, Project, WarehouseType } from '../model/schema.ts'
import { contourFromPolygon, contourToPolygon } from '../engine/geom/contour.ts'
import { perimeter, perimeterPath } from '../engine/geom/perimeter.ts'
import { refitGrids } from '../engine/grid/index.ts'
import { WAREHOUSE_STEPS } from '../model/schema.ts'
import { nearestModule } from '../modules/warehouse/engine/bays.ts'
import { generate } from '../modules/warehouse/engine/generate.ts'
import { edgeBays, type ShapeEdit } from '../modules/warehouse/engine/shape.ts'
import { newProject } from '../typologies/index.ts'
import { actions } from './actions/index.ts'
import { linkStreetEnds } from './actions/streets.ts'

/** Its id: one sample in a browser, kept as any project once changed (Home's card resets it). */
export const SAMPLE_ID = 'sample'
export const SAMPLE_NAME = 'Sample · Industrial park'

/** The site: five sides, about 15 ha, its south side on a street. */
const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 520, y: 0 },
  { x: 540, y: 300 },
  { x: 280, y: 330 },
  { x: 10, y: 300 },
]

/** The ground (m): rising 25 m to the north, a ridge in the north-west, a hollow in the south-east. */
export function sampleGround(x: number, y: number): number {
  const bump = (cx: number, cy: number, r: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r))
  return 100 + 25 * (y / 330) + 6 * bump(140, 240, 80) - 5 * bump(400, 70, 60)
}

/** Where the ground is drawn: past the site by 60 m (the surface is only where it has contours). */
const GROUND = { x0: -60, x1: 600, y0: -60, y1: 390, cell: 5 }
/** How far a contour may stray when its points are thinned (m): a survey's drawing, light for the surface. */
const THIN = 0.25

/** A line's points thinned (Douglas–Peucker): those within `tol` of the line through their neighbours go. */
function thinned(pts: Point[], tol: number): Point[] {
  if (pts.length < 3) return pts
  const keep = pts.map((_, i) => i === 0 || i === pts.length - 1)
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    const [a, b] = [pts[i], pts[j]]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-12
    let far = -1
    let most = tol
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((b.y - a.y) * (pts[k].x - a.x) - (b.x - a.x) * (pts[k].y - a.y)) / len
      if (d > most) [far, most] = [k, d]
    }
    if (far >= 0) {
      keep[far] = true
      stack.push([i, far], [far, j])
    }
  }
  return pts.filter((_, i) => keep[i])
}

let made: ContourLine[] | null = null

/**
 * The ground as a survey gives it: a contour every metre (marching squares over `sampleGround` on a 5 m grid, each
 * contour's pieces joined through the cell edges they share). Points every 20 m drew as a dotted background on the
 * plan (the user: "the dotted background… I don't like it"). Thinned to `THIN`; made once (the sample is built
 * again on Reset), and never changed in place: a project's data is replaced, not edited.
 */
export function groundContours(): ContourLine[] {
  if (made) return made
  const { x0, x1, y0, y1, cell } = GROUND
  const nx = Math.round((x1 - x0) / cell)
  const ny = Math.round((y1 - y0) / cell)
  const zs: number[][] = Array.from({ length: nx + 1 }, (_, i) => Array.from({ length: ny + 1 }, (_, j) => sampleGround(x0 + i * cell, y0 + j * cell)))
  const flat = zs.flat()
  const r = (v: number) => Math.round(v * 100) / 100
  const out: ContourLine[] = []
  for (let z = Math.ceil(Math.min(...flat)); z <= Math.floor(Math.max(...flat)); z++) {
    // a cell edge by its key: h i,j from (i, j) to (i+1, j); v i,j from (i, j) to (i, j+1)
    const at = (key: string): Point => {
      const [kind, ij] = [key[0], key.slice(1).split(',').map(Number)]
      const [i, j] = ij
      const [i2, j2] = kind === 'h' ? [i + 1, j] : [i, j + 1]
      const t = (z - zs[i][j]) / (zs[i2][j2] - zs[i][j])
      return { x: r(x0 + (i + t * (i2 - i)) * cell), y: r(y0 + (j + t * (j2 - j)) * cell) }
    }
    const segments: [string, string][] = []
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const [a, b, c, d] = [zs[i][j], zs[i + 1][j], zs[i + 1][j + 1], zs[i][j + 1]]
        const k = (a >= z ? 1 : 0) | (b >= z ? 2 : 0) | (c >= z ? 4 : 0) | (d >= z ? 8 : 0)
        // most cells are all above or all below
        if (k === 0 || k === 15) continue
        const [B, R, T, L] = [`h${i},${j}`, `v${i + 1},${j}`, `h${i},${j + 1}`, `v${i},${j}`]
        const centre = (a + b + c + d) / 4 >= z
        if (k === 5) segments.push(...((centre ? [[B, R], [T, L]] : [[L, B], [R, T]]) as [string, string][]))
        else if (k === 10) segments.push(...((centre ? [[L, B], [R, T]] : [[B, R], [T, L]]) as [string, string][]))
        else segments.push(k === 1 || k === 14 ? [L, B] : k === 2 || k === 13 ? [B, R] : k === 3 || k === 12 ? [L, R] : k === 4 || k === 11 ? [R, T] : k === 6 || k === 9 ? [B, T] : [T, L])
      }
    // the pieces joined end to end: open runs from an edge of the drawing first, then the loops
    const by = new Map<string, number[]>()
    segments.forEach(([p, q], n) => {
      for (const e of [p, q]) {
        const ns = by.get(e)
        if (ns) ns.push(n)
        else by.set(e, [n])
      }
    })
    const used = new Set<number>()
    const walk = (start: string, closed: boolean) => {
      const keys = [start]
      for (let e = start; ; ) {
        const n = by.get(e)!.find((m) => !used.has(m))
        if (n === undefined) break
        used.add(n)
        e = segments[n][0] === e ? segments[n][1] : segments[n][0]
        keys.push(e)
      }
      const all = keys.map(at)
      const points = closed ? thinned(all, THIN).slice(0, -1) : thinned(all, THIN)
      if (points.length >= 2) out.push({ points, z, ...(closed ? { closed: true } : {}) })
    }
    for (const [e, ns] of by) if (ns.length === 1 && !used.has(ns[0])) walk(e, false)
    segments.forEach((s, n) => !used.has(n) && walk(s[0], true))
  }
  made = out
  return out
}

const rect = (cx: number, cy: number, width: number, depth: number, rotation = 0) =>
  ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation }) as const

/** A type made as a designer makes one, step by step: its box, its shape (bays pulled out, Decision "Block shape"), its
 *  docks on the edges named (`middleDocks`); every step locked. */
function makeType(p: Project, init: { name: string; program?: Id }, steps: { hall: { length: number; width: number }; shape: ShapeEdit[]; zones?: HallZone[]; docks: string[] }): { project: Project; id: Id } {
  const made = actions.addWarehouseType(p, init)
  let q = made.project
  for (const step of WAREHOUSE_STEPS) {
    if (step === 'hall') q = actions.updateWarehouseStep(q, made.id, 'hall', steps.hall)
    if (step === 'morphology') {
      for (const edit of steps.shape) q = actions.shapeWarehouse(q, made.id, edit).project
      if (steps.zones) q = actions.updateWarehouseStep(q, made.id, 'morphology', { zones: steps.zones })
    }
    if (step === 'elements') q = actions.updateWarehouseStep(q, made.id, 'elements', middleDocks(q.warehouseTypes!.find((t) => t.id === made.id)!, steps.docks))
    q = actions.lockWarehouseStep(q, made.id, step)
  }
  return { project: q, id: made.id }
}

/**
 * Two docks in the middle of each interior bay along each edge named, one on each of the bay's two middle modules
 * (Decision "Elements by module"), 3 m wide.
 */
function middleDocks(t: WarehouseType, edges: string[]): HallElement[] {
  const g = generate(t)
  const out: HallElement[] = []
  for (const id of edges) {
    const e = g.edges.find((x) => x.id === id)
    if (!e) continue
    const run = e.horizontal ? g.runs.x : g.runs.y
    for (const b of edgeBays(g.runs, e)) {
      if (b.end) continue
      const c = (b.lo + b.hi) / 2
      const half = (b.hi - b.lo) / b.modules / 2
      for (const s of [c - half, c + half]) out.push({ id: `e${out.length + 1}`, kind: 'dock', edge: id, module: nearestModule(run, s), width: 3 })
    }
  }
  return out
}

/**
 * A copy's bump on its back slid `k` modules towards line A: its two inner walls moved (Decision "Block shape"), the
 * left one first out, the right one in.
 */
function slideBump(p: Project, buildingId: Id, typeId: Id, k: number): Project {
  const t = p.warehouseTypes!.find((x) => x.id === typeId)!
  const sides = generate(t).edges.filter((e) => !e.outer && !e.horizontal)
  const left = sides.find((e) => e.side === 'left')
  const right = sides.find((e) => e.side === 'right')
  if (!left || !right) return p
  const q = actions.moveBlockEdge(p, buildingId, left.id, k).project
  return actions.moveBlockEdge(q, buildingId, right.id, -k).project
}

const place = (p: Project, type: Id, x: number, y: number, angle: number, option: Id) => {
  const r = actions.placeWarehouse(p, type, { x, y }, angle, option)
  if (!r) throw new Error('sample: a block did not place')
  return r
}

/**
 * A building of its own in `option` with one block of `program` (Phase D.2: every building is a block): the stroke is its outer face, of
 * the program's type; the first one of a program makes its type, its steps confirmed as the smart blocks' are.
 */
function addLoose(p: Project, option: Id, name: string, programId: Id, footprint: ReturnType<typeof rect>, height?: number): Project {
  const r = actions.drawBlock(p, { programId, footprint, optionId: option, name, ...(height ? { height } : {}) })
  if (!r) throw new Error('sample: a block did not draw')
  return r.fresh ? WAREHOUSE_STEPS.reduce((q, step) => actions.lockWarehouseStep(q, r.type, step), r.project) : r.project
}

export function sampleProject(): Project {
  let p: Project = { ...newProject('industrial', SAMPLE_NAME), id: SAMPLE_ID }
  // stalls along both sides of its car streets, as it had: a new project has none (Decision "Street parking by side")
  p.standards = { ...p.standards, parking: 'double' }
  p.site.boundary = contourFromPolygon(BOUNDARY)
  p = actions.setTerrain(p, { contours: groundContours(), points: [], smoothing: 'surface' })

  // what the client asks: 75,000 m² of warehouse in two programs (the options answer it differently), offices, a guard
  // house, yard storage
  p = actions.setProgramTarget(p, 'warehouse', { area: 45000, count: null })
  p = actions.setProgramTarget(p, 'office', { area: 3000, count: null })
  p = actions.setProgramTarget(p, 'guardhouse', { area: 24, count: 1 })
  p = actions.setProgramTarget(p, 'outdoor-storage', { area: 2400, count: 1 })

  // two smart blocks (Decision "Block shape": one mass each, its bumps part of it): a cross-dock (docks on both long
  // walls, a bump at each end, an office and a service bay) and a rear-load (docks on its front, a bump on its back)
  const cross = makeType(p, { name: 'Cross-dock', program: 'warehouse' }, {
    hall: { length: 216, width: 120 },
    shape: [
      // the left wall's modules 12 to 28 pulled 4 modules out (12 m), the right wall's 4 to 12, 3 (9 m)
      { kind: 'pull', edge: 'e4', from: 12, to: 28, by: 4 },
      { kind: 'pull', edge: 'e2', from: 4, to: 12, by: 3 },
    ],
    // its left end (the bump, 4 modules) an office zone inside the one mass
    zones: [
      { id: 'z1', name: 'Office', x: [0, 4], y: [0, 40], program: 'office' },
      { id: 'z2', x: [4, 79], y: [0, 40] },
    ],
    docks: ['e1', 'e3'],
  })
  p = cross.project
  const rear = makeType(p, { name: 'Rear-load' }, {
    hall: { length: 144, width: 84 },
    // the back wall's modules 4 to 16 pulled 3 modules out (9 m)
    shape: [{ kind: 'pull', edge: 'e3', from: 4, to: 16, by: 3 }],
    docks: ['e1'],
  })
  p = rear.project
  const rearProgram = p.warehouseTypes!.find((t) => t.id === rear.id)!.program!
  p = actions.setProgramTarget(p, rearProgram, { area: 30000, count: null })

  // its access: the south side on a 20 m existing street, outside the boundary, two gates
  const outline = contourToPolygon(p.site.boundary!)
  const along = (x: number) => x / perimeter(outline)
  const street = actions.addExistingRoad(p, perimeterPath(outline, along(20), along(500)), 20, 'left')!
  p = actions.updateExistingRoad(street.project, street.id, { name: 'South street' })
  p = actions.addGate(p, 'o1', along(140)).project
  p = actions.addGate(p, 'o1', along(400)).project

  // A · two cross-docks: the second a variant, its hall two bays shorter by hand
  p = actions.renameOption(p, 'o1', 'A · Two cross-docks')
  const a1 = place(p, cross.id, 135, 165, 90, 'o1')
  p = a1.project
  const a2 = place(p, cross.id, 395, 165, 90, 'o1')
  p = actions.stretchWarehouseHall(a2.project, a2.id, { axis: 'length', end: 1 }, -24).project
  p = addLoose(p, 'o1', 'Guard house', 'guardhouse', rect(140, 22, 6, 4))

  // B · three rear-loads: one's bump slid to its corner, its inner walls moved (a variant)
  const b = actions.addOption(p, { name: 'B · Three rear-loads' })
  p = b.project
  p = place(p, rear.id, 100, 120, 90, b.id).project
  const b2 = place(p, rear.id, 270, 120, 90, b.id)
  p = slideBump(b2.project, b2.id, rear.id, 4)
  p = place(p, rear.id, 430, 130, 90, b.id).project
  p = addLoose(p, b.id, 'Guard house', 'guardhouse', rect(400, 22, 6, 4))

  // C · mixed: one of each, the office, the guard house and the yard
  const c = actions.addOption(p, { name: 'C · Mixed' })
  p = c.project
  p = place(p, cross.id, 160, 170, 90, c.id).project
  p = place(p, rear.id, 420, 165, 90, c.id).project
  p = addLoose(p, c.id, 'Guard house', 'guardhouse', rect(270, 25, 6, 4))
  p = addLoose(p, c.id, 'Yard', 'outdoor-storage', rect(280, 200, 30, 80))

  // the new project's empty Building 1 goes (a file drops it too: Decision "No empty buildings")
  p = { ...p, buildings: p.buildings.filter((x) => x.id !== 'b1'), options: p.options.map((o) => ({ ...o, buildingIds: o.buildingIds.filter((x) => x !== 'b1') })) }
  // the structural grid, fitted to the site along its street
  p = refitGrids(p)
  // its streets (Decision "Streets", ST.9): the buildings first, then Connect on each option, as a designer would start
  // them (the ways from the gates to every court; where two platforms' levels are too far apart for the way between
  // them, the grading's warning says so)
  // and the ends that met its south street are linked to it (Decision "Street links"), as an edit would, so moving it carries them
  return linkStreetEnds(p.options.reduce((q, o) => actions.connectStreets(q, o.id).project, p))
}
