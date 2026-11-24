// Actions: pure functions Project → Project. They are the "verbs" of the app (add, move, rotate, delete).
// - Pure, like the engine: the store calls them today; an MCP tool or an optimizer can call them tomorrow.
// - Never mutate: always return a new project (that is what makes undo/redo work).
// - If nothing changes, return the SAME project object, so the store knows not to record a history step.
// - A locked mass (its own flag, or its building's) is not changed (Phase AS.3: the padlock is CAD's). state/settle.ts holds every field of it but `locked`
//   and refuses the whole edit; updateMass and updateMasses also skip its name and its program here, so a lock among several
//   masses leaves the others to change.
import type { Building, Contour, Footprint, Grid, Id, Mass, Point, Project } from '../../model/schema.ts'
import { contourFromPolygon, contourToPolygon } from '../../engine/geom/contour.ts'
import { polygonFootprint } from '../../engine/geom/draw.ts'
import { footprintPolygon, rotate } from '../../engine/geom/footprint.ts'
import { holesIn, translateHoles, turnHoles } from '../../engine/geom/holes.ts'
import { mergeShapes } from '../../engine/geom/merge.ts'
import { edgeAt, nearestT, pointAt } from '../../engine/geom/perimeter.ts'
import { bounds, centroid, distancePointSegment } from '../../engine/geom/polygon.ts'
import { reflectFootprint, reflectHoles, reflectPoint } from '../../engine/geom/reflect.ts'
import { firstLongWall } from '../../modules/docks/engine/docks.ts'
import { mergeBlocks } from '../../modules/warehouse/actions.ts'
import { axesOf, moduleOf } from '../../engine/grid/index.ts'
import { withFollowers } from '../../engine/graph/links.ts'
import { groupIdsIn } from '../../engine/groups.ts'
import { levelOrGround } from '../../engine/levels.ts'
import { allLevels, buildingOfLevel } from '../../engine/buildings.ts'
import { buildingColor } from '../../model/buildingColors.ts'
import { massIsLocked } from '../../model/locks.ts'

