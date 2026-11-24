// A saved project's free masses become blocks (Phase D.2 task 8; Decision "Free masses migrate"): the second half of the step from
// version 16 to 17, pure (model/migrate.ts calls it; the first half, `blocksToMetres` in migrate.ts, has already read the blocks
// into metres). Each free mass (one with no `part`) becomes one block of its program's type, with its own outline:
//   - its footprint is the block's outer face (`blocks.ts`, the same reading `drawBlock` makes), its id the hall's, so a dimension
//     anchored to its corners, a group and a selection hold; its group, lock, name and program are kept;
//   - the first mass of a program that had no type makes the type; the others are variants of it (no program: the shared *Block*);
//   - a block is one building: the first free mass of a building takes it over, each other gets a building of its own in the same
//     options, on a copy of its level, its platform joined to the first's, its dimensions and platform steps moved with it;
//   - its docks and doors are frozen as the option showed them (`deriveMassing`): each dock door is one dock element on the module
//     whose centre is nearest, only on a wall along the grid; a wall with no door but a court is a court by edge; what stood on an
//     angled wall is left out and counted; a court depth by wall `t` stays on the hall, on the same wall;
//   - a mass that does not make a block (its outline crosses itself, under 1 m², its walls do not fit) stays as it is, named in the report.
// What it says goes into `notes`, sentence by sentence (the toast when the file opens, `io/gft.ts`).
import {
  PROJECT_VERSION,
  ProjectSchema,
  WarehouseTypeSchema,
  type Building,
  type CourtByEdge,
  type Dimension,
  type HallElement,
  type Id,
  type Mass,
  type Point,
  type Polygon,
  type Program,
  type Project,
  type WarehouseCopy,
  type WarehouseOverrides,
  type WarehouseType,
} from '../../../model/schema.ts'
import { deriveMassing } from '../../../engine/derive.ts'
import type { DerivedDock } from '../../../engine/types.ts'
import { footprintContour, footprintPolygon } from '../../../engine/geom/footprint.ts'
import { edgeAt } from '../../../engine/geom/perimeter.ts'
import { area, distancePointSegment, isSimple } from '../../../engine/geom/polygon.ts'
import { dockableWalls } from '../../docks/engine/docks.ts'
import { nearestModule } from './bays.ts'
import { blockFrame, outlineFromFace } from './blocks.ts'
import { copyParts, fromPlace, type Place } from './copies.ts'
import { newWarehouseType } from './defaults.ts'
import { ELEMENT_WIDTH, freeElementId } from './elements.ts'
import { generate, typeWith } from './generate.ts'
import { edgeModules, elementKey } from './shape.ts'

type Json = Record<string, unknown>

/** m: two points this close are one (a wall the block squared up stands this far from where the stroke's did). */
const ON = 0.025