/** The first free id with that prefix: m1, m2… Short and readable for people and for MCP clients. */
export function newId(prefix: string, taken: Iterable<Id>): Id {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** "<name> copy", or "<name> copy <n>" with the first n not taken: what a copied building or program is called. */
export function copyName(taken: Iterable<string>, name: string): string {
  const used = new Set(taken)
  if (!used.has(`${name} copy`)) return `${name} copy`
  let n = 2
  while (used.has(`${name} copy ${n}`)) n++
  return `${name} copy ${n}`
}

export interface NewMass {
  programId: Id | null
  footprint: Footprint
  /** Absent: its level's height, which it then follows. */
  height?: number
  name?: string
  /** Absent, or a level that does not exist: the ground floor. */
  levelId?: Id
}

/** Adds a mass and returns its id (the UI selects it right away). Default name: "<Program> <n>", the first free n. */
export function addMass(p: Project, init: NewMass): { project: Project; id: Id } {
  // never into a warehouse copy: it is its type's (Decision "A copy without its hall"), the mass gets a building of its own
  const own = ownBuilding(p, levelOrGround(p, init.levelId))
  if (own) return addMass(own.project, { ...init, levelId: own.levelId })
  const id = newId('m', p.masses.map((m) => m.id))
  const program = p.programs.find((x) => x.id === init.programId)
  // the first free number: two masses never share a name, even after a program change or a delete
  const base = program?.name ?? 'Mass'
  const taken = new Set(p.masses.map((m) => m.name))
  let n = 1
  while (taken.has(`${base} ${n}`)) n++
  const levelId = levelOrGround(p, init.levelId)
  const mass: Mass = {
    id,
    name: init.name ?? `${base} ${n}`,
    levelId,
    programId: init.programId,
    footprint: init.footprint,
    ...(init.height !== undefined ? { height: init.height } : {}),
  }
  return { project: { ...p, masses: [...p.masses, mass] }, id }
}

/**
 * A level of a warehouse copy takes no mass of its own (a copy's masses are its type's): a new building, in the options
 * that show the copy, its ground level for it. Null for any other level.
 */
function ownBuilding(p: Project, levelId: Id): { project: Project; levelId: Id } | null {
  const copy = buildingOfLevel(p, levelId)
  if (!copy?.warehouse) return null
  const id = newId('b', p.buildings.map((b) => b.id))
  const level = newId('l', allLevels(p).map((l) => l.id))
  const names = new Set(p.buildings.map((b) => b.name))
  let n = 1
  while (names.has(`Building ${n}`)) n++
  const building: Building = {
    id,
    name: `Building ${n}`,
    color: buildingColor(p.buildings.length),
    levelHeight: copy.levelHeight,
    levels: [{ id: level, name: 'L1', elevation: 0, height: copy.levelHeight, repeat: 1 }],
  }
  const options = p.options.map((o) => (o.buildingIds.includes(copy.id) ? { ...o, buildingIds: [...o.buildingIds, id] } : o))
  return { project: { ...p, buildings: [...p.buildings, building], options }, levelId: level }
}

/**
 * What a locked mass keeps whoever asks (the padlock is CAD's: a locked mass is not changed): its name and its program.
 * Every field of it, and its being there, is `settle.ts`'s, which refuses the whole edit; these two the verbs skip as well,
 * so a lock among several masses leaves the others to change.
 */
const FROZEN = ['name', 'programId'] as const

/** The patch a mass takes: all of it, or, locked, without what it keeps. */
function takenBy(p: Project, m: Mass, patch: Partial<Omit<Mass, 'id'>>): Partial<Omit<Mass, 'id'>> {
  if (!massIsLocked(p, m)) return patch
  const rest = { ...patch }
  for (const k of FROZEN) delete rest[k]
  return rest
}

/** Changes some fields of a mass; a locked one keeps its name and its program. */
export function updateMass(p: Project, id: Id, patch: Partial<Omit<Mass, 'id'>>): Project {
  const m = p.masses.find((x) => x.id === id)
  if (!m) return p
  const own = takenBy(p, m, patch)
  if (Object.keys(own).length === 0) return p
  return { ...p, masses: p.masses.map((x) => (x.id === id ? { ...x, ...own } : x)) }
}

/** Locks or unlocks a mass: locked, nothing of it changes (shape, place, name, program, docks, courts, doors…) and it cannot be deleted (settle.ts). */
export function toggleMassLock(p: Project, id: Id): Project {
  const m = p.masses.find((x) => x.id === id)
  if (!m) return p
  if (!m.locked) return updateMass(p, id, { locked: true })
  const { locked: _, ...free } = m
  return { ...p, masses: p.masses.map((x) => (x.id === id ? free : x)) }
}

export function removeMass(p: Project, id: Id): Project {
  return removeMasses(p, [id])
}

/**
 * A warehouse copy whose hall is gone is a copy no more (Decision "A copy without its hall"): its building lets its type
 * go and the masses it has left are its own (no part), so nothing made from the type comes back beside them.
 */
function withoutHalllessCopies(p: Project): Project {
  const broken = p.buildings.filter((b) => {
    if (!b.warehouse) return false
    const levels = new Set(b.levels.map((l) => l.id))
    return !p.masses.some((m) => levels.has(m.levelId) && m.part === 'hall')
  })
  if (broken.length === 0) return p
  const ids = new Set(broken.map((b) => b.id))
  const levels = new Set(broken.flatMap((b) => b.levels.map((l) => l.id)))
  return {
    ...p,
    buildings: p.buildings.map((b) => {
      if (!ids.has(b.id)) return b
      const { warehouse: _, ...free } = b
      return free
    }),
    masses: p.masses.map((m) => {
      if (!levels.has(m.levelId) || m.part === undefined) return m
      const { part: _, ...free } = m
      return free
    }),
  }
}

/** A group left with one mass is none (Decision "Groups"): that mass leaves it. */
function withoutLoneGroups(masses: Mass[]): Mass[] {
  const count = new Map<Id, number>()
  for (const m of masses) if (m.group !== undefined) count.set(m.group, (count.get(m.group) ?? 0) + 1)
  if (![...count.values()].some((n) => n < 2)) return masses
  return masses.map((m) => {
    if (m.group === undefined || count.get(m.group)! > 1) return m
    const { group: _, ...free } = m
    return free
  })
}

/** The same footprint moved by d. A rect moves its centre; a contour moves every vertex. */
export function translateFootprint(f: Footprint, d: Point): Footprint {
  if (f.kind === 'rect') return { ...f, center: { x: f.center.x + d.x, y: f.center.y + d.y } }
  return { ...f, contour: { ...f.contour, vertices: f.contour.vertices.map((v) => ({ ...v, x: v.x + d.x, y: v.y + d.y })) } }
}

/** Moves a mass by d; the masses that move with it follow (Decision "Rules"). */
export function moveMass(p: Project, id: Id, d: Point): Project {
  if (!p.masses.some((x) => x.id === id)) return p
  return moveMasses(p, [id], d)
}

/**
 * A copy of `source` (a mass of this project or one copied earlier) moved by d: same footprint, height, program (none
 * if the program is not in this project), dock walls and door pattern, a new id and the next name of its program; never locked, in
 * no group. Copy / paste / duplicate. It goes on `levelId`; absent, on the source's level (the ground floor if this
 * project has no such level).
 */
export function copyMass(p: Project, source: Mass, d: Point, levelId: Id = source.levelId): { project: Project; id: Id } {
  const programId = source.programId && p.programs.some((g) => g.id === source.programId) ? source.programId : null
  const r = addMass(p, { programId, footprint: translateFootprint(source.footprint, d), height: source.height, levelId })
  const own = {
    ...(source.docks !== undefined && { docks: source.docks }),
    ...(source.holes && { holes: translateHoles(source.holes, d) }),
    // its doors on the grid (Phase G.3): its own pattern and exceptions
    ...(source.doorPattern && { doorPattern: source.doorPattern }),
    ...(source.doorFlips && { doorFlips: source.doorFlips }),
  }
  return Object.keys(own).length === 0 ? r : { project: updateMass(r.project, r.id, own), id: r.id }
}

/**
 * Copies of several masses moved by the same d (copy, paste, duplicate, Alt+drag: Decision "Alt+drag copies"), each as
 * copyMass makes it; the copies of a group's masses are a group of their own (Decision "Groups"). `levelId`: where
 * they all go (absent: each on its source's level). Returns the copies' ids, in the sources' order.
 */
export function copyMasses(p: Project, sources: Mass[], d: Point, levelId?: Id): { project: Project; ids: Id[] } {
  const ids: Id[] = []
  const groups = new Map<Id, Id>() // a source's group → its copies' group
  const taken = groupIdsIn(p) // the first free among every kind's: a lot or a note may hold a group's id
  let q = p
  for (const source of sources) {
    const r = copyMass(q, source, d, levelId ?? source.levelId)
    ids.push(r.id)
    q = r.project
    // a group needs two copies at least (copyMasses of one member of a group copies it alone)
    if (source.group === undefined || sources.filter((x) => x.group === source.group).length < 2) continue
    if (!groups.has(source.group)) groups.set(source.group, newId('g', [...taken, ...groups.values()]))
    q = updateMass(q, r.id, { group: groups.get(source.group)! })
  }
  return { project: q, ids }
}

// Several masses at once (Decision "Multi-selection"): one verb, so a group edit is one undo step and one MCP call.

/** Changes the same fields of several masses; a locked one keeps its name and its program, the others change. */
export function updateMasses(p: Project, ids: Id[], patch: Partial<Omit<Mass, 'id'>>): Project {
  const set = new Set(ids)
  const going = p.masses.filter((m) => set.has(m.id) && Object.keys(takenBy(p, m, patch)).length > 0)
  if (going.length === 0) return p
  return { ...p, masses: p.masses.map((m) => (set.has(m.id) ? { ...m, ...takenBy(p, m, patch) } : m)) }
}

/** Locks (or unlocks) several masses; the ones already so stay as they are. */
export function lockMasses(p: Project, ids: Id[], locked: boolean): Project {
  return ids.reduce((q, id) => (q.masses.find((m) => m.id === id)?.locked === true) === locked ? q : toggleMassLock(q, id), p)
}

export function removeMasses(p: Project, ids: Id[]): Project {
  const set = new Set(ids)
  if (!p.masses.some((m) => set.has(m.id))) return p
  return withoutHalllessCopies({ ...p, masses: withoutLoneGroups(p.masses.filter((m) => !set.has(m.id))) })
}

/**
 * Merges masses into the first (Phase H.2, Decision "Holes and free geometry"): its outline becomes the union of
 * theirs, a court they close all round a hole of it; it keeps its name, program, height and group, and its dock walls
 * go back to its program's (its walls changed); the others go. Null when they are fewer than two, on more than one
 * level, or do not all touch. Curved walls come out as their chords. Blocks (a copy's masses) join as the warehouse's Union does
 * (`mergeBlocks`: blocks of one type, into the first's own outline); null for those it refuses, its `reason` is `mergeBlocks`'s.
 */
export function mergeMasses(p: Project, ids: Id[]): { project: Project; id: Id } | null {
  const blocks = mergeBlocks(p, ids)
  if (blocks) return 'reason' in blocks ? null : blocks
  const picked = [...new Set(ids)].flatMap((id) => p.masses.filter((m) => m.id === id))
  if (picked.length < 2 || picked.some((m) => m.levelId !== picked[0].levelId)) return null
  const merged = mergeShapes(
    picked.map((m) => {
      const outline = footprintPolygon(m.footprint)
      return [outline, ...holesIn(m.holes, outline).holes]
    }),
  )
  const footprint = merged && polygonFootprint(merged.outline)
  if (!merged || !footprint || footprint === 'crossing') return null
  const [first, ...rest] = picked
  const { docks: _docks, holes: _holes, ...kept } = first
  const mass: Mass = { ...kept, footprint, ...(merged.holes.length > 0 && { holes: merged.holes.map(contourFromPolygon) }) }
  const gone = new Set(rest.map((m) => m.id))
  const masses = p.masses.filter((m) => !gone.has(m.id)).map((m) => (m.id === first.id ? mass : m))
  return { project: withoutHalllessCopies({ ...p, masses: withoutLoneGroups(masses) }), id: first.id }
}

/**
 * Moves several masses by the same d, each once, with the masses that move with them (Decision "Rules"); `followers` false: these
 * alone (the caller moves what follows, by what it knows, as Align does).
 */
export function moveMasses(p: Project, ids: Id[], d: Point, followers = true): Project {
  if (d.x === 0 && d.y === 0) return p
  const all = new Set(followers ? withFollowers(p, ids) : ids)
  if (!p.masses.some((m) => all.has(m.id))) return p
  return { ...p, masses: p.masses.map((m) => (all.has(m.id) ? { ...m, footprint: translateFootprint(m.footprint, d), ...(m.holes && { holes: translateHoles(m.holes, d) }) } : m)) }
}

/** A footprint turned by `degrees` around `pivot`: a rect's centre goes round and its rotation adds up; arcs keep their bulge. */
function turnAround(f: Footprint, pivot: Point, degrees: number): Footprint {
  if (f.kind === 'rect') {
    const rotation = (((f.rotation + degrees) % 360) + 360) % 360
    return { ...f, center: rotate(f.center, pivot, degrees), rotation }
  }
  return { kind: 'contour', contour: { ...f.contour, vertices: f.contour.vertices.map((v) => ({ ...v, ...rotate(v, pivot, degrees) })) } }
}

/**
 * A mass made from a warehouse type (a block's: its type's copy, `part` set on a level of a copy whose type is in the project): it has
 * a place and an angle and no hand, so Mirror leaves it (Decision "Mirror, Array, Align"). The same test `copyWithBlocks` makes.
 */
export function isBlockMass(p: Project, m: Mass): boolean {
  if (m.part === undefined) return false
  const copy = buildingOfLevel(p, m.levelId)?.warehouse
  return copy !== undefined && !!p.warehouseTypes?.some((t) => t.id === copy.type)
}

/** m: a door counted from the end of a wall it no longer reaches is dropped (a `doorsAt` past its wall's length is inert). */
const WALL_SLACK = 1e-6

/**
 * The edge of a contour that is to be the first of its reflection: the edge the first long wall (the docks engine's: `firstLongWall`)
 * lies on when `byProgram` (the mass's docks come from its program), else the first edge, 0. The wall is found on the outline as the
 * docks engine reads it (arcs and rounded corners as chords): the contour's edge nearest to its middle.
 */
function edgeToStart(c: Contour, byProgram: boolean): number {
  if (!byProgram) return 0
  const wall = firstLongWall(contourToPolygon(c))
  if (!wall) return 0
  const at = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const n = c.vertices.length
  let best = 0
  let near = Infinity
  for (let i = 0; i < n; i++) {
    const e = distancePointSegment(at, c.vertices[i], c.vertices[(i + 1) % n])
    if (e < near - 1e-9) {
      near = e
      best = i
    }
  }
  return best
}

/**
 * A mass seen in the mirror about the line through a and b, with what it keeps by its place along its perimeter put on the same
 * walls (Decision "Mirror, Array, Align"). Its footprint and holes are reflected; each `t` (the fraction of the perimeter, from
 * vertex 0, of a wall's middle: `docks`, `doorsAt`, `courts`, `blockCourts`, `doorFlips`) goes to the t of the reflection of the point
 * it names, found on the new outline, so it names the mirror image of the wall it named. A reflection reverses a wall's direction
 * (the outline is counter-clockwise again after), so what counts from its start counts from the other end: `doorsAt[].at`, a
 * door's middle in m, becomes the wall's length − at (its doors in ascending order; one past the wall's length is inert and goes);
 * `doorFlips[].module` becomes n − 1 − module, n the wall's modules on the grid (its length over the module of the grid axis the
 * wall runs nearer; without a grid, or a module past the wall's count, the flip is inert: kept as it is, or dropped).
 *   kept as they are  id, name, levelId, programId, height, locked, group, part, zones (areas: no hand) and `doorPattern`, a rule
 *                     counted module by module from each wall's start: one that is the same from both ends (a door every
 *                     module, the end bays skipped) is mirrored by keeping it; one with an `every` over 1, an `offset` or a `mask`
 *                     starts from the other end of each wall, and is not mapped (its count of modules depends on the wall)
 * A contour's outline is reversed by a reflection, so its first edge would change; it is started again (`reflectContour`'s `first`) so
 * that the walls come in the mirror of their old order from the edge that mattered: `first`, the old outline's first long wall when the
 * docks come from the mass's program (that wall's side is the front, so the docks stand on the mirror image of their wall), else the first
 * edge (what an anchored lot's frame reads).
 */
function mirrored(m: Mass, a: Point, b: Point, grid: Grid | null, programDocks: boolean): Mass {
  const footprint = reflectFootprint(m.footprint, a, b, m.footprint.kind === 'contour' ? edgeToStart(m.footprint.contour, programDocks && m.docks === undefined) : undefined)
  const was = footprintPolygon(m.footprint)
  const now = footprintPolygon(footprint)
  const t = (t0: number) => nearestT(now, reflectPoint(pointAt(was, t0), a, b))
  /** The wall a t falls on: its length and its direction. */
  const wall = (t0: number) => {
    const { i } = edgeAt(was, t0)
    const p = was[i]
    const q = was[(i + 1) % was.length]
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    return { length, u: { x: (q.x - p.x) / length, y: (q.y - p.y) / length } }
  }
  /** The modules a wall holds: its length over the module of the grid axis it runs nearer. */
  const modules = (t0: number): number | null => {
    if (!grid) return null
    const { length, u } = wall(t0)
    const axes = axesOf(grid)
    const axis = Math.abs(u.x * axes.u.x + u.y * axes.u.y) >= Math.abs(u.x * axes.v.x + u.y * axes.v.y) ? 'x' : 'y'
    return Math.max(1, Math.round(length / moduleOf(grid)[axis]))
  }
  const out: Mass = { ...m, footprint }
  if (m.holes) out.holes = reflectHoles(m.holes, a, b)
  if (m.docks) out.docks = m.docks.map(t)
  if (m.courts) out.courts = m.courts.map((c) => ({ ...c, t: t(c.t) }))
  if (m.blockCourts) out.blockCourts = m.blockCourts.map((c) => ({ ...c, t: t(c.t) }))
  if (m.doorsAt) {
    out.doorsAt = m.doorsAt.map((e) => {
      const { length } = wall(e.t)
      return { ...e, t: t(e.t), at: e.at.filter((s) => s <= length + WALL_SLACK).map((s) => Math.max(0, length - s)).reverse() }
    })
  }
  if (m.doorFlips) {
    out.doorFlips = m.doorFlips.flatMap((f) => {
      const n = modules(f.t)
      if (n === null) return [{ ...f, t: t(f.t) }]
      return f.module < n ? [{ t: t(f.t), module: n - 1 - f.module }] : []
    })
  }
  return out
}

/**
 * Masses reflected about the line through a and b, each once (`followers`: with the masses that move with them, as a turn does;
 * a block's mass is never reflected, and is left out of them too). `grid`: the option's, for the modules of a flipped door.
 * Nothing to reflect, or no line: the same project.
 */
export function mirrorMasses(p: Project, ids: Id[], a: Point, b: Point, grid: Grid | null, followers = true): Project {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || (a.x === b.x && a.y === b.y)) return p
  const all = new Set(followers ? withFollowers(p, ids) : ids)
  const going = new Set(p.masses.filter((m) => all.has(m.id) && !isBlockMass(p, m)).map((m) => m.id))
  if (going.size === 0) return p
  const programDocks = new Set(p.programs.filter((g) => g.docks).map((g) => g.id))
  return { ...p, masses: p.masses.map((m) => (going.has(m.id) ? mirrored(m, a, b, grid, m.programId !== null && programDocks.has(m.programId)) : m)) }
}

/** Where a mass turns alone: a rect around its centre, a free contour around its centroid. */
function ownPivot(f: Footprint): Point {
  return f.kind === 'rect' ? f.center : centroid(contourToPolygon(f.contour))
}

/**
 * Rotates several masses by `degrees` around the centre of their bounds, as one piece; one mass turns in place. The
 * masses that move with them turn with them, around the same point (Decision "Rules").
 */
export function rotateMasses(p: Project, ids: Id[], degrees: number): Project {
  const group = p.masses.filter((m) => ids.includes(m.id))
  if (group.length === 0 || degrees === 0) return p
  let pivot: Point
  if (group.length === 1) pivot = ownPivot(group[0].footprint)
  else {
    const b = bounds(group.flatMap((m) => footprintPolygon(m.footprint)))
    pivot = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  }
  const all = new Set(withFollowers(p, group.map((m) => m.id)))
  return { ...p, masses: p.masses.map((m) => (all.has(m.id) ? { ...m, footprint: turnAround(m.footprint, pivot, degrees), ...(m.holes && { holes: turnHoles(m.holes, pivot, degrees) }) } : m)) }
}

/**
 * Turns several masses by `degrees` around `pivot`, each once, with the masses that move with them (Decision "General
 * tools": Rotate about a picked point). A rect's centre goes round and its rotation adds up; a contour's corners go round.
 */
export function turnMassesAbout(p: Project, ids: Id[], pivot: Point, degrees: number): Project {
  if (degrees === 0 || !Number.isFinite(degrees) || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) return p
  const all = new Set(withFollowers(p, ids))
  if (!p.masses.some((m) => all.has(m.id))) return p
  return { ...p, masses: p.masses.map((m) => (all.has(m.id) ? { ...m, footprint: turnAround(m.footprint, pivot, degrees), ...(m.holes && { holes: turnHoles(m.holes, pivot, degrees) }) } : m)) }
}

/** Rotates a mass by `degrees`: a rect around its centre, a free contour around its centroid; its followers too. */
export function rotateMass(p: Project, id: Id, degrees: number): Project {
  return rotateMasses(p, [id], degrees)
}