/** The first id "<prefix>1", "<prefix>2"… not taken. */
function newId(prefix: string, taken: Iterable<Id>): Id {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** `name` if it is free, else "name 2", "name 3"…. */
function freeName(taken: Iterable<string>, name: string): string {
  const used = new Set(taken)
  if (!used.has(name)) return name
  let n = 2
  while (used.has(`${name} ${n}`)) n++
  return `${name} ${n}`
}

/** A new block type for a program (none: the shared *Block*): the project's grid or the program's, its range, no elements (the stroke is its own). */
function typeFor(types: WarehouseType[], programs: Program[], program: Program | undefined, grid: Project['grid'], height: number): { type: WarehouseType; programs: Program[] } {
  const id = newId('wt', types.map((t) => t.id))
  const name = freeName(types.map((t) => t.name), program ? program.name : 'Block')
  const own = program?.grid ?? (grid ? { x: grid.x, y: grid.y, modules: grid.modules } : undefined)
  const type = { ...newWarehouseType(id, name, { grid: own, program: program?.id ?? null, height }), elements: [] as HallElement[] }
  const r = program?.range
  if (r?.width || r?.depth) type.hall = { ...type.hall, range: { ...(r.width && { length: r.width }), ...(r.depth && { width: r.depth }) } }
  // the program's grid and range are now the type's: the program keeps neither (one place for each)
  if (!program) return { type, programs }
  const { grid: _g, range: _r, ...rest } = program
  return { type, programs: programs.map((g) => (g.id === program.id ? rest : g)) }
}

/**
 * What stood on a block's walls: the docks as the option showed them (`docks`, on the plan) as the block's elements and courts. A door goes
 * to the module of its wall whose centre is nearest (kept inside the wall's whole modules); a wall with a court and no door to a court by edge.
 * What stands on an angled, curved or too short a wall is left out (`left`: how many docks).
 */
function standing(made: WarehouseType, place: Place, docks: readonly DerivedDock[]): { elements: HallElement[]; courts: CourtByEdge[]; left: number } {
  const g = generate(made)
  const walls = g.walls.filter((w) => w.edge !== undefined && !w.corner && !w.hole)
  const edgeAtPoint = (q: Point) => {
    const w = walls.find((x) => distancePointSegment(q, x.a, x.b) < ON)
    return w ? g.edges.find((e) => e.id === w.edge) : undefined
  }
  const elements: HallElement[] = []
  const courts: CourtByEdge[] = []
  const seen = new Set<string>()
  let left = 0
  for (const d of docks) {
    if (d.doors.length === 0) {
      const mid = fromPlace(place, { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 })
      const e = edgeAtPoint(mid)
      if (!e || e.axis === null || e.bulge) left++
      else if (!courts.some((c) => c.edge === e.id)) courts.push({ edge: e.id })
      continue
    }
    for (const door of d.doors) {
      const q = fromPlace(place, door)
      const e = edgeAtPoint(q)
      const span = e && e.axis !== null && !e.bulge ? edgeModules(e) : null
      if (!e || !span || span.hi - span.lo < 1) {
        left++
        continue
      }
      const run = e.horizontal ? g.runs.x : g.runs.y
      const module = Math.min(span.hi - 1, Math.max(span.lo, nearestModule(run, e.horizontal ? q.x : q.y)))
      const key = elementKey({ kind: 'dock', edge: e.id, module })
      if (seen.has(key)) continue
      seen.add(key)
      elements.push({ id: freeElementId(elements), kind: 'dock', edge: e.id, module, width: ELEMENT_WIDTH.dock })
    }
  }
  return { elements, courts, left }
}

/**
 * Things kept by the `t` of a wall's middle on an outline (a court's depth, a door exception), moved onto the same walls of the block's
 * outline: the wall is found by its middle, so it holds whichever corner the outline starts at. `turned`: a wall that now runs the other
 * way takes no item that counts from its start (a door exception's module).
 */
function onSameWalls<T extends { t: number }>(items: readonly T[] | undefined, was: Polygon, now: Polygon, turned = true): T[] | undefined {
  if (!items?.length) return undefined
  const walls = dockableWalls(now)
  const out = items.flatMap((c) => {
    const i = edgeAt(was, c.t).i
    const a = was[i]
    const b = was[(i + 1) % was.length]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const w = walls.find((x) => distancePointSegment(mid, x.a, x.b) < ON)
    if (!w || (!turned && (w.b.x - w.a.x) * (b.x - a.x) + (w.b.y - w.a.y) * (b.y - a.y) < 0)) return []
    return [{ ...c, t: w.t }]
  })
  return out.length ? out : undefined
}

/** m: how far the block's corner may stand from the mass's and still be that corner (a wall squared up moves its ends a little). */
const CORNER = 0.03

/**
 * A dimension's anchor on a converted mass: the corner of the block's footprint where the mass's corner was (the block reads its corners
 * from its own low corner, counter-clockwise, curves faceted, so the index is not the same); none there: no anchor, the dimension keeps its points.
 */
function reanchor(k: Dimension['anchorA'], corners: ReadonlyMap<Id, { was: Point[]; now: Point[] }>): Dimension['anchorA'] {
  const c = k && corners.get(k.massId)
  if (!k || !c) return k
  const at = c.was[k.vertex]
  if (!at) return undefined
  let best = -1
  let far = CORNER
  c.now.forEach((v, j) => {
    const d = Math.hypot(v.x - at.x, v.y - at.y)
    if (d <= far) {
      far = d
      best = j
    }
  })
  return best < 0 ? undefined : { massId: k.massId, vertex: best }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * A project of version 16 (its blocks read into metres) with its free masses as blocks; `notes` gets the report's sentences. A project with
 * no free mass, or that the schema does not read, is returned as it is.
 */
export function massesToBlocks(p: Json, notes: string[]): Json {
  if (!Array.isArray(p.masses) || !p.masses.some((m) => m && typeof m === 'object' && (m as Json).part === undefined)) return p
  const read = ProjectSchema.safeParse({ ...p, version: PROJECT_VERSION })
  if (!read.success) return p
  const q: Project = read.data
  const free = q.masses.filter((m) => m.part === undefined)
  if (!free.length) return p

  // the docks as the first option that shows each mass has them (before anything changes)
  const docksOf = new Map<Id, DerivedDock[]>()
  try {
    const derived = deriveMassing(q)
    for (const m of free) {
      const building = q.buildings.find((b) => b.levels.some((l) => l.id === m.levelId))
      const option = q.options.find((o) => building && o.buildingIds.includes(building.id))
      if (option) docksOf.set(m.id, derived.options[option.id]?.docks.docks.filter((d) => d.massId === m.id) ?? [])
    }
  } catch {
    // a project the engine cannot read keeps no docks
  }

  let programs = q.programs
  const types = [...(q.warehouseTypes ?? [])]
  let buildings = [...q.buildings]
  const masses = [...q.masses]
  const added = new Map<Id, Id[]>()
  const moved = new Map<Id, { from: Id; to: Id }>()
  const made: string[] = []
  const refused: string[] = []
  let converted = 0
  let left = 0
  let holes = 0
  // the masses whose program is not in the project
  const lost: string[] = []
  // each converted mass's corners before and after: a dimension's anchor names a corner by its index
  const corners = new Map<Id, { was: Point[]; now: Point[] }>()

  // the buildings a block took over, and those a mass that stays free stands in
  const taken = new Set<Id>()
  const stays = new Set<Id>()
  const leftFree: { m: Mass; home: Id }[] = []

  /**
   * A new building for a mass of `home`, in the same options, on a copy of its level, its platform joined to `home`'s, the platform step
   * that named the mass with it; the mass's dimensions follow (`moved`). The caller adds the building and sets the mass's level.
   */
  const split = (home: Building, level: Building['levels'][number], m: Mass, warehouse?: WarehouseCopy): Building => {
    const to = newId('l', buildings.flatMap((b) => b.levels.map((l) => l.id)))
    const step = home.platform?.steps?.find((s) => s.masses.includes(m.id))
    const building: Building = {
      id: newId('b', buildings.map((b) => b.id)),
      name: m.name,
      color: home.color,
      levelHeight: home.levelHeight,
      ...(home.context ? { context: true } : {}),
      levels: [{ ...level, id: to }],
      platform: { joined: home.id, ...(step ? { steps: [{ id: step.id, masses: [m.id], ...(step.level !== undefined ? { level: step.level } : {}) }] } : {}) },
      ...(warehouse ? { warehouse } : {}),
      ...(home.locked ? { locked: true } : {}),
    }
    moved.set(m.id, { from: level.id, to })
    added.set(home.id, [...(added.get(home.id) ?? []), building.id])
    // the step that named it stays with its building
    const steps = home.platform?.steps?.map((s) => ({ ...s, masses: s.masses.filter((id) => id !== m.id) })).filter((s) => s.masses.length > 0)
    if (step && home.platform) {
      const { steps: _s, ...platform } = home.platform
      buildings = buildings.map((b) => (b.id === home.id ? { ...b, platform: { ...platform, ...(steps?.length ? { steps } : {}) } } : b))
    }
    return building
  }

  for (const m of free) {
    const at = masses.findIndex((x) => x.id === m.id)
    const home = buildings.find((b) => b.levels.some((l) => l.id === m.levelId))
    const level = home?.levels.find((l) => l.id === m.levelId)
    const no = (why: string) => {
      refused.push(`${m.name} (${why})`)
      if (home) {
        stays.add(home.id)
        leftFree.push({ m, home: home.id })
      }
    }
    if (!home || !level) {
      no('its level is missing')
      continue
    }
    const was = footprintPolygon(m.footprint)
    if (!isSimple(was)) {
      no('its outline crosses itself')
      continue
    }
    if (area(was) < 1) {
      no('its area is under 1 m²')
      continue
    }
    const program = m.programId === null ? undefined : programs.find((g) => g.id === m.programId)
    if (m.programId !== null && !program) lost.push(m.name)
    const height = m.height ?? level.height
    const known = program ? types.find((t) => t.program === program.id) : types.find((t) => t.program === null)
    const fresh = known ? undefined : typeFor(types, programs, program, q.grid, height)
    let type = (known ?? fresh!.type) as WarehouseType
    const o = outlineFromFace(footprintContour(m.footprint), m.holes ?? [], type.envelope.thickness, blockFrame(m.footprint))
    if (!o) {
      no('its walls do not fit inside it')
      continue
    }
    // its block: the type itself (its outline the stroke), or a variant of it (its own outline and holes, no zones)
    let warehouse: WarehouseCopy
    if (fresh) {
      type = { ...type, hall: { ...type.hall, length: o.length, width: o.width }, morphology: { outline: o.box ? [] : o.outline, ...(o.arcs ? { arcs: o.arcs } : {}), holes: o.holes } }
      warehouse = { type: type.id, place: o.place }
    } else {
      const hall: NonNullable<WarehouseOverrides['hall']> = {}
      if (Math.abs(o.length - type.hall.length) > 1e-6) hall.length = o.length
      if (Math.abs(o.width - type.hall.width) > 1e-6) hall.width = o.width
      const overrides: WarehouseOverrides = {
        ...(Object.keys(hall).length ? { hall } : {}),
        morphology: { outline: o.outline, ...(o.arcs ? { arcs: o.arcs } : type.morphology.arcs ? { arcs: {} } : {}), holes: o.holes, ...(type.morphology.zones?.length ? { zones: [] } : {}) },
        elements: [],
        courts: [],
        ...(Math.abs(height - type.envelope.height) > 1e-6 ? { envelope: { height } } : {}),
      }
      warehouse = { type: type.id, place: o.place, overrides }
    }
    // what stood on its walls, frozen
    const stood = standing(typeWith(type, warehouse.overrides), o.place, docksOf.get(m.id) ?? [])
    if (fresh) type = { ...type, elements: stood.elements, ...(stood.courts.length ? { courts: stood.courts } : {}) }
    else warehouse = { ...warehouse, overrides: { ...warehouse.overrides, elements: stood.elements, courts: stood.courts } }
    if (fresh && !WarehouseTypeSchema.safeParse(type).success) {
      no('its block does not read')
      continue
    }

    // its mass: the hall, as the type makes it there, the mass's own court depths on the same walls
    const [c] = copyParts(type, warehouse)
    const courts = onSameWalls(m.courts, was, footprintPolygon(c.footprint))
    const flips = m.locked ? onSameWalls(m.doorFlips, was, footprintPolygon(c.footprint), false) : undefined
    const hall: Mass = {
      id: m.id,
      name: m.name,
      levelId: m.levelId,
      programId: c.programId,
      footprint: c.footprint,
      ...(c.holes.length ? { holes: c.holes } : {}),
      height: c.height,
      docks: c.docks,
      ...(c.docks.length || c.doorsAt.length ? { doorsAt: c.doorsAt } : {}),
      ...(c.blockCourts.length ? { blockCourts: c.blockCourts } : {}),
      part: 'hall',
      ...(m.group ? { group: m.group } : {}),
      ...(c.zones.length ? { zones: c.zones } : {}),
      ...(courts ? { courts } : {}),
      ...(m.locked ? { locked: true, ...(m.doorPattern && { doorPattern: m.doorPattern }), ...(flips && { doorFlips: flips }) } : {}),
    }

    // its building: the first free mass of one takes it over, each other gets a building of its own
    // (a building one of whose free masses stays free is not taken over: the block gets one of its own)
    let building: Building
    if (!home.warehouse && !stays.has(home.id)) {
      building = { ...home, name: m.name, warehouse }
      taken.add(home.id)
    } else {
      building = split(home, level, m, warehouse)
      hall.levelId = building.levels[0].id
    }
    buildings = home.warehouse || stays.has(home.id) ? [...buildings, building] : buildings.map((b) => (b.id === home.id ? building : b))

    if (fresh) {
      types.push(type)
      programs = fresh.programs
      made.push(type.name)
    } else types[types.findIndex((t) => t.id === type.id)] = type
    masses[at] = hall
    corners.set(m.id, { was: footprintContour(m.footprint).vertices, now: footprintContour(hall.footprint).vertices })
    converted++
    left += stood.left
    holes += o.dropped
  }

  // a free mass in a building a block took over (the refused one came after): a building of its own, no block
  for (const r of leftFree) {
    const home = buildings.find((b) => b.id === r.home)
    const level = home?.levels.find((l) => l.id === r.m.levelId)
    if (!home || !level || !taken.has(home.id)) continue
    const building = split(home, level, r.m)
    buildings = [...buildings, building]
    const at = masses.findIndex((x) => x.id === r.m.id)
    masses[at] = { ...masses[at], levelId: building.levels[0].id }
  }

  if (!converted && !refused.length) return p
  if (converted) {
    notes.push(`${plural(converted, 'mass is a block', 'masses are blocks')} now${made.length ? ` (${plural(made.length, 'new block type', 'new block types')}: ${made.join(', ')})` : ''}.`)
    if (left) notes.push(`${plural(left, 'dock', 'docks')} on angled walls ${left === 1 ? 'was' : 'were'} left out.`)
    if (lost.length) notes.push(`${plural(lost.length, 'mass', 'masses')} had a program that is not in the project (${lost.join(', ')}): ${lost.length === 1 ? 'it is' : 'they are'} blocks of the shared Block type, with no program.`)
    if (holes) notes.push(`${plural(holes, 'hole', 'holes')} outside ${holes === 1 ? 'its block' : 'their blocks'} ${holes === 1 ? 'was' : 'were'} left out.`)
  }
  if (refused.length) notes.push(`${plural(refused.length, 'mass', 'masses')} could not become a block: ${refused.join(', ')}.`)
  if (!converted) return p

  const options = added.size ? q.options.map((o) => ({ ...o, buildingIds: o.buildingIds.flatMap((id) => [id, ...(added.get(id) ?? [])]) })) : q.options
  const dimensions = q.dimensions?.map((d) => {
    const to = [d.anchorA?.massId, d.anchorB?.massId].map((id) => (id ? moved.get(id) : undefined)).find((x) => x && x.from === d.levelId)
    const { anchorA, anchorB, ...rest } = d
    const a = reanchor(anchorA, corners)
    const b = reanchor(anchorB, corners)
    return { ...rest, ...(to ? { levelId: to.to } : {}), ...(a ? { anchorA: a } : {}), ...(b ? { anchorB: b } : {}) }
  })
  return { ...q, programs, buildings, options, masses, warehouseTypes: types, ...(dimensions ? { dimensions } : {}) } as unknown as Json
}
