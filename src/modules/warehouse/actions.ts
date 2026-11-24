// Warehouse type actions (Decision "Warehouse type", Phase W). Pure, like the rest: nothing changed → the same
// project. A type is edited step by step, any step at any time (modules/warehouse/engine/steps.ts); every change remakes its
// copies' masses, each where it stands (its place read from its hall as the type was, then the type changed). A type
// is a Warehouse program's deep definition (Decision "Program rule set"): one per program, each with its own.
//   types   addWarehouseType · renameWarehouseType · duplicateWarehouseType · copyWarehouseType ·
//           removeWarehouseType · setWarehouseProgram
//   steps   updateWarehouseStep · editWarehouseStep (by hand) · setWarehouseFigures (from
//           the Brief) · lockWarehouseStep · reopenWarehouseStep · shapeWarehouse (step 5 by hand, Decision "Block
//           shape": an edge moved, a stretch pulled out or pushed in, a corner removed, a hole, an edge's own wall) ·
//           setHallJoin (step 2's short end bays, Decision "Grid by line") · setGridBy (step 1 by the bay or the module) ·
//           setEndsAutomatically (step 1's button, BE.6) · moveGridLine · removeGridLine · regularGrid (a line by hand, GR.3) ·
//           moveGridLines · slideElements · removePicked (several picked on the plan, BE.9) · putElements · removeElements · setElementsWidth ·
//           renameElements (the tools' docks, doors and patterns, one a module, and step 6's width and name: Decision
//           "Elements by module") · setEdgeCourt (the Court tool: a wall's court and its depth, Decision "Truck court")
//   draw    drawBlock · blockTypeFor · mergeBlocks (a stroke on the site is a block's outer face, of its program's type; the Union of
//           blocks of one type: Phase D.2, Decision "Draw makes a block")
//   copies  placeWarehouse · placeWarehouseAt · copyWithBlocks · stretchWarehouseHall · setWarehouseOverrides ·
//           putCopyElements · setCopyEdgeCourt · copyBackToType (a placed block's own docks, doors, patterns and
//           courts, its type never changed, and Back to type: Decision "Blocks on the site")
//   walls   blockWalls · stretchBlockWall · moveBlockEdge · removeMassesWithBlocks (a placed block's walls: the box's
//           past the range by hand too, the inner ones without a limit, the variant's) · shapeCopy (a copy's own outline edited
//           as its type's is: a bump, a corner removed; Phase D.1)
//   shape   typeShapeOf · editTypeShape · blockShapeOf · editBlockShape (a block's outline through the shape engine, on its module
//           lines: the adapters of the `block-type` kind and of a block's mass, `state/actions/shape.ts`) · courtShapeOf · editCourtShape ·
//           courtToRectangle (a truck court a shape of its own, Phase D.3: the adapters of the `court` and `block-court` kinds, and Back to a rectangle)
//   range   pastRanges · bringToRange (Decision "Past the range by hand": the optimizer asks, then brings them back)
//   library bringBlock · updateFromLibrary · linkBlock · unlinkBlock (Decision "Block library")
import {
  WarehouseTypeSchema,
  type Block,
  type Building,
  type Footprint,
  type Hole,
  type HallElement,
  type HallSide as Facing,
  type Contour,
  type CourtByEdge,
  type Id,
  type Mass,
  type OutlineCorner,
  type Point,
  type Program,
  type Project,
  type ShapeHole,
  type Step,
  type WarehouseCopy,
  type WarehouseOverrides,
  type WarehouseStep,
  type WarehouseType,
} from '../../model/schema.ts'
import { BUILDING_COLORS, freeColor } from '../../model/buildingColors.ts'
import { massIsLocked } from '../../model/locks.ts'
import { groupIdsIn } from '../../engine/groups.ts'
import { allLevels, buildingOfLevel } from '../../engine/buildings.ts'
import { groundLevel } from '../../engine/levels.ts'
import { definitionOf, kindOf } from '../../engine/programs.ts'
import { copyGenerated, copyOnPlan, copyParts, fromPlace, onPlace, type HallSide, type Place } from './engine/copies.ts'
import { contourFromPolygon } from '../../engine/geom/contour.ts'
import { polygonFootprint } from '../../engine/geom/draw.ts'
import { cosSin, footprintContour, footprintPolygon } from '../../engine/geom/footprint.ts'
import { holesIn } from '../../engine/geom/holes.ts'
import { mergeShapes } from '../../engine/geom/merge.ts'
import { offsetEdges } from '../../engine/geom/offsetEdges.ts'
import { runShapeOp, type ShapeOp, type ShapeRead, type ShapeWall, type ShapeWrite } from '../../engine/geom/shapeOp.ts'
import { edgeAt } from '../../engine/geom/perimeter.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { setCourtDepth } from '../docks/actions.ts'
import { COURT_DEPTH_MAX, COURT_DEPTH_MIN, dockableWalls, type Wall } from '../docks/engine/docks.ts'
import { STAYS_ON_WALL, courtContour, courtDepth, courtRule, faceSpan, freeCourtId, fromWall, mirrored, splitCourt, toWall, wallFrame, wallSide, wentNote, type WallSpan } from './engine/courts.ts'
import type { Ref } from '../../kinds/types.ts'
import { distancePointSegment } from '../../engine/geom/polygon.ts'
import { newWarehouseType } from './engine/defaults.ts'
import { ELEMENT_WIDTH, courtsFollowed, type CourtsVia, courtsOnAngled, followCourts, followEdges, freeElementId, isOf, leftOnAngled, leftOutNotes, patternName } from './engine/elements.ts'
import { blockFrame, outlineFromFace as outlineOfStroke } from './engine/blocks.ts'
import { runOutlineOp, outlineFromFace, type OutlineRun } from './engine/outlineOp.ts'
import { pastInWords, pastRange, type PastSide } from './engine/range.ts'
import { autoEnds, hallEnds, lineModules, moduleAt as lineAt, movedLines, nearestLine, ownLinesOf } from './engine/bays.ts'
import { baysOf, onDockRule, runAlongEdge, type RuleHost } from './engine/dockRule.ts'
import type { EdgeInfo, EdgeOp, EdgeRead, EdgeWrite } from '../../engine/edge/onEdge.ts'
import { boxOf, generate, hallLimits, hallRuns, ownBundle, rebasedCopy, regularRuns, sameGridAs, typeWith, type Generated } from './engine/generate.ts'
import { ANGLED_COURT, ANGLED_ELEMENTS, axisOf, canSlide, drawn, edgeModules, editOutline, elementsAnchored, elementsNearest, elementsOn, faceOf, freeEdgeId, holeFits, moveInnerEdge, outlineOn, outwardOf, rectContour, relaidRuns, relaidShape, shapeNow, shapeOf, zonesOn, type OutlineEdit, type ShapeEdge, type ShapeEdit } from './engine/shape.ts'
import { lockStep, reopenStep, type StepPatch } from './engine/steps.ts'
import { isNewer, programIdsOf, withPrograms } from './engine/library.ts'
import { addBuilding, addBuildingToOption, removeBuilding } from '../../state/actions/buildings.ts'
import { copyMasses, copyName, newId, removeMasses } from '../../state/actions/masses.ts'

const typeOf = (p: Project, id: Id) => p.warehouseTypes?.find((t) => t.id === id)
const withType = (p: Project, t: WarehouseType): Project => ({ ...p, warehouseTypes: (p.warehouseTypes ?? []).map((x) => (x.id === t.id ? t : x)) })
const copiesOf = (p: Project, typeId?: Id) => p.buildings.filter((b) => b.warehouse && (typeId === undefined || b.warehouse.type === typeId))
const levelsOf = (b: Building) => new Set(b.levels.map((l) => l.id))

/** "Warehouse A", "Warehouse B"…: the first letter not taken. */
function nextTypeName(p: Project): string {
  const taken = new Set((p.warehouseTypes ?? []).map((t) => t.name))
  for (const l of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!taken.has(`Warehouse ${l}`)) return `Warehouse ${l}`
  return copyName(taken, 'Warehouse')
}

/**
 * A new Warehouse program at the brief's end, in a colour no program has: named after a type, or a copy of a program
 * (its docks, size and style; not its target: what the client asks of it stays with the first).
 */
function newProgram(p: Project, name: string, from?: Program): { project: Project; id: Id } {
  const id = newId('p', p.programs.map((g) => g.id))
  const color = freeColor(p.programs, from?.color ?? BUILDING_COLORS[p.programs.length % BUILDING_COLORS.length])
  const program: Program = from
    ? { ...structuredClone(from), id, name: copyName(p.programs.map((g) => g.name), from.name), color, kind: 'warehouse' }
    : { id, name, color, built: true, kind: 'warehouse' }
  delete program.target
  return { project: { ...p, programs: [...p.programs, program] }, id }
}

// ---- Copies ------------------------------------------------------------------------------------------------------

/** Each copy (of that type) with its place read from its hall as it stands: moved or turned since it was made. */
function withPlaces(p: Project, typeId?: Id): Project {
  let changed = false
  const buildings = p.buildings.map((b) => {
    const t = b.warehouse && (typeId === undefined || b.warehouse.type === typeId) ? typeOf(p, b.warehouse.type) : undefined
    if (!t || !b.warehouse) return b
    const levels = levelsOf(b)
    const hall = p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')
    const warehouse = copyOnPlan(t, b.warehouse, hall?.footprint)
    if (warehouse === b.warehouse) return b
    changed = true
    return { ...b, warehouse }
  })
  return changed ? { ...p, buildings } : p
}

/**
 * A copy's masses made again from its type: each part's mass kept by its part (its id, level and name), new parts
 * added, gone ones removed; grouped, so they are picked and moved as one; the level steps on platform steps of its own.
 * `placed`: the copy was just placed, nothing made yet. Else a copy without its hall (an older project, where it was
 * deleted and other masses drawn in its building) is not made again: its type's masses would come back beside them. A locked
 * mass stays locked (the padlock is CAD's): an edit of the type that would change it is refused whole, one that would not passes.
 */
function remake(p: Project, buildingId: Id, placed = false): Project {
  const b = p.buildings.find((x) => x.id === buildingId)
  const t = b?.warehouse && typeOf(p, b.warehouse.type)
  if (!b?.warehouse || !t) return p
  if (!placed && !p.masses.some((m) => levelsOf(b).has(m.levelId) && m.part === 'hall')) return p
  const made = copyParts(t, b.warehouse)
  const levels = levelsOf(b)
  const ground = groundLevel(b.levels).id
  const mine = p.masses.filter((m) => levels.has(m.levelId) && m.part !== undefined)
  const old = new Map(mine.map((m) => [m.part!, m]))
  const taken = p.masses.map((m) => m.id)
  const group = made.length > 1 ? (mine.find((m) => m.group)?.group ?? newId('g', groupIdsIn(p))) : undefined
  const fresh: Mass[] = made.map((c) => {
    const was = old.get(c.part)
    const id = was?.id ?? newId('m', taken)
    taken.push(id)
    // one mass (Decision "Block shape"): a group of its own only when the designer made one
    const own = group ?? was?.group
    return {
      id,
      name: `${b.name} · ${c.name}`,
      levelId: was?.levelId ?? ground,
      programId: c.programId,
      footprint: c.footprint,
      ...(c.holes.length ? { holes: c.holes } : {}),
      height: c.height,
      docks: c.docks,
      // its doors given whenever it has docked walls (a court-only wall none, never the default ones)
      ...(c.docks.length || c.doorsAt.length ? { doorsAt: c.doorsAt } : {}),
      ...(c.blockCourts.length ? { blockCourts: c.blockCourts } : {}),
      part: c.part,
      ...(own ? { group: own } : {}),
      ...(c.zones.length ? { zones: c.zones } : {}),
      // the walls' own court depths stay with the copy (Decision "Truck court"), each named by its wall's t
      ...(was?.courts ? { courts: was.courts } : {}),
      // a locked hall (its own flag, or its building's) keeps the doors it has of its own, and stays locked by its own flag when it has one:
      // whatever the type's edit would change in it, settle.ts refuses the edit (the padlock is CAD's); an edit that leaves it as it is, passes
      ...(was && massIsLocked(p, was) ? { ...(was.locked ? { locked: true } : {}), ...(was.doorPattern && { doorPattern: was.doorPattern }), ...(was.doorFlips && { doorFlips: was.doorFlips }) } : {}),
    }
  })
  const byId = new Map(fresh.map((m) => [m.id, m]))
  const gone = new Set(mine.filter((m) => !byId.has(m.id)).map((m) => m.id))
  const kept = new Set<Id>()
  const masses = p.masses.flatMap((m) => {
    if (gone.has(m.id)) return []
    const f = byId.get(m.id)
    if (!f) return [m]
    kept.add(m.id)
    return [f]
  })
  masses.push(...fresh.filter((m) => !kept.has(m.id)))

  // the level steps: the made masses off any step, then one step per level other than the hall's
  const madeIds = new Set(fresh.map((m) => m.id))
  const base = b.platform?.level
  const own = (b.platform?.steps ?? []).filter((s) => !s.id.startsWith(`${b.id}-level-`))
  const handSteps = own.map((s) => ({ ...s, masses: s.masses.filter((id) => !madeIds.has(id) && !gone.has(id)) })).filter((s) => s.masses.length > 0)
  const byLevel = new Map<number, Id[]>()
  made.forEach((c, i) => {
    if (c.level !== 0) byLevel.set(c.level, [...(byLevel.get(c.level) ?? []), fresh[i].id])
  })
  const madeSteps: Step[] = [...byLevel].map(([level, ids], k) => ({ id: `${b.id}-level-${k + 1}`, masses: ids, ...(base !== undefined ? { level: base + level } : {}) }))
  const steps = [...handSteps, ...madeSteps]
  const platform = b.platform || steps.length ? { ...b.platform, ...(steps.length ? { steps } : {}) } : undefined
  if (platform && !steps.length) delete platform.steps
  const building: Building = platform ? { ...b, platform } : b
  return { ...p, masses, buildings: p.buildings.map((x) => (x.id === b.id ? building : x)) }
}

/** Every copy of a type made again. */
function remakeCopies(p: Project, typeId: Id): Project {
  return copiesOf(p, typeId).reduce((q, b) => remake(q, b.id), p)
}

/** A type changed: its copies read where they stand with the type as it was, then made again with the new one. */
function changeType(p: Project, next: WarehouseType): Project {
  if (!WarehouseTypeSchema.safeParse(next).success) return p
  const before = typeOf(p, next.id)
  if (!before || JSON.stringify(before) === JSON.stringify(next)) return p
  return remakeCopies(withType(withPlaces(p, next.id), next), next.id)
}

// ---- Types -------------------------------------------------------------------------------------------------------

/**
 * A new type: Warehouse A, B…, every step open, the definition of a Warehouse program (Decision "Program rule set"):
 * `program` (when no type defines it yet), else the brief's first Warehouse program without one, else a new program named
 * after it. Its grid and range are the program's, moved onto it (else the project's grid's bays, else 12 × 12 m in 4).
 * `keepKind` (a block drawn of any program: `blockTypeFor`): that program alone, its kind as it is (an office stays an office); else
 * the program becomes a Warehouse program.
 */
export function addWarehouseType(p: Project, init: { name?: string; program?: Id; keepKind?: boolean } = {}): { project: Project; id: Id } {
  const id = newId('wt', (p.warehouseTypes ?? []).map((t) => t.id))
  const free = (g: Program) => !definitionOf(p, g.id)
  const owner = p.programs.find((g) => g.id === init.program && free(g)) ?? (init.keepKind ? undefined : p.programs.find((g) => kindOf(g) === 'warehouse' && free(g)))
  const name = init.name?.trim() || nextTypeName(p)
  const made = owner ? { project: p, id: owner.id } : newProgram(p, name)
  const program = made.project.programs.find((g) => g.id === made.id)!
  const grid = program.grid ?? (p.grid ? { x: p.grid.x, y: p.grid.y, modules: p.grid.modules } : undefined)
  const t = newWarehouseType(id, name, { grid, program: program.id, height: p.buildings[0].levelHeight })
  const r = program.range
  if (r?.width || r?.depth) t.hall.range = { ...(r.width && { length: r.width }), ...(r.depth && { width: r.depth }) }
  // the grid and range now the type's: the program keeps neither (one place for each)
  const { grid: _, range: __, ...rest } = program
  const programs = made.project.programs.map((g) => (g.id === program.id ? { ...rest, ...(init.keepKind && owner ? {} : { kind: 'warehouse' as const }) } : g))
  return { project: { ...made.project, programs, warehouseTypes: [...(p.warehouseTypes ?? []), t] }, id }
}

export function renameWarehouseType(p: Project, id: Id, name: string): Project {
  const t = typeOf(p, id)
  const n = name.trim()
  if (!t || !n || n === t.name) return p
  return withType(p, { ...t, name: n })
}

/**
 * A copy of a type, its steps as they are (its copies stay with the first), on a copy of its program (one program, one
 * rule set: its target and rules stay with the first).
 */
export function duplicateWarehouseType(p: Project, id: Id): { project: Project; id: Id } | null {
  const t = typeOf(p, id)
  if (!t) return null
  const from = p.programs.find((g) => g.id === t.program)
  const made = newProgram(p, t.name, from)
  return copyWarehouseType(made.project, id, made.id)
}

/** A copy of a type, its steps as they are, defining another program (one no type defines yet); null otherwise. */
export function copyWarehouseType(p: Project, id: Id, program: Id): { project: Project; id: Id } | null {
  const t = typeOf(p, id)
  if (!t || !p.programs.some((g) => g.id === program) || definitionOf(p, program)) return null
  const copy = { ...structuredClone(t), id: newId('wt', (p.warehouseTypes ?? []).map((x) => x.id)), name: copyName((p.warehouseTypes ?? []).map((x) => x.name), t.name), program }
  return { project: { ...p, warehouseTypes: [...(p.warehouseTypes ?? []), copy] }, id: copy.id }
}

/** A type removed: its copies stay as the masses they are, no longer linked. */
export function removeWarehouseType(p: Project, id: Id): Project {
  if (!typeOf(p, id)) return p
  const copies = new Set(copiesOf(p, id).map((b) => b.id))
  const levels = new Set(p.buildings.filter((b) => copies.has(b.id)).flatMap((b) => b.levels.map((l) => l.id)))
  const types = p.warehouseTypes!.filter((t) => t.id !== id)
  const { warehouseTypes: _, ...rest } = p
  return {
    ...rest,
    ...(types.length ? { warehouseTypes: types } : {}),
    buildings: p.buildings.map((b) => {
      if (!copies.has(b.id)) return b
      const { warehouse: __, ...free } = b
      return free
    }),
    masses: p.masses.map((m) => {
      if (!levels.has(m.levelId) || m.part === undefined) return m
      const { part: ___, ...free } = m
      return free
    }),
  }
}

/**
 * The program of the type's hall (and of its parts that take the hall's): the program it defines, which becomes a
 * Warehouse program. One another type defines is not taken (one program, one rule set).
 */
export function setWarehouseProgram(p: Project, id: Id, program: Id): Project {
  const t = typeOf(p, id)
  const by = definitionOf(p, program)
  if (!t || !p.programs.some((g) => g.id === program) || (by && by.id !== id)) return p
  const q = changeType(p, { ...t, program })
  return q === p ? p : { ...q, programs: q.programs.map((g) => (g.id === program ? { ...g, kind: 'warehouse' as const } : g)) }
}

// ---- Library -----------------------------------------------------------------------------------------------------

/** `name` when no other has it, else its copy's name. */
const freeName = (taken: Iterable<string>, name: string) => (new Set(taken).has(name) ? copyName(taken, name) : name)

/**
 * The programs a block's type names, but its hall's, found in the project or added to it: the project's own when it
 * has one of that id and name (an office of the same typology), else a copy of the block's (an id and a colour of its
 * own). Returns the project and how each of the block's ids is called in it.
 */
function partPrograms(p: Project, b: Block): { project: Project; map: Map<Id, Id> } {
  const map = new Map<Id, Id>()
  let programs = p.programs
  for (const pid of programIdsOf(b.type)) {
    if (pid === b.type.program) continue
    const own = programs.find((g) => g.id === pid)
    const given = b.programs.find((g) => g.id === pid)
    if (own && (!given || own.name === given.name)) continue
    if (!given) continue
    const id = newId('p', programs.map((g) => g.id))
    programs = [...programs, { ...structuredClone(given), id, name: freeName(programs.map((g) => g.name), given.name), color: freeColor(programs, given.color) }]
    map.set(pid, id)
  }
  return { project: programs === p.programs ? p : { ...p, programs }, map }
}

/**
 * A library block in the project (Decision "Block library"): a type linked to it, on a Warehouse program of its own
 * named after the block's (one program, one rule set; no target), or the project's own of that id and name no type
 * defines yet; its parts' programs found or added. A block already
 * there is the type it is (`updateFromLibrary` brings it up to date).
 */
export function bringBlock(p: Project, b: Block): { project: Project; id: Id } {
  const there = p.warehouseTypes?.find((t) => t.library?.id === b.id)
  if (there) return { project: p, id: there.id }
  const parts = partPrograms(p, b)
  let q = parts.project
  const map = parts.map
  const hall = b.programs.find((g) => g.id === b.type.program)
  // the project's own program of that id and name, when no type defines it yet (a new industrial project's Warehouse:
  // its target and its KPI then count the block), else one of its own
  const free = hall && q.programs.find((g) => g.id === hall.id && g.name === hall.name && !definitionOf(q, g.id))
  if (free) q = { ...q, programs: q.programs.map((g) => (g.id === free.id ? { ...g, kind: 'warehouse' as const } : g)) }
  else if (hall) {
    const id = newId('p', q.programs.map((g) => g.id))
    const { target: _, ...rest } = structuredClone(hall)
    q = { ...q, programs: [...q.programs, { ...rest, id, name: freeName(q.programs.map((g) => g.name), hall.name), color: freeColor(q.programs, hall.color), kind: 'warehouse' }] }
    map.set(hall.id, id)
  }
  const id = newId('wt', (q.warehouseTypes ?? []).map((t) => t.id))
  const name = freeName((q.warehouseTypes ?? []).map((t) => t.name), b.type.name)
  const t: WarehouseType = { ...withPrograms(structuredClone(b.type), map), id, name, library: { id: b.id, version: b.version } }
  return { project: { ...q, warehouseTypes: [...(q.warehouseTypes ?? []), t] }, id }
}

/**
 * Each type linked to one of `blocks` brought up to its newest version: the block's steps (its name and its own hall
 * program kept, its parts' programs found or added), its copies made again. Returns the types brought up to date.
 */
export function updateFromLibrary(p: Project, blocks: readonly Block[]): { project: Project; updated: Id[] } {
  let q = p
  const updated: Id[] = []
  for (const t of p.warehouseTypes ?? []) {
    const b = blocks.find((x) => isNewer(t, x))
    if (!b) continue
    const parts = partPrograms(q, b)
    const map = new Map(parts.map)
    if (b.type.program && t.program) map.set(b.type.program, t.program)
    const next: WarehouseType = { ...withPrograms(structuredClone(b.type), map), id: t.id, name: t.name, program: t.program, library: { id: b.id, version: b.version } }
    const r = changeType(parts.project, next)
    if (r === parts.project) continue
    q = r
    updated.push(t.id)
  }
  return { project: q, updated }
}

/** A type linked to a block at a version: what saving it to the library makes it (it is that version now). */
export function linkBlock(p: Project, id: Id, library: { id: Id; version: number }): Project {
  const t = typeOf(p, id)
  if (!t || (t.library?.id === library.id && t.library.version === library.version)) return p
  return withType(p, { ...t, library: { ...library } })
}

/** A type no longer linked to its block: it stays as it is, the library's changes no longer reach it. */
export function unlinkBlock(p: Project, id: Id): Project {
  const t = typeOf(p, id)
  if (!t?.library) return p
  const { library: _, ...rest } = t
  return withType(p, rest)
}

// ---- Steps -------------------------------------------------------------------------------------------------------

/** A step's figures, in any state (Decision "Free steps"): the step opened (its lock gone, the later locked ones to lock
 *  again); its copies made again. A patch that changes nothing: the same project. */
function editStep<S extends WarehouseStep>(p: Project, id: Id, step: S, patch: StepPatch[S]): Project {
  const t = typeOf(p, id)
  if (!t) return p
  const patched = (x: WarehouseType) => (step === 'elements' ? { ...x, elements: patch as HallElement[] } : { ...x, [step]: { ...x[step], ...patch } }) as WarehouseType
  if (JSON.stringify(patched(t)) === JSON.stringify(t) || !WarehouseTypeSchema.safeParse(patched(t)).success) return p
  return redraw(p, t, patched(reopenStep(t, step)))
}

/** A type changed in its steps' figures, drawn again on its new box (`onNewBox`): its copies' own shapes (each one
 *  bundle with its own elements) drawn again on their boxes as they are now, its copies made again. */
function redraw(p: Project, t: WarehouseType, patched: WarehouseType): Project {
  const next = onNewBox(t, patched)
  if (!WarehouseTypeSchema.safeParse(next).success) return p
  return changeType(withCopies(p, t, (o) => rebasedCopy(t, o, next, o)), next)
}

/**
 * A type's copies with their overrides changed by `f`, each copy's own shape first made one bundle (`ownBundle`); none
 * changed: the same project.
 */
function withCopies(p: Project, t: WarehouseType, f: (o: WarehouseOverrides | undefined) => WarehouseOverrides | undefined): Project {
  let changed = false
  const buildings = p.buildings.map((b) => {
    if (b.warehouse?.type !== t.id) return b
    const o = f(ownBundle(t, b.warehouse.overrides))
    if (o === b.warehouse.overrides) return b
    changed = true
    return { ...b, warehouse: { ...b.warehouse, overrides: o } }
  })
  return changed ? { ...p, buildings } : p
}

/**
 * A copy with its own shape when its type's shape is edited (step 5, the type's box fitted round it): its shape is its
 * own, so its box stays as it was (its length, width and ends its own where the type's changed). No own shape: as it is.
 */
function keptBox(t: WarehouseType, next: WarehouseType, o: WarehouseOverrides | undefined): WarehouseOverrides | undefined {
  if (!o?.morphology?.outline || !drawn(o.morphology.outline)) return o
  const was = typeWith(t, o).hall
  const now = typeWith(next, o).hall
  const hall: Record<string, unknown> = { ...o.hall }
  let changed = false
  for (const k of ['length', 'width', 'ends', 'endsWidth', 'shortEnds'] as const) {
    if (JSON.stringify(was[k]) === JSON.stringify(now[k])) continue
    // absent, what it meant: the width's end bays the length's, no short end of its own
    hall[k] = was[k] ?? (k === 'endsWidth' ? was.ends : k === 'shortEnds' ? {} : undefined)
    changed = true
  }
  return changed ? { ...o, hall: hall as WarehouseOverrides['hall'] } : o
}

/**
 * A type drawn again on its box after an edit of its size or its grid (Decision "Elements by module": one frame, the
 * box as it is, for its corners, holes, zones and elements): its shape as it stands on the new box; its elements a
 * longer or shorter box anchors as the corners (new modules come empty, the modules that go take theirs), another grid
 * puts each on the module whose centre is nearest where it stood. A box relaid at its size (its ends: *Set end bays
 * automatically*, `relaidRuns`) keeps everything in its place in m: its corners, holes and zones each on the module line
 * nearest, its elements on the module whose centre is nearest. Its elements edited, or its box as it was: as it is.
 */
function onNewBox(t: WarehouseType, next: WarehouseType): WarehouseType {
  if (next.elements !== t.elements) return next
  const before = hallRuns(t)
  const after = hallRuns(next)
  const was = boxOf(before)
  const now = boxOf(after)
  const regrid = !sameGridAs(next, t)
  const own = drawn(t.morphology.outline)
  const relaid = !regrid && relaidRuns(before, after)
  if (relaid) {
    const stood = shapeOf(t, before)
    const laid = relaidShape({ outline: own ? stood.outline : [], ...(own && stood.arcs ? { arcs: stood.arcs } : {}), holes: stood.holes, ...(t.morphology.zones?.length ? { zones: stood.zones } : {}) }, before, after)
    if (laid) {
      const edges = shapeOf({ ...next, morphology: laid }, after).edges
      return { ...next, morphology: laid, elements: elementsNearest(t.elements, axisOf(stood.outline), before, after, edges) }
    }
  }
  if (!regrid && !relaid && was.x === now.x && was.y === now.y) return next
  const shape = shapeOf(next, after)
  const morphology = { outline: own ? shape.outline : [], ...(own && shape.arcs ? { arcs: shape.arcs } : {}), holes: shape.holes, ...(t.morphology.zones?.length ? { zones: shape.zones } : {}) }
  const axis = axisOf(outlineOn(t, before))
  // another grid, or a box relaid whose shape could not be (`relaidShape` null): by the nearest centre, never by index
  const elements = !t.elements.length ? t.elements : regrid || relaid ? elementsNearest(t.elements, axis, before, after, shape.edges) : elementsOn({ elements: elementsAnchored(t.elements, axis, was, now) }, after, shape.edges)
  return { ...next, morphology, elements }
}

/** A type with its step 6 changed by the tools (its elements, its courts): step 6 opened as `editStep` opens it, its
 *  copies made again. The same type: the same project. */
function withElements(p: Project, t: WarehouseType, next: WarehouseType): Project {
  if (JSON.stringify(next) === JSON.stringify(t)) return p
  return changeType(p, reopenStep(next, 'elements'))
}

/** A type's outline's edges on its box now, and its elements as they stand on it (Decision "Elements by module"). */
function onBoxNow(t: WarehouseType) {
  const runs = hallRuns(t)
  const edges = shapeOf(t, runs).edges
  return { edges, elements: elementsOn(t, runs, edges) }
}

/**
 * The element tools (Decision "Elements by module", BE.4): one element of a kind put on each of an edge's `modules`
 * (counted on the block's box now) that holds none of that kind (`on`), or each of that kind there taken away (off). A
 * pattern is of a name (absent: the last pattern's, else Downpipe), so another name on a module is another pattern. A
 * new one is as wide as the last of its kind (a pattern of its name), else its kind's own (`ELEMENT_WIDTH`). Only the
 * modules on the edge's span count; none changed (or no such edge): the same project. Opens step 6 as `editStep` does.
 */
export function putElements(p: Project, typeId: Id, kind: HallElement['kind'], edge: Id, modules: number[], on: boolean, name?: string): Project {
  return editTypeEdge(p, { kind: 'block-type', id: typeId }, { op: on ? 'put' : 'take', edge, slots: modules, kind, ...(name !== undefined ? { name } : {}) }).project
}

/**
 * `putElements`' list (one of a kind on each of an edge's modules, or those taken away) on a type's box now: null when
 * nothing changed (or no such edge).
 */
function elementsPut(t: WarehouseType, kind: HallElement['kind'], edge: Id, modules: number[], on: boolean, name?: string): HallElement[] | null {
  const box = onBoxNow(t)
  const e = box.edges.find((x) => x.id === edge)
  if (!e) return null
  const span = edgeModules(e)
  const ks = [...new Set(modules)].filter((k) => Number.isInteger(k) && k >= span.lo && k + 1 <= span.hi).sort((a, b) => a - b)
  const named = kind === 'pattern' ? (name ?? patternName(box.elements)) : undefined
  const mine = (x: HallElement) => isOf(x, kind, edge, named)
  const now = box.elements
  if (!on) {
    const kept = now.filter((x) => !(mine(x) && ks.includes(x.module)))
    return kept.length === now.length ? null : kept
  }
  const like = now.findLast((x) => x.kind === kind && (kind !== 'pattern' || x.name === named))
  const width = like?.width ?? ELEMENT_WIDTH[kind]
  const out = [...now]
  for (const k of ks) if (!out.some((x) => mine(x) && x.module === k)) out.push({ id: freeElementId(out), kind, ...(named !== undefined ? { name: named } : {}), edge, module: k, width })
  return out.length === now.length ? null : out
}

/**
 * Why a wall of a block takes no dock, door or pattern (`what` 'element') or no truck court ('court'): it is not along the grid (Phase D.2:
 * *Docks, doors and patterns go on walls along the grid*). Undefined: it takes them. `owner`: a type, or a placed copy by its building.
 */
export function edgeRefusal(p: Project, owner: { type: Id } | { copy: Id }, edge: Id, what: 'element' | 'court'): string | undefined {
  const t = 'type' in owner ? typeOf(p, owner.type) : copyNow(p, owner.copy)?.c
  const e = t && onBoxNow(t).edges.find((x) => x.id === edge)
  return e && e.axis === null ? (what === 'element' ? ANGLED_ELEMENTS : ANGLED_COURT) : undefined
}

/** A docked edge has its court anyway: a court-only entry there without a depth of its own has nothing left to say. */
function docked(courts: WarehouseType['courts'], edge: Id): WarehouseType['courts'] {
  return courts?.some((c) => c.edge === edge && c.depth === undefined && !c.shape) ? courts.filter((c) => !(c.edge === edge && c.depth === undefined && !c.shape)) : courts
}

/** Some of a type's elements taken away by id (Select's Delete, the plan's menu). None of them there: the same project.
 *  Opens step 6 as `editStep` does. */
export function removeElements(p: Project, typeId: Id, ids: Id[]): Project {
  const t = typeOf(p, typeId)
  if (!t) return p
  const gone = new Set(ids)
  const elements = t.elements.filter((x) => !gone.has(x.id))
  return elements.length === t.elements.length ? p : withElements(p, t, { ...t, elements })
}

/**
 * Some elements as wide as `width` m (step 6's Width: every element of a kind, or the ones picked). Not a width (above
 * 0), none of the ids there, or all as wide already: the same project. Opens step 6 as `editStep` does.
 */
export function setElementsWidth(p: Project, typeId: Id, ids: Id[], width: number): Project {
  return editTypeEdge(p, { kind: 'block-type', id: typeId }, { op: 'width', ids, width }).project
}

/**
 * Some patterns named `name` (step 6's Name; trimmed, not empty): the ids of other kinds are left as they are. A pattern
 * that takes the name of one already on its module and edge joins it (one pattern of a name a module). None changed: the
 * same project. Opens step 6 as `editStep` does.
 */
export function renameElements(p: Project, typeId: Id, ids: Id[], name: string): Project {
  const t = typeOf(p, typeId)
  const to = name.trim()
  if (!t || !to) return p
  const these = new Set(ids)
  const named = t.elements.map((x) => (these.has(x.id) && x.kind === 'pattern' && x.name !== to ? { ...x, name: to } : x))
  if (!named.some((x, i) => x !== t.elements[i])) return p
  const seen = new Set<string>()
  const elements = named.filter((x) => {
    if (x.kind !== 'pattern') return true
    const key = `${x.edge}|${x.module}|${x.name ?? ''}`
    return seen.has(key) ? false : (seen.add(key), true)
  })
  return withElements(p, t, { ...t, elements })
}

/**
 * An edge's truck court (Decision "Truck court", BE.4: the Court tool, its pill), one entry an edge. A docked edge always
 * has its court, at the block's depth: an entry there only gives it a depth of its own, so `{ depth }` sets it and null
 * (or no depth) clears it, the court staying. An edge without docks: `{}` puts a court there (`{ depth }` with its own
 * depth), null takes it away. Not a depth, or no such edge: the same project. Opens step 6 as `editStep` does.
 */
export function setEdgeCourt(p: Project, typeId: Id, edge: Id, court: { depth?: number } | null): Project {
  const t = typeOf(p, typeId)
  const courts = t && courtsSet(t, edge, court)
  if (!t || !courts) return p
  const { courts: _, ...rest } = t
  return withElements(p, t, courts.length ? { ...t, courts } : rest)
}

/** `setEdgeCourt`'s list (an edge's court put, its own depth, or taken away) on a type's box now: null when not a depth,
 *  or no such edge. */
function courtsSet(t: WarehouseType, edge: Id, court: { depth?: number } | null): NonNullable<WarehouseType['courts']> | null {
  const depth = court?.depth
  if (depth !== undefined && !(Number.isFinite(depth) && depth > 0)) return null
  const box = onBoxNow(t)
  const on = box.edges.find((e) => e.id === edge)
  if (!on) return null
  // a truck court goes on a wall along the grid (Phase D.2): one is not put on an angled wall
  if (court !== null && on.axis === null) return null
  const isDocked = box.elements.some((x) => x.kind === 'dock' && x.edge === edge)
  const entry = court && (depth !== undefined || !isDocked) ? { edge, ...(depth !== undefined ? { depth } : {}) } : null
  const was = t.courts ?? []
  const at = was.findIndex((c) => c.edge === edge)
  const others = was.filter((c) => c.edge !== edge)
  // the entry where the edge's first was (`at` counts only other edges' entries before it)
  return entry ? (at < 0 ? [...others, entry] : [...others.slice(0, at), entry, ...others.slice(at)]) : others
}

/**
 * A type's truck courts (Decision "Truck court"; the docks step's): the depth in front of each docked edge and the range
 * the optimizer may search; null: the standards' again. Opens the docks step as `editStep` does; a range that does not
 * hold the depth, or not a depth: the same project.
 */
export function setTypeCourt(p: Project, id: Id, court: WarehouseType['court'] | null): Project {
  const t = typeOf(p, id)
  if (!t) return p
  if (court && (!(court.depth > 0) || (court.range && !(court.range[0] <= court.depth && court.depth <= court.range[1])))) return p
  const { court: _, ...rest } = t
  const next = (court ? { ...rest, court } : rest) as WarehouseType
  if (JSON.stringify(next) === JSON.stringify(t)) return p
  return changeType(p, reopenStep(next, 'elements'))
}

/**
 * How step 1 types the grid (Decision "Grid by line"): by the bay, or by the module (the bay their product). The grid
 * stays as it is, so nothing reopens and no copy is made again.
 */
export function setGridBy(p: Project, id: Id, by: 'bay' | 'module'): Project {
  const t = typeOf(p, id)
  if (!t || (t.grid.by ?? 'bay') === by) return p
  const { by: _, ...grid } = t.grid
  return withType(p, { ...t, grid: by === 'module' ? { ...grid, by } : grid })
}

/**
 * A block's join rule (its field in step 1, the grid's, since BE.6; Decision "Grid by line"): an end bay under `under`
 * m joins the whole bay next to it; null: two thirds of a bay again. Opens step 1 as `editStep` does; a joined bay keeps
 * its modules, so the docks and doors stay on theirs (Decision "Elements by module"). Not a figure ≥ 0: the same project.
 */
export function setHallJoin(p: Project, id: Id, under: number | null): Project {
  const t = typeOf(p, id)
  if (!t || (under !== null && !(Number.isFinite(under) && under >= 0))) return p
  if ((t.hall.joinUnder ?? null) === under) return p
  const opened = reopenStep(t, 'grid')
  const { joinUnder: _, ...hall } = opened.hall
  return changeType(p, { ...opened, hall: under === null ? hall : { ...hall, joinUnder: under } })
}

/**
 * Step 1's *Set end bays automatically* (BE.6, Decision "Grid by line"): the stored layout rewritten once, `hall.ends`
 * what `autoEnds` gives (at both ends), `endsWidth` and `shortEnds` gone (`joinUnder` stays: the designer's rule), and
 * the grid's own lines cleared, so the bays lie as the rules give them; the column lines are moved by hand after it.
 * Steps 1 and 2 opened as `editStep` opens them; the type drawn again on its new lines like any step 1 or 2 edit at
 * its size (`onNewBox`: its shape, its docks, doors and patterns, its copies' own shapes keep their place in m, each on
 * the module line or module nearest where it stood): a block with no end bay to
 * change, no own lines and `both` already: the same project.
 */
export function setEndsAutomatically(p: Project, typeId: Id): Project {
  const t = typeOf(p, typeId)
  if (!t) return p
  const { endsWidth: _w, shortEnds: _s, ...hall } = t.hall
  const { lines: _l, ...grid } = t.grid
  const laid = { ...t, grid, hall: { ...hall, ...autoEnds(t) } }
  if (JSON.stringify(laid) === JSON.stringify(t)) return p
  return redraw(p, t, { ...reopenStep(reopenStep(t, 'grid'), 'hall'), grid: laid.grid, hall: laid.hall })
}

/**
 * A block's grid with its own lines (Decision "Grid by line", GR.3): step 1 opened as `editStep` opens it, its copies
 * made again. A line by hand only chooses which module lines are column lines, so the elements stay on their modules.
 * The same grid: the same project.
 */
function withGrid(p: Project, t: WarehouseType, grid: WarehouseType['grid']): Project {
  if (JSON.stringify(grid) === JSON.stringify(t.grid)) return p
  return changeType(p, { ...reopenStep(t, 'grid'), grid })
}

/** The grid with the column lines `lines` (module lines) along `axis`, its own lines counted from the rules'. */
function gridWith(t: WarehouseType, axis: 'x' | 'y', lines: number[]): WarehouseType['grid'] {
  const own = ownLinesOf(regularRuns(t)[axis], lines)
  const { lines: was, ...grid } = t.grid
  const { [axis]: _, ...other } = was ?? {}
  const all = { ...other, ...(own && { [axis]: own }) }
  return Object.keys(all).length ? { ...grid, lines: all } : grid
}

/**
 * A grid line moved by hand (GR.3, the block editor): line `line` along `axis` (0, the first: A or 1) to the module
 * line nearest `to` (m from the first), between the lines either side of it (a module from each at least). The box's
 * first and last lines are its walls (step 2's): they stay. Not a line inside, or not moved: the same project.
 */
export function moveGridLine(p: Project, id: Id, axis: 'x' | 'y', line: number, to: number): Project {
  const t = typeOf(p, id)
  if (!t || !Number.isFinite(to)) return p
  const run = hallRuns(t)[axis]
  const idx = lineModules(run)
  if (!(line > 0 && line < idx.length - 1)) return p
  const k = Math.max(idx[line - 1] + 1, Math.min(idx[line + 1] - 1, nearestLine(run, to)))
  if (k === idx[line]) return p
  return withGrid(p, t, gridWith(t, axis, idx.map((x, i) => (i === line ? k : x))))
}

/** A grid line deleted by hand (GR.3): the bays either side of it one. The box's first and last lines stay. */
export function removeGridLine(p: Project, id: Id, axis: 'x' | 'y', line: number): Project {
  const t = typeOf(p, id)
  if (!t) return p
  const idx = lineModules(hallRuns(t)[axis])
  if (!(line > 0 && line < idx.length - 1)) return p
  return withGrid(p, t, gridWith(t, axis, idx.filter((_, i) => i !== line)))
}

/**
 * Some column lines moved together by hand (Decision "Multi-selection", BE.9): lines `lines` along `axis` by `by`
 * modules, all together; none past (or onto) a neighbour not moved, all or none; the box's first and last are its
 * walls and never move. Not moved: the same project. Opens step 1 as `moveGridLine` does.
 */
export function moveGridLines(p: Project, id: Id, axis: 'x' | 'y', lines: number[], by: number): Project {
  const t = typeOf(p, id)
  if (!t) return p
  const next = movedLines(lineModules(hallRuns(t)[axis]), lines, by)
  return next ? withGrid(p, t, gridWith(t, axis, next)) : p
}

/**
 * Some docks, doors and patterns slid along their walls by hand (Decision "Multi-selection", BE.9): each by `by`
 * modules of its edge, all or none: none when one would leave its edge's span or stand on a module holding one of its
 * kind (a pattern of its name) not slid with it (`canSlide`, the plan's preview's check too). Not moved: the same
 * project. Opens step 6 as `editStep` does.
 */
export function slideElements(p: Project, typeId: Id, ids: Id[], by: number): Project {
  return editTypeEdge(p, { kind: 'block-type', id: typeId }, { op: 'slide', ids, by }).project
}

/** What a block's plan picks (views/warehouseState.ts `Picked`), as far as deleting it goes. */
export interface PlanPick {
  kind: string
  id: Id
  axis?: 'x' | 'y'
  line?: number
}

/**
 * Everything picked on a block's plan deleted at once (Decision "Multi-selection", BE.9; Delete), one step: its docks,
 * doors and patterns (`element`), its truck courts (`court`, by edge: as `setEdgeCourt` with null), its holes, its
 * column lines (`line`, the box's first and last stay). Zones and edges are not deleted. Nothing gone: the same project.
 */
export function removePicked(p: Project, typeId: Id, picked: readonly PlanPick[]): Project {
  if (!typeOf(p, typeId)) return p
  const of = (kind: string) => picked.filter((x) => x.kind === kind)
  let q = p
  const elements = of('element').map((x) => x.id)
  if (elements.length) q = removeElements(q, typeId, elements)
  for (const c of of('court')) q = setEdgeCourt(q, typeId, c.id, null)
  for (const h of of('hole')) q = shapeWarehouse(q, typeId, { kind: 'unhole', id: h.id }).project
  for (const axis of ['x', 'y'] as const) {
    // the last first: the ones before keep their numbers
    const lines = [...new Set(of('line').filter((x) => x.axis === axis && x.line !== undefined).map((x) => x.line!))].sort((a, b) => b - a)
    for (const l of lines) q = removeGridLine(q, typeId, axis, l)
  }
  return q
}

/** Step 1's *Regular grid again* (GR.3): every line moved or deleted by hand back to the rules'. */
export function regularGrid(p: Project, id: Id): Project {
  const t = typeOf(p, id)
  if (!t?.grid.lines) return p
  const { lines: _, ...grid } = t.grid
  return withGrid(p, t, grid)
}

/** A step's figures typed in its fields (any step, at any time: `editStep`). */
export function updateWarehouseStep<S extends WarehouseStep>(p: Project, id: Id, step: S, patch: StepPatch[S]): Project {
  return editStep(p, id, step, patch)
}

/** A hand edit on the type's plan (Decision "Warehouse by hand"): as its fields (`editStep`). */
export function editWarehouseStep<S extends WarehouseStep>(p: Project, id: Id, step: S, patch: StepPatch[S]): Project {
  return editStep(p, id, step, patch)
}

/** A step's figures from the Brief (Decision "Program rule set": the same figures edited either side): `editStep`. */
export function setWarehouseFigures<S extends WarehouseStep>(p: Project, id: Id, step: S, patch: StepPatch[S]): Project {
  return editStep(p, id, step, patch)
}

/**
 * A type's shape edited by hand (step 5, Decision "Block shape"), in any state (opened as `editStep` opens it); its box fitted round it (step 2's figures follow the shape, step 2 stays as it is), its
 * elements following their edges. What does not make an outline (a wall through another, a hole outside it): the same
 * project. `shift`: where the box's column line A / 1 went in the type's frame (m), when the box grew or shrank at its
 * low walls; the type's dimensions are moved by it, so they stay on what they measure.
 */
export function shapeWarehouse(p: Project, id: Id, edit: ShapeEdit): { project: Project; shift: Point; moved?: number } {
  const none = { project: p, shift: { x: 0, y: 0 } }
  const t = typeOf(p, id)
  if (!t) return none
  const g = generate(t)
  const made = editOutline(t, g, edit, (hall) => hallRuns({ grid: t.grid, hall: { ...t.hall, ...hall } }))
  if (!made) return none
  const r = typeEdited(p, t, g, made)
  return r && r.project !== p ? { project: r.project, shift: made.fit.shift, ...(made.moved !== undefined && { moved: made.moved }) } : none
}

/**
 * A type with an outline edit made (`editOutline`: a hand edit on its module lines; `runOutlineOp`: the shape engine's, at any angle):
 * its box fitted round the shape, its elements and truck courts following their edges (those on a wall that turned angled left out, and
 * said), its dimensions moved with its column line A / 1, its copies made again (a copy with an outline of its own keeps its box). The
 * same project when nothing of the block changed; null when the type would not be one.
 */
function typeEdited(p: Project, t: WarehouseType, g: Generated, made: OutlineEdit): { project: Project; notes: string[] } | null {
  if (made.unchanged) return { project: p, notes: made.notes ?? [] }
  const { renamed, split, fit, pieces } = made
  const { endsWidth: _, shortEnds: __, ...hall } = t.hall
  const next: WarehouseType = { ...reopenStep(t, 'morphology'), hall: { ...hall, ...fit.hall }, morphology: fit.morphology }
  const after = generate(next)
  const was = elementsOn(t, g.runs, g.edges)
  const elements = followEdges(was, renamed, split, g, after, fit.shift, pieces)
  // its courts by edge follow their edges as the elements do (BE.2)
  const followed = t.courts ? courtsFollowed(t.courts, renamed, after.edges, { before: g.edges, after: after.edges, shift: fit.shift, split, pieces, walls: after.walls }) : undefined
  const courts = followed?.courts
  // its dimensions (BE.10) stay with what they measure: line A / 1 moved by `shift`, the frame with it
  const s = fit.shift
  const back = (q: Point) => ({ x: q.x - s.x, y: q.y - s.y })
  const dimensions = t.dimensions && (s.x !== 0 || s.y !== 0) ? { dimensions: t.dimensions.map((d) => ({ ...d, a: back(d.a), b: back(d.b) })) } : {}
  const done: WarehouseType = { ...next, elements, ...(courts ? { courts } : {}), ...dimensions }
  const notes = [...(made.notes ?? []), ...leftOutNotes(leftOnAngled(was, elements, after.edges, renamed, pieces), courts && t.courts ? courtsOnAngled(t.courts, courts, after.edges, renamed, followed?.carried) : []), ...(followed?.notes ?? [])]
  if (!WarehouseTypeSchema.safeParse(done).success) return null
  if (sameBlock(done, t)) return { project: p, notes }
  // a copy with its own shape keeps it: its box as it was (the type's fitted round its new shape is not its own)
  // and a copy that follows the type's outline has its own courts follow it too (a site edit writes them in the frame of the type's edge)
  const via: CourtsVia = { before: g.edges, after: after.edges, shift: fit.shift, split, pieces, walls: after.walls }
  let dropped = 0
  const q = changeType(
    withCopies(p, t, (o) => {
      const kept = keptBox(t, done, o)
      if (!kept?.courts || (kept.morphology?.outline && drawn(kept.morphology.outline))) return kept
      const own = courtsFollowed(kept.courts, renamed, after.edges, via)
      dropped += own.lost
      return own.courts === kept.courts ? kept : { ...kept, courts: own.courts }
    }),
    done,
  )
  if (dropped) notes.push(`${dropped} truck court${dropped === 1 ? '' : 's'} of placed copies left out: no wall left in front of ${dropped === 1 ? 'it' : 'them'}`)
  return { project: q, notes }
}

/** Whether two types make the same block (their box, shape, elements, courts and dimensions: what an outline edit changes). */
const sameBlock = (a: WarehouseType, b: WarehouseType): boolean => JSON.stringify([a.hall, a.morphology, a.elements, a.courts, a.dimensions]) === JSON.stringify([b.hall, b.morphology, b.elements, b.courts, b.dimensions])

export function lockWarehouseStep(p: Project, id: Id, step: WarehouseStep): Project {
  const t = typeOf(p, id)
  if (!t) return p
  const next = lockStep(t, step)
  return next === t ? p : withType(p, next)
}

export function reopenWarehouseStep(p: Project, id: Id, step: WarehouseStep): Project {
  const t = typeOf(p, id)
  if (!t) return p
  const next = reopenStep(t, step)
  return next === t ? p : withType(p, next)
}

// ---- Copies ------------------------------------------------------------------------------------------------------

/**
 * A copy of a type on the site: a building of its own (named after the type) in that option, its hall's middle at
 * `at`, its length turned `angle` degrees; its masses made. Null without the type.
 */
export function placeWarehouse(p: Project, typeId: Id, at: Point, angle: number, optionId: Id): { project: Project; id: Id } | null {
  const t = typeOf(p, typeId)
  if (!t || ![at.x, at.y, angle].every(Number.isFinite)) return null
  const runs = hallRuns(t)
  const middle = onPlace({ x: 0, y: 0, angle }, { x: runs.x.length / 2, y: runs.y.length / 2 })
  return placeWarehouseAt(p, typeId, { x: at.x - middle.x, y: at.y - middle.y, angle }, optionId)
}

/**
 * A copy of a type at a place (where its column line A / 1 stands and its length's angle), with what it changes of its
 * type (a block placed by Place or a drag from Blocks: Decision "Draw makes a block"); null without the type.
 */
export function placeWarehouseAt(p: Project, typeId: Id, place: Place, optionId: Id, overrides?: WarehouseOverrides): { project: Project; id: Id } | null {
  const t = typeOf(p, typeId)
  if (!t || ![place.x, place.y, place.angle].every(Number.isFinite)) return null
  const taken = p.buildings.map((b) => b.name)
  let n = 1
  while (taken.includes(`${t.name} ${n}`)) n++
  const added = addBuilding(p, { name: `${t.name} ${n}`, optionId })
  const warehouse = { type: typeId, place, ...(overrides && Object.keys(overrides).length > 0 && { overrides }) }
  const q: Project = { ...added.project, buildings: added.project.buildings.map((b) => (b.id === added.id ? { ...b, warehouse } : b)) }
  return { project: remake(q, added.id, true), id: added.id }
}

/**
 * Copies of masses moved by d (copy, paste, duplicate, Alt+drag: Decision "Smart blocks"), a block's masses as a copy
 * of their block: a new copy of its type in `optionId`, its place moved by d, its variant kept (a part copied alone
 * brings its whole block: a part is nothing without its hall). The other masses as copyMasses makes them, on `levelId`
 * (absent: each on its own). The ids: the masses made, the blocks' first; `blocks`: each block copied, its building
 * and its copy's (a block that could not be placed is not there).
 */
export function copyWithBlocks(
  p: Project,
  sources: Mass[],
  d: Point,
  optionId: Id,
  levelId?: Id,
): { project: Project; ids: Id[]; blocks: { from: Id; to: Id }[] } {
  const placed = withPlaces(p)
  const blocks: Building[] = []
  const loose: Mass[] = []
  for (const m of sources) {
    const b = m.part === undefined ? undefined : placed.buildings.find((x) => x.warehouse && typeOf(p, x.warehouse.type) && levelsOf(x).has(m.levelId))
    if (!b) loose.push(m)
    else if (!blocks.includes(b)) blocks.push(b)
  }
  if (blocks.length === 0) return { ...copyMasses(p, sources, d, levelId), blocks: [] }
  let q = p
  const ids: Id[] = []
  const pairs: { from: Id; to: Id }[] = []
  for (const b of blocks) {
    const w = b.warehouse!
    const r = placeWarehouseAt(q, w.type, { ...w.place, x: w.place.x + d.x, y: w.place.y + d.y }, optionId, w.overrides)
    if (!r) continue
    q = r.project
    pairs.push({ from: b.id, to: r.id })
    const levels = levelsOf(q.buildings.find((x) => x.id === r.id)!)
    ids.push(...q.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id))
  }
  const c = copyMasses(q, loose, d, levelId)
  return { project: c.project, ids: [...ids, ...c.ids], blocks: pairs }
}

/**
 * A wall of a copy's box moved out by d m (in: negative; Decisions "Smart blocks", "Block shape"): its length or width
 * in whole modules of the block's grid, a module at least and past the block's range if it goes there (Decision "Past
 * the range by hand": an Issue says so, engine/range.ts; the optimizer keeps to it); the low wall moves the copy's place with it, so the other wall stays; the shape's corners keep their distance
 * from the nearer wall. Grid, columns and envelope stay the block's. What it moved (m, along d's way); the same project
 * when nothing changed.
 */
export function stretchWarehouseHall(p: Project, buildingId: Id, side: HallSide, d: number, exact = false): { project: Project; applied: number } {
  const b = p.buildings.find((x) => x.id === buildingId)
  const t = b?.warehouse && typeOf(p, b.warehouse.type)
  if (!b?.warehouse || !t || !Number.isFinite(d)) return { project: p, applied: 0 }
  const placed = withPlaces(p, t.id)
  const w = placed.buildings.find((x) => x.id === buildingId)!.warehouse!
  const key = side.axis
  const now = typeWith(t, w.overrides).hall[key]
  const base = t.hall[key]
  const { module } = hallLimits(t, key)
  const on = (v: number) => Math.round(v * 1000) / 1000
  // whole modules counted from the block's size, the shortest of them a module at least; no top (RB.1)
  const least = base - Math.floor((base - module) / module + 1e-6) * module
  // `exact` (the free outline, Phase D.2): the metres asked, a module at least
  const next = exact ? on(Math.max(module, now + d)) : on(Math.max(least, now + Math.round(d / module) * module))
  if (Math.abs(next - now) < 1e-6) return { project: p, applied: 0 }
  // the low wall out: the column line A / 1 goes back by what it grew
  const back = side.end === 0 ? now - next : 0
  const place = back === 0 ? w.place : { ...onPlace(w.place, key === 'length' ? { x: back, y: 0 } : { x: 0, y: back }), angle: w.place.angle }
  const { [key]: _, ...others } = w.overrides?.hall ?? {}
  const hall = Math.abs(next - base) < 1e-6 ? others : { ...others, [key]: next }
  const { hall: __, ...rest } = ownBundle(t, w.overrides) ?? {}
  // the shape's corners keep their distance from the nearer wall (Decision "Block shape", engine/shape.ts)
  const stretched: WarehouseOverrides = Object.keys(hall).length ? { ...rest, hall } : rest
  // its own shape, if it has one, drawn again on its box as it is now (one frame: Decision "Elements by module")
  const overrides = rebasedCopy(t, ownBundle(t, w.overrides), t, stretched) ?? stretched
  const { overrides: ___, ...plain } = w
  const warehouse = Object.keys(overrides).length ? { ...plain, place, overrides } : { ...plain, place }
  const q = { ...placed, buildings: placed.buildings.map((x) => (x.id === buildingId ? { ...x, warehouse } : x)) }
  return { project: remake(q, buildingId), applied: next - now }
}

// ---- Draw makes a block (Phase D.2 task 7; Decision "Draw makes a block") -----------------------------------------------------

/** The height a level gives a block (m): its own, else the first building's typical level. */
const heightOfLevel = (p: Project, levelId: Id | undefined): number => allLevels(p).find((l) => l.id === levelId)?.height ?? p.buildings[0].levelHeight

/**
 * The block type a program draws with (Decision "Program rule set": one type per program): its own, else a new one made from the
 * typology's defaults and named after the program: the project's grid's bays and modules (else 12 × 12 m in 4), a wall of 0.3 m, columns of
 * 0.5 m on every line, the program's range, and `height` (absent: the level's); no elements, the stroke is its own. The program's kind is
 * not changed (an office stays an office). No program (or one not in the brief): the shared *Block* type. `fresh`: the type was just made.
 */
export function blockTypeFor(p: Project, programId: Id | null, init: { height?: number; levelId?: Id } = {}): { project: Project; id: Id; fresh: boolean } {
  const program = programId === null ? undefined : p.programs.find((g) => g.id === programId)
  const have = program ? definitionOf(p, program.id) : p.warehouseTypes?.find((t) => t.program === null)
  if (have) return { project: p, id: have.id, fresh: false }
  const height = init.height ?? heightOfLevel(p, init.levelId)
  const names = (p.warehouseTypes ?? []).map((t) => t.name)
  let q: Project
  let id: Id
  if (program) {
    const made = addWarehouseType(p, { program: program.id, name: freeName(names, program.name), keepKind: true })
    q = made.project
    id = made.id
  } else {
    id = newId('wt', (p.warehouseTypes ?? []).map((t) => t.id))
    const grid = p.grid ? { x: p.grid.x, y: p.grid.y, modules: p.grid.modules } : undefined
    q = { ...p, warehouseTypes: [...(p.warehouseTypes ?? []), newWarehouseType(id, freeName(names, 'Block'), { grid, program: null, height })] }
  }
  const warehouseTypes = q.warehouseTypes!.map((t) => (t.id === id ? { ...t, elements: [], envelope: { ...t.envelope, height } } : t))
  return { project: { ...q, warehouseTypes }, id, fresh: true }
}

/** What a block is drawn from: a footprint (its outer face) with its holes, of a program (its type) or of a type. */
export interface BlockDrawn {
  /** The type it is a block of; absent: its program's. */
  type?: Id
  /** Absent or null: no program (the shared *Block* type). */
  programId?: Id | null
  footprint: Footprint
  /** The cuts in it (courts), each a face as the footprint is, with its corridor. */
  holes?: Hole[]
  /** The level the stroke was drawn on: its height is the new type's, and an empty building it belongs to is taken over. */
  levelId?: Id
  /** The option the block's building joins. */
  optionId: Id
  /** Its building's name; absent: the type's, numbered. */
  name?: string
  /** Absent: the type's. */
  height?: number
}

/** A building with nothing in it, a design one: what a block takes over instead of leaving empty beside itself (a new project's *Building 1*). */
function emptyBuildingOf(p: Project, levelId: Id | undefined): Building | undefined {
  const b = levelId === undefined ? undefined : buildingOfLevel(p, levelId)
  if (!b || b.warehouse || b.context || b.locked) return undefined
  const levels = levelsOf(b)
  return p.masses.some((m) => levels.has(m.levelId)) ? undefined : b
}

/**
 * A block drawn: the footprint is its OUTER FACE (the area a mass had), its outline the face moved in by the wall (`engine/blocks.ts`), its
 * grid turned to a rectangle's rotation or its longest straight wall. Of the type of its program (`blockTypeFor`): the first block of a type
 * made now is the type itself (its outline the stroke, no overrides), any later one a variant (its own outline and holes, no elements,
 * its type as it was). A block is one building: a new one in the option, an empty one the stroke was drawn on taken over. Returns the
 * project, the hall's mass id, its building and type, and how many holes did not stand inside; null when its walls do not fit the face.
 */
export function drawBlock(p: Project, init: BlockDrawn): { project: Project; id: Id; building: Id; type: Id; fresh: boolean; dropped: number } | null {
  const given = init.type === undefined ? undefined : typeOf(p, init.type)
  if (init.type !== undefined && !given) return null
  const typed = given ? { project: p, id: given.id, fresh: false } : blockTypeFor(p, init.programId ?? null, { height: init.height, levelId: init.levelId })
  let q = typed.project
  const t = typeOf(q, typed.id)!
  const o = outlineOfStroke(footprintContour(init.footprint), init.holes ?? [], t.envelope.thickness, blockFrame(init.footprint))
  if (!o) return null
  let warehouse: WarehouseCopy
  if (typed.fresh) {
    const next: WarehouseType = { ...t, hall: { ...t.hall, length: o.length, width: o.width }, morphology: { outline: o.box ? [] : o.outline, ...(o.arcs ? { arcs: o.arcs } : {}), holes: o.holes } }
    if (!WarehouseTypeSchema.safeParse(next).success) return null
    q = withType(q, next)
    warehouse = { type: t.id, place: o.place }
  } else {
    const hall: WarehouseOverrides['hall'] = {}
    if (Math.abs(o.length - t.hall.length) > 1e-6) hall.length = o.length
    if (Math.abs(o.width - t.hall.width) > 1e-6) hall.width = o.width
    const overrides: WarehouseOverrides = {
      ...(Object.keys(hall).length ? { hall } : {}),
      morphology: { outline: o.outline, ...(o.arcs ? { arcs: o.arcs } : t.morphology.arcs ? { arcs: {} } : {}), holes: o.holes, ...(t.morphology.zones?.length ? { zones: [] } : {}) },
      elements: [],
      courts: [],
      ...(init.height !== undefined && Math.abs(init.height - t.envelope.height) > 1e-6 ? { envelope: { height: init.height } } : {}),
    }
    warehouse = { type: t.id, place: o.place, overrides }
  }
  const taken = new Set(q.buildings.map((b) => b.name))
  let n = 1
  while (taken.has(`${t.name} ${n}`)) n++
  const name = init.name?.trim() || `${t.name} ${n}`
  const empty = emptyBuildingOf(q, init.levelId)
  let building: Id
  if (empty) {
    building = empty.id
    q = addBuildingToOption({ ...q, buildings: q.buildings.map((b) => (b.id === empty.id ? { ...b, name, warehouse } : b)) }, init.optionId, empty.id)
  } else {
    const added = addBuilding(q, { name, optionId: init.optionId })
    building = added.id
    q = { ...added.project, buildings: added.project.buildings.map((b) => (b.id === added.id ? { ...b, warehouse } : b)) }
  }
  q = remake(q, building, true)
  const levels = levelsOf(q.buildings.find((b) => b.id === building)!)
  const hall = q.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')
  return hall ? { project: q, id: hall.id, building, type: t.id, fresh: typed.fresh, dropped: o.dropped } : null
}

/** What the Union says of blocks that are not of one type, and of blocks that do not make one piece. */
const DIFFERENT_TYPES = 'Blocks of different types do not join: give them one type first'

/**
 * The Union of blocks (Decision "Draw makes a block"): blocks of one type join into the first's own outline (a variant of its type, its
 * walls, docks and courts kept where its outline still runs along them), its holes the union's (a court they close all round is one); the
 * others go with their buildings. Null when none of the masses is a block (the plain union is `mergeMasses`'s); `reason` when they
 * cannot join: another type, a mass that is not a block's hall, or no one piece.
 */
export function mergeBlocks(p: Project, ids: Id[]): { project: Project; id: Id } | { reason: string } | null {
  const picked = [...new Set(ids)].flatMap((id) => p.masses.filter((m) => m.id === id))
  if (!picked.some((m) => m.part !== undefined)) return null
  const blocks = picked.map((m) => blockOf(p, m.id))
  const all = blocks.filter((x): x is NonNullable<typeof x> => x !== null)
  if (all.length !== blocks.length) return { reason: 'Blocks join only with blocks' }
  if (all.length < 2) return null
  if (all.some((x) => x.t.id !== all[0].t.id)) return { reason: DIFFERENT_TYPES }
  const merged = mergeShapes(
    all.map((x) => {
      const outline = footprintPolygon(x.m.footprint)
      return [outline, ...holesIn(x.m.holes, outline).holes]
    }),
  )
  const footprint = merged && polygonFootprint(merged.outline)
  if (!merged || !footprint || footprint === 'crossing') return { reason: 'They do not all touch: join blocks that share a wall or overlap' }
  const [first, ...rest] = all
  const id = first.m.id
  const outline = setBlockOutline(p, id, footprintPolygon(footprint))
  if (!outline || (outline.reason && outline.project === p)) return { reason: outline?.reason ?? 'The outline cannot be that' }
  let q = outline.project
  // its holes the union's: the old ones out, each of the union's in as the wall's reference line, a wall out from the cut
  const thickness = typeWith(first.t, first.w.overrides).envelope.thickness
  for (let k = (blockOf(q, id)?.g.holes.length ?? 0) - 1; k >= 0; k--) q = editBlockHoles(q, id, { kind: 'remove', k })?.project ?? q
  for (const h of merged.holes) {
    const c = contourFromPolygon(h)
    const grown = offsetEdges(
      c,
      c.vertices.map(() => thickness),
    )
    q = editBlockHoles(q, id, { kind: 'add', contour: grown ?? c })?.project ?? q
  }
  for (const x of rest) q = removeBuilding(q, x.b.id, true)
  return { project: q, id }
}

// ---- A placed block's walls (Decision "Block shape") -------------------------------------------------------------

/** Whether two outlines in metres are one (the same ids and walls, corners within a micrometre). */
function sameOutline(a: OutlineCorner[], b: OutlineCorner[]): boolean {
  return a.length === b.length && a.every((c, i) => c.id === b[i].id && Math.abs(c.x - b[i].x) < 1e-6 && Math.abs(c.y - b[i].y) < 1e-6 && JSON.stringify({ ...c, x: 0, y: 0 }) === JSON.stringify({ ...b[i], x: 0, y: 0 }))
}

/** A copy with its overrides set (none: no `overrides`), its masses made again. */
function withOverrides(p: Project, buildingId: Id, w: WarehouseCopy, overrides: WarehouseOverrides): Project {
  const { overrides: _, ...plain } = w
  const warehouse = Object.keys(overrides).length ? { ...plain, overrides } : plain
  return remake({ ...p, buildings: p.buildings.map((x) => (x.id === buildingId ? { ...x, warehouse } : x)) }, buildingId)
}

/**
 * The copy a mass is the hall of, with its type and what it makes; null for any other mass. `w`: the copy where its
 * hall stands now (`copyOnPlan`: moved, turned or solved since it was made), so its walls are found on the plan.
 */
function blockOf(p: Project, massId: Id) {
  const m = p.masses.find((x) => x.id === massId)
  if (!m || m.part !== 'hall') return null
  const b = p.buildings.find((x) => x.warehouse && typeOf(p, x.warehouse.type) && levelsOf(x).has(m.levelId))
  if (!b?.warehouse) return null
  const t = typeOf(p, b.warehouse.type)!
  const w = copyOnPlan(t, b.warehouse, m.footprint)
  return { m, b, t, w, g: copyGenerated(t, w) }
}

/** The way a box's wall facing `side` stretches it: along its length or width, at its low or high end. */
const boxSide = (side: Facing): HallSide => ({ axis: side === 'front' || side === 'back' ? 'width' : 'length', end: side === 'front' || side === 'left' ? 0 : 1 })

/** The edge of its outline wall i of a block's mass stands on (its outer face's), in the type's frame. */
function edgeOfWall(g: Generated, place: Place, footprint: Mass['footprint'], i: number) {
  const v = footprintPolygon(footprint)
  if (!v[i]) return null
  const n = v[(i + 1) % v.length]
  const [c, s] = cosSin(place.angle)
  const back = (q: Point) => {
    const d = { x: q.x - place.x, y: q.y - place.y }
    return { x: d.x * c + d.y * s, y: -d.x * s + d.y * c }
  }
  const mid = back({ x: (v[i].x + n.x) / 2, y: (v[i].y + n.y) / 2 })
  let best: { id: Id; d: number } | null = null
  for (const w of g.walls) {
    if (!w.edge) continue
    const d = distancePointSegment(mid, w.a, w.b)
    if (!best || d < best.d) best = { id: w.edge, d }
  }
  return best && best.d < 0.05 ? (g.edges.find((e) => e.id === best.id) ?? null) : null
}

/**
 * The walls of a smart block's mass, each the box's (it moves the box, past the range by hand too) or an inner one (without a
 * limit, the variant's own): every wall of its hall. Null for any other mass.
 */
export function blockWalls(p: Project, massId: Id): ('box' | 'inner')[] | null {
  const x = blockOf(p, massId)
  if (!x) return null
  return footprintPolygon(x.m.footprint).map((_, i) => (edgeOfWall(x.g, x.w.place, x.m.footprint, i)?.outer === false ? 'inner' : 'box'))
}

/**
 * What wall i of a smart block's mass is: the box's (its axis, and the length or width it may take: Decision "Smart
 * blocks") or an inner one; the axis it moves along (the block's length or width) and the module it moves by. Null for
 * any other mass or wall.
 */
export function blockWall(p: Project, massId: Id, i: number): { kind: 'box' | 'inner'; edge: Id; axis: 'length' | 'width'; module: number; range: { lo: number; hi: number; now: number } | null } | null {
  const x = blockOf(p, massId)
  const e = x && edgeOfWall(x.g, x.w.place, x.m.footprint, i)
  if (!x || !e) return null
  const key = e.horizontal ? 'width' : 'length'
  const limits = hallLimits(x.t, key)
  return { kind: e.outer ? 'box' : 'inner', edge: e.id, axis: key, module: limits.module, range: e.outer ? { lo: limits.lo, hi: limits.hi, now: typeWith(x.t, x.w.overrides).hall[key] } : null }
}

/**
 * An inner wall of a copy (one off its box's lines) moved `by` modules out (in: negative; Decision "Block shape"):
 * the variant's own outline, without a limit but its box (it never moves the box) and its shape (no wall through
 * another: as far as it goes). Its elements follow their edges. What it moved (modules); the same project when nothing.
 */
export function moveBlockEdge(p: Project, buildingId: Id, edge: Id, by: number): { project: Project; applied: number } {
  const b = p.buildings.find((x) => x.id === buildingId)
  const t = b?.warehouse && typeOf(p, b.warehouse.type)
  const k = Math.round(by)
  if (!b?.warehouse || !t || !Number.isFinite(by) || k === 0) return { project: p, applied: 0 }
  const placed = withPlaces(p, t.id)
  const w = placed.buildings.find((x) => x.id === buildingId)!.warehouse!
  const made = typeWith(t, w.overrides)
  const g = generate(made)
  const r = moveInnerEdge(g, edge, by)
  if (!r) return { project: p, applied: 0 }
  const { outline, renamed, holes, moved: j } = r
  const own = { ...w.overrides?.morphology }
  const { morphology: _, elements: __, courts: ___, ...rest } = w.overrides ?? {}
  const next: WarehouseOverrides = { ...rest }
  if (sameOutline(outlineOn(t, g.runs), outline) && !renamed.size && !w.overrides?.elements) {
    // back to its type's shape: nothing of its own
    delete own.outline
    if (holes.length !== g.holes.length) own.holes = holes
  } else {
    // its own shape, one bundle (Decision "Elements by module"): its outline, holes, zones and elements, all on its
    // box now, its elements where they stand
    const after = generate({ ...made, morphology: { ...made.morphology, outline } })
    next.elements = followEdges(elementsOn(made, g.runs, g.edges), renamed, null, g, after)
    next.courts = followCourts(made.courts ?? [], renamed, after.edges, { before: g.edges, after: after.edges, walls: after.walls })
    own.outline = outline
    own.holes = holes
    if (made.morphology.zones?.length) own.zones = zonesOn(made, g.runs)
  }
  if (Object.keys(own).length) next.morphology = own
  return { project: withOverrides(placed, buildingId, w, next), applied: j }
}

/**
 * Wall i of a smart block's mass moved out by d m (Decision "Block shape"): the box's stretches the copy's box
 * (`stretchWarehouseHall`, within the range), an inner one moves alone by whole modules (`moveBlockEdge`). Null for any
 * other mass (its wall moves as any mass's: `moveWall`). What it moved (m).
 */
export function stretchBlockWall(p: Project, massId: Id, i: number, d: number): { project: Project; applied: number } | null {
  const x = blockOf(p, massId)
  const e = x && edgeOfWall(x.g, x.w.place, x.m.footprint, i)
  if (!x || !e) return null
  if (e.outer) return stretchWarehouseHall(p, x.b.id, boxSide(e.side), d)
  const module = (e.horizontal ? x.t.grid.y : x.t.grid.x) / x.t.grid.modules
  const r = moveBlockEdge(p, x.b.id, e.id, d / module)
  return { project: r.project, applied: r.applied * module }
}

/**
 * A copy's own outline edited by hand as its type's is (`shapeWarehouse`, Phase D.1; one core, `editOutline`): a bump pulled out or
 * pushed in, a corner removed, an inner edge moved, a hole, an edge's own wall. The copy becomes a variant, its own outline, holes,
 * zones, elements and courts in one bundle (Decision "Elements by module"), its type unchanged; an outline back on its type's own, on
 * its type's box, is no variant. Where its box grows or shrinks at a low wall its `place` moves with it (turned by its angle, as
 * `stretchWarehouseHall` moves it), so nothing else of it moves on the site. `shift`: where the box's column line A / 1 went in its
 * frame (m), as `shapeWarehouse` says it; `moved`: the modules an inner edge moved. Nothing made, no such edge: the same project.
 */
export function shapeCopy(p: Project, buildingId: Id, edit: ShapeEdit): { project: Project; shift: Point; moved?: number } {
  const none = { project: p, shift: { x: 0, y: 0 } }
  let moved: number | undefined
  const r = copyEdited(p, buildingId, (made, g) => {
    const e = editOutline(made, g, edit, (hall) => hallRuns({ grid: made.grid, hall: { ...made.hall, ...hall } }))
    moved = e?.moved
    return e
  })
  return r && r.project !== p ? { project: r.project, shift: r.edit.fit.shift, ...(moved !== undefined && { moved }) } : none
}

/**
 * A copy with an outline edit made (`make` reads the copy as its own type and gives the edit): the copy a variant, its own shape one
 * bundle, its box what differs from its type's, its place moved where its box grew at a low wall. Null: no such copy, no edit, or a
 * block that would not be one; the same project in `project` when nothing of the copy changed.
 */
function copyEdited(
  p: Project,
  buildingId: Id,
  make: (made: WarehouseType, g: Generated) => OutlineEdit | null,
): { project: Project; edit: OutlineEdit; notes: string[] } | null {
  const b = p.buildings.find((x) => x.id === buildingId)
  const t = b?.warehouse && typeOf(p, b.warehouse.type)
  if (!b?.warehouse || !t) return null
  const placed = withPlaces(p, t.id)
  const w = placed.buildings.find((x) => x.id === buildingId)!.warehouse!
  const made = typeWith(t, w.overrides)
  const g = generate(made)
  const r = make(made, g)
  if (!r) return null
  if (r.unchanged) return { project: p, edit: r, notes: r.notes ?? [] }
  const { fit, renamed, split, pieces } = r
  const { endsWidth: _, shortEnds: __, ...hall } = made.hall
  const done: WarehouseType = { ...made, hall: { ...hall, ...fit.hall }, morphology: fit.morphology }
  if (!WarehouseTypeSchema.safeParse(done).success) return null
  const after = generate(done)
  // its box: what differs from its type's is its own (a figure absent says what it meant: the width's end bays the length's, no short end)
  const box: Record<string, unknown> = { ...w.overrides?.hall }
  for (const k of ['length', 'width', 'ends', 'endsWidth', 'shortEnds'] as const) {
    if (JSON.stringify(done.hall[k]) === JSON.stringify(t.hall[k])) delete box[k]
    else box[k] = done.hall[k] ?? (k === 'endsWidth' ? done.hall.ends : k === 'shortEnds' ? {} : undefined)
  }
  const { hall: _h, morphology: _m, elements: _e, courts: _c, ...rest } = w.overrides ?? {}
  const next: WarehouseOverrides = { ...rest }
  if (Object.keys(box).length) next.hall = box as WarehouseOverrides['hall']
  // back on its type's own shape, on its type's box, with what the type gives it (its outline, holes, zones, elements as they follow
  // their edges, courts): no variant, a later edit of the type reaches it; else its own bundle. Its own courts (the Court tool's) stay
  // either way, unless they are its type's.
  const typed = shapeOf(t, hallRuns(t))
  const sameShape = JSON.stringify([typed.outline, typed.arcs, typed.holes, typed.zones]) === JSON.stringify([fit.morphology.outline, fit.morphology.arcs, fit.morphology.holes, fit.morphology.zones ?? typed.zones])
  const ownBox = ['length', 'width', 'ends', 'endsWidth', 'shortEnds'].some((k) => k in box)
  const was = elementsOn(made, g.runs, g.edges)
  const elements = followEdges(was, renamed, split, g, after, fit.shift, pieces)
  const followed = courtsFollowed(made.courts ?? [], renamed, after.edges, { before: g.edges, after: after.edges, shift: fit.shift, split, pieces, walls: after.walls })
  const courts = followed.courts
  const sameElements = JSON.stringify(elements) === JSON.stringify(elementsOn(t, hallRuns(t), typed.edges))
  if (!sameShape || !sameElements || ownBox) {
    // its arcs and zones always written: the type's are not this shape's (they would show through the merge)
    next.morphology = { ...fit.morphology, arcs: fit.morphology.arcs ?? {}, zones: fit.morphology.zones ?? [] }
    next.elements = elements
    next.courts = courts
  } else if (JSON.stringify(courts) !== JSON.stringify(t.courts ?? [])) next.courts = courts
  const s = fit.shift
  const place = s.x === 0 && s.y === 0 ? w.place : { ...onPlace(w.place, s), angle: w.place.angle }
  const { overrides: _o, ...plain } = w
  const warehouse = { ...plain, place, ...(Object.keys(next).length ? { overrides: next } : {}) }
  const notes = [...(r.notes ?? []), ...leftOutNotes(leftOnAngled(was, elements, after.edges, renamed, pieces), courtsOnAngled(made.courts ?? [], courts, after.edges, renamed)), ...followed.notes]
  if (JSON.stringify(warehouse) === JSON.stringify(w)) return { project: p, edit: r, notes }
  const q = remake({ ...placed, buildings: placed.buildings.map((x) => (x.id === buildingId ? { ...x, warehouse } : x)) }, buildingId)
  return { project: q, edit: r, notes }
}

// ---- A block through the shape engine (Phase D.1; free since D.2, Decision "Block shape") -------------------------------

const mm3 = (v: number) => Math.round(v * 1000) / 1000
const modWall = (i: number, n: number) => ((i % n) + n) % n

/** An edge's span along its run's axis (m, in the type's frame). */
function spanAlong(e: ShapeEdge): [number, number] {
  const a = e.horizontal ? e.a.x : e.a.y
  const b = e.horizontal ? e.b.x : e.b.y
  return [Math.min(a, b), Math.max(a, b)]
}

/**
 * The walls of an outline as the engine's handles need them: `poly` the outline's face in the type's frame (wall i from corner i to
 * the next), `edgeOf(i)` the outline edge that wall stands on, `t` its type (the range a box wall may take) and `made` the block as
 * it is (its box now). A wall along the grid says its axis, its module and its module and bay lines (m along the wall from its
 * start, as far as the wall spans); an angled one has none of them (nothing stands on it, nothing is counted on it).
 */
function wallsOf(t: WarehouseType, made: WarehouseType, g: Pick<Generated, 'runs'>, poly: Point[], edgeOf: (i: number) => ShapeEdge | null): ShapeWall[] {
  return poly.map((a, i): ShapeWall => {
    const e = edgeOf(i)
    if (!e) return {}
    if (e.axis === null) return { id: e.id, tone: 'inner' }
    const key = e.horizontal ? 'width' : 'length'
    const along = e.horizontal ? g.runs.x : g.runs.y
    const across = e.horizontal ? g.runs.y : g.runs.x
    const b = poly[(i + 1) % poly.length]
    const s = e.horizontal ? a.x : a.y
    const dir = (e.horizontal ? b.x - a.x : b.y - a.y) < 0 ? -1 : 1
    const [lo, hi] = spanAlong(e)
    const inside = (v: number) => v >= lo - 0.005 && v <= hi + 0.005
    const from = (v: number) => mm3((v - s) * dir)
    const limits = hallLimits(t, key)
    // the module lines across it, from its reference line, out positive: where a push of it lands on the grid
    const out = outwardOf(e.side)
    const at = e.horizontal ? e.a.y : e.a.x
    const way = e.horizontal ? out.y : out.x
    return {
      id: e.id,
      tone: e.outer ? 'box' : 'inner',
      axis: key,
      module: across.module,
      across: across.modules.map((v) => mm3((v - at) * way)).sort((x, y) => x - y),
      face: mm3(faceOf(e)),
      ...(e.outer && { range: { lo: limits.lo, hi: limits.hi, now: made.hall[key] } }),
      stops: along.modules.filter(inside).map(from).sort((x, y) => x - y),
      bays: along.lines.filter(inside).map(from).sort((x, y) => x - y),
    }
  })
}

/** How many modules past the box the module lines go on, for a corner pulled out of it. */
const GUIDES_BEYOND = 40

/** The lines of a run: where its module lines are, and the same module again past its first and its last. */
function runLines(modules: number[], module: number): number[] {
  if (modules.length === 0 || !(module > 0)) return modules
  const [lo, hi] = [Math.min(...modules), Math.max(...modules)]
  const beyond = Array.from({ length: GUIDES_BEYOND }, (_, k) => [lo - module * (k + 1), hi + module * (k + 1)]).flat()
  return [...modules, ...beyond]
}

/**
 * The lines a block's edits snap to (placed on the site when a place is given): its module lines whole, not clipped to its face, and the same module
 * again past its box, so a corner dragged out of the block or into a cut of it still finds them; its column lines, clipped to its face.
 */
function guidesOf(g: Pick<Generated, 'lines' | 'runs'>, place?: Place): [Point, Point][] {
  const at = (q: Point): Point => (place ? onPlace(place, q) : q)
  const xs = runLines(g.runs.x.modules, g.runs.x.module)
  const ys = runLines(g.runs.y.modules, g.runs.y.module)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const whole: [Point, Point][] = [...xs.map((x): [Point, Point] => [at({ x, y: y0 }), at({ x, y: y1 })]), ...ys.map((y): [Point, Point] => [at({ x: x0, y }), at({ x: x1, y })])]
  return [...whole, ...g.lines.columns.map((c): [Point, Point] => [at(c.a), at(c.b)])]
}

/** The reference corners of an outline (edge i starts at corner i), placed on the site when a place is given. */
const referenceOf = (g: Pick<Generated, 'edges'>, place?: Place): Point[] => g.edges.map((e) => (place ? onPlace(place, e.a) : e.a))

/** A block type's outline as the engine reads it: its face as a contour in the type's frame (m; its corners' radii and chamfers, its arcs), each wall with its edge, tone, module, range and lines. */
export function typeShapeOf(p: Project, ref: Ref): ShapeRead | null {
  const t = typeOf(p, ref.id)
  if (!t) return null
  const g = generate(t)
  return { contour: g.face, walls: wallsOf(t, t, g, g.face.vertices, (i) => g.edges[i] ?? null), guides: guidesOf(g), reference: referenceOf(g) }
}

/** A refusal: the same project and why. */
const refuse = (p: Project, reason: string): ShapeWrite => ({ project: p, reason })
/** An edit's frame moved, as the block editor's `onShift` reads it: how far what stays still went in the type's frame (`fit.shift` turned back). */
const framed = (s: Point): { shift?: Point } => (s.x === 0 && s.y === 0 ? {} : { shift: { x: 0 - s.x, y: 0 - s.y } })

/** A run of the outline engine that was refused: the same project, why, and a push or a bump says it moved nothing. */
function refusedRun(p: Project, run: Extract<OutlineRun, { ok: false }>): ShapeWrite {
  return { project: p, reason: run.reason, ...(run.applied !== undefined && { applied: run.applied }), ...(run.notes.length > 0 && { notes: run.notes }) }
}

/** What an outline edit gives back: how far it pushed, what it said. */
function wrote(project: Project, edit: Pick<OutlineEdit, 'applied'>, notes: string[]): ShapeWrite {
  return { project, ...(edit.applied !== undefined && { applied: edit.applied }), ...(notes.length > 0 && { notes }) }
}

/** The edge an op that names a wall stands on (in the type's frame). */
function edgeOfOp(g: Pick<Generated, 'edges'>, op: ShapeOp): ShapeEdge | undefined {
  return 'wall' in op ? g.edges[modWall(op.wall, g.edges.length)] : undefined
}

/**
 * One operation on a block type's outline, free (Decision "Block shape"): the shape engine's op runs on the outer face at any angle,
 * the module lines no rule; a push on a box wall (one along the grid on the box's line) stretches the box by the metres asked (its
 * corners and holes keep their distance from the nearer wall; `shift` when it grows at a low wall), every other op reshapes the outline
 * and the box is fitted round it. What stood on a wall that is angled now is left out, and said. A move is refused.
 */
export function editTypeShape(p: Project, ref: Ref, op: ShapeOp): ShapeWrite {
  const t = typeOf(p, ref.id)
  if (!t) return refuse(p, 'That block is not there')
  if (op.op === 'move') return refuse(p, 'A block moves by Transform')
  const g = generate(t)
  const e = edgeOfOp(g, op)
  if (op.op === 'push' && !op.free && e?.outer) {
    if (!Number.isFinite(op.by)) return refuse(p, 'The distance must be a number')
    if (op.by === 0) return { project: p, applied: 0 }
    const key = e.horizontal ? 'width' : 'length'
    const module = (e.horizontal ? t.grid.y : t.grid.x) / t.grid.modules
    // a box wall stretches the box (the hall step), a module at least
    const size = t.hall[key]
    const grown = Math.max(module, mm3(size + op.by))
    const delta = mm3(grown - size)
    const q = delta === 0 ? p : editWarehouseStep(p, ref.id, 'hall', { [key]: grown } as StepPatch['hall'])
    if (q === p) return { project: p, applied: 0, reason: 'The wall cannot move that way' }
    const low = e.side === 'front' || e.side === 'left'
    return { project: q, applied: delta, ...(low && { shift: e.horizontal ? { x: 0, y: delta } : { x: delta, y: 0 } }) }
  }
  const run = runOutlineOp(t, g, op)
  if (!run.ok) return refusedRun(p, run)
  const w = typeEdited(p, t, g, run.edit)
  if (!w) return refuse(p, 'The outline cannot change that way')
  return { ...wrote(w.project, run.edit, w.notes), ...framed(run.edit.fit.shift) }
}

/**
 * A block's mass as the engine reads it: its face where the copy stands, as a contour on the site (corner i where wall i starts, its
 * radii, chamfers and arcs), each wall with its edge, tone, module, range and lines; null for any other mass. Nothing is refused by the
 * block but a move (its kind says it).
 */
export function blockShapeOf(p: Project, ref: Ref): ShapeRead | null {
  const x = blockOf(p, ref.id)
  if (!x) return null
  const face = x.g.face
  const contour: Contour = { vertices: face.vertices.map((v) => ({ ...v, ...onPlace(x.w.place, v) })), ...(face.arcs ? { arcs: face.arcs } : {}) }
  return { contour, walls: wallsOf(x.t, typeWith(x.t, x.w.overrides), x.g, face.vertices, (i) => x.g.edges[i] ?? null), guides: guidesOf(x.g, x.w.place), reference: referenceOf(x.g, x.w.place) }
}

/** An op given on the site in the type's frame (a point is the plan's, a vector turned back). */
function inTypeFrame(place: Place, op: ShapeOp): ShapeOp {
  if (op.op === 'move') {
    const [c, s] = cosSin(place.angle)
    return { ...op, by: { x: op.by.x * c + op.by.y * s, y: -op.by.x * s + op.by.y * c } }
  }
  if (op.op === 'vertex') return { ...op, to: fromPlace(place, op.to) }
  if (op.op === 'insert') return { ...op, at: fromPlace(place, op.at) }
  return op
}

/**
 * One operation on a block's mass (a copy on the site), free: a push on a box wall stretches the copy's box by the metres asked
 * (`stretchWarehouseHall`, past the range by hand too); every other op is the copy's own outline, as a type's is edited: the copy a
 * variant, its type untouched, its place moved where its box grows at a low wall. A move is refused.
 */
export function editBlockShape(p: Project, ref: Ref, op: ShapeOp): ShapeWrite {
  const x = blockOf(p, ref.id)
  if (!x) return refuse(p, 'That mass is not a block’s')
  if (op.op === 'move') return refuse(p, 'A block moves by Transform')
  const e = edgeOfOp(x.g, op)
  if (op.op === 'push' && !op.free && e?.outer) {
    if (!Number.isFinite(op.by)) return refuse(p, 'The distance must be a number')
    if (op.by === 0) return { project: p, applied: 0 }
    const r = stretchWarehouseHall(p, x.b.id, boxSide(e.side), op.by, true)
    return r.applied === 0 ? { project: r.project, applied: 0, reason: 'The wall cannot move that way' } : { project: r.project, applied: r.applied }
  }
  const asked = inTypeFrame(x.w.place, op)
  const seen: { run?: OutlineRun } = {}
  const r = copyEdited(p, x.b.id, (made, g) => {
    seen.run = runOutlineOp(made, g, asked)
    return seen.run.ok ? seen.run.edit : null
  })
  if (!r) return seen.run && !seen.run.ok ? refusedRun(p, seen.run) : refuse(p, 'The outline cannot change that way')
  return wrote(r.project, r.edit, r.notes)
}

// ---- A block's holes, free contours on the shape engine (Phase D.2) --------------------------------------------------------

/** The hole a ref names, and where it stands: a type's (`hole`, `<typeId>/<holeId>`: the block editor's) or a placed copy's (`mass-hole`, `<hallMassId>/<k>`). */
type HoleOwner = { hole: ShapeHole; place: Place | null; type: WarehouseType; building: Building | null }

/** The owner of a hole ref: undefined when the ref is not a block's (a plain mass's hole); null when it is, and the hole is not there. */
function holeOwner(p: Project, ref: Ref): HoleOwner | null | undefined {
  const s = ref.id.lastIndexOf('/')
  const tail = ref.id.slice(s + 1)
  if (ref.kind === 'hole') {
    const t = s > 0 ? typeOf(p, ref.id.slice(0, s)) : undefined
    const hole = t && generate(t).holes.find((h) => h.id === tail)
    return t && hole ? { hole, place: null, type: t, building: null } : null
  }
  if (ref.kind !== 'mass-hole' || s <= 0) return undefined
  const x = blockOf(p, ref.id.slice(0, s))
  if (!x) return undefined
  const hole = /^\d+$/.test(tail) ? x.g.holes[Number(tail)] : undefined
  return hole ? { hole, place: x.w.place, type: x.t, building: x.b } : null
}

/** A hole as a contour, on the site when it stands on a copy. */
function holeContour(h: ShapeHole, place: Place | null): Contour {
  return { vertices: h.vertices.map((v) => ({ ...v, ...(place ? onPlace(place, v) : {}) })), ...(h.arcs ? { arcs: h.arcs } : {}) }
}

/** A hole as the engine reads it (`ShapeRead`): its contour (on the site for a copy's), the wall it moves by a decimetre; undefined when the ref is not a block's, null when the hole is not there. */
export function blockHoleOf(p: Project, ref: Ref): ShapeRead | null | undefined {
  const o = holeOwner(p, ref)
  return o ? { contour: holeContour(o.hole, o.place), step: 0.1 } : o
}

/** The edit that gives a block these holes and nothing else new (its outline, its box and its zones as they are). */
function holesEdit(made: WarehouseType, g: Generated, holes: ShapeHole[]): OutlineEdit {
  const was = { x: made.hall.ends, y: made.hall.endsWidth ?? made.hall.ends, short: made.hall.shortEnds, joinUnder: made.hall.joinUnder }
  const m = shapeNow(made, g.runs)
  return { outline: g.outline, renamed: new Map(), split: null, holes, fit: { hall: { length: made.hall.length, width: made.hall.width, ...hallEnds(was) }, morphology: { ...m, holes }, shift: { x: 0, y: 0 } } }
}

/** Whether every hole stands inside the block's outline and apart from the others. */
const holesFit = (g: Generated, holes: ShapeHole[]): boolean => holes.every((h, i) => holeFits(g.outline, h, holes.filter((_, j) => j !== i)))

/** A hole with its corners at the millimetre (what is stored: no float noise from the turns between the site's frame and the type's). */
const roundHole = (h: ShapeHole): ShapeHole => ({ ...h, vertices: h.vertices.map((v) => ({ ...v, x: mm3(v.x) + 0, y: mm3(v.y) + 0 })) })

/** A block's holes written (the owner's: its type's, or its copy's own, which makes the copy a variant); the same project and why when they do not fit. Rounded to the millimetre. */
function holesWritten(p: Project, o: HoleOwner, holes: (g: Generated) => ShapeHole[]): { project: Project; reason?: string } {
  const bad = 'A hole must stay inside its block'
  if (o.building) {
    const r = copyEdited(p, o.building.id, (made, g) => {
      const h = holes(g).map(roundHole)
      return holesFit(g, h) ? holesEdit(made, g, h) : null
    })
    return r ? { project: r.project } : { project: p, reason: bad }
  }
  const g = generate(o.type)
  const h = holes(g).map(roundHole)
  const w = holesFit(g, h) ? typeEdited(p, o.type, g, holesEdit(o.type, g, h)) : null
  return w ? { project: w.project } : { project: p, reason: bad }
}

/**
 * A hole cut in a block type by hand, free (Phase D.2 task 6: the Hole tool's rectangle, its corners in metres in the type's frame, the module lines a
 * snap of the pointer): it takes the next hole id and must stay inside the block, apart from the other holes. The same project and why when it does not fit.
 */
export function addTypeHole(p: Project, typeId: Id, a: Point, b: Point): { project: Project; id?: Id; reason?: string } {
  const t = typeOf(p, typeId)
  if (!t) return { project: p, reason: 'That block is not there' }
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)]
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  const owner: HoleOwner = { hole: { id: 'h0', vertices: [] }, place: null, type: t, building: null }
  let id: Id | undefined
  const w = holesWritten(p, owner, (g) => {
    id = freeEdgeId(g.holes, 'h')
    return [...g.holes, { id, vertices: rectContour(x0, y0, x1, y1) }]
  })
  return w.reason ? { project: p, reason: w.reason } : { project: w.project, id }
}

/**
 * One operation on a hole of a block, a free contour on the shape engine (a hole takes every op but a bump, a radius and a chamfer: its
 * kind says): it keeps its id and its corridor, and must stay inside its block, apart from the other holes. A copy's own hole
 * (`mass-hole`) makes the copy a variant. Undefined when the ref is not a block's hole.
 */
export function editBlockHole(p: Project, ref: Ref, op: ShapeOp): ShapeWrite | undefined {
  const o = holeOwner(p, ref)
  if (o === undefined) return undefined
  if (o === null) return refuse(p, 'That hole is not there')
  const local = o.place ? inTypeFrame(o.place, op) : op
  // a hole given on the site is drawn on the type's frame: turned back
  const c = holeContour(o.hole, null)
  const r = runShapeOp(c, local)
  if (!r.ok) return { project: p, reason: r.reason, ...(op.op === 'push' ? { applied: 0 } : {}), ...(r.notes.length > 0 ? { notes: r.notes } : {}) }
  const edited = (id: Id): ShapeHole => {
    const { arcs: _, ...rest } = o.hole
    return { ...rest, id, vertices: r.contour.vertices, ...(r.contour.arcs ? { arcs: r.contour.arcs } : {}) }
  }
  let made = ''
  const w = holesWritten(p, o, (g) => {
    if (op.op === 'move' && op.copy) {
      // a copy of it, the last hole, without its corridor
      const { corridor: _c, ...rest } = edited(freeEdgeId(g.holes, 'h'))
      made = rest.id
      return [...g.holes, rest]
    }
    return g.holes.map((h) => (h.id === o.hole.id ? edited(h.id) : h))
  })
  if (w.reason) return { project: p, reason: w.reason }
  if (op.op === 'move' && op.copy) {
    // the copy is the block's last hole
    const head = ref.id.slice(0, ref.id.lastIndexOf('/'))
    const last = o.building ? String((generateHoles(w.project, o)?.length ?? 1) - 1) : made
    return { project: w.project, ref: { kind: ref.kind, id: `${head}/${last}` } }
  }
  return { project: w.project, ...(r.applied !== undefined && { applied: r.applied }), ...(r.notes.length > 0 && { notes: r.notes }) }
}

/** The holes a copy has now (its type with its overrides, generated). */
function generateHoles(p: Project, o: HoleOwner): ShapeHole[] | null {
  const b = o.building && p.buildings.find((x) => x.id === o.building!.id)
  const t = b?.warehouse && typeOf(p, b.warehouse.type)
  return b?.warehouse && t ? generate(typeWith(t, b.warehouse.overrides)).holes : null
}

/** What the hole verbs of a mass do to a block's hall: a hole added, taken away, redrawn, or its corridor set (the site's contours). `face` on an added one: the contour is the cut as it is seen (what `drawBlock` and the union take a hole stroke for), so it is grown by the wall to the hole's reference line. */
export type BlockHolesEdit = { kind: 'add'; contour: Contour; face?: boolean } | { kind: 'remove'; k: number } | { kind: 'set'; k: number; contour: Contour } | { kind: 'corridor'; k: number; width: number | null }

/**
 * A hole verb on a block's hall (`addHole`, `removeHole`, `setHole`, `setHoleCorridor`): the copy's own holes (a variant), its contours
 * given on the site. Undefined when the mass is not a block's hall; the same project (and `reason`) when the hole is not there or does
 * not fit; `k` the hole added.
 */
export function editBlockHoles(p: Project, massId: Id, edit: BlockHolesEdit): { project: Project; k?: number; reason?: string } | undefined {
  const x = blockOf(p, massId)
  if (!x) return undefined
  const back = (c: Contour): Contour => ({ vertices: c.vertices.map((v) => ({ ...v, ...fromPlace(x.w.place, v) })), ...(c.arcs ? { arcs: c.arcs } : {}) })
  const owner: HoleOwner = { hole: x.g.holes[0] ?? { id: 'h0', vertices: [] }, place: x.w.place, type: x.t, building: x.b }
  const at = 'k' in edit ? x.g.holes[edit.k] : undefined
  if ('k' in edit && !at) return { project: p, reason: 'That hole is not there' }
  let k: number | undefined
  const w = holesWritten(p, owner, (g) => {
    if (edit.kind === 'add') {
      const drawn = edit.face ? (offsetEdges(edit.contour, edit.contour.vertices.map(() => typeWith(x.t, x.w.overrides).envelope.thickness)) ?? edit.contour) : edit.contour
      const c = back(drawn)
      k = g.holes.length
      return [...g.holes, { id: freeEdgeId(g.holes, 'h'), vertices: c.vertices, ...(c.arcs ? { arcs: c.arcs } : {}) }]
    }
    if (edit.kind === 'remove') return g.holes.filter((_, i) => i !== edit.k)
    if (edit.kind === 'set') {
      const c = back(edit.contour)
      return g.holes.map((h, i) => {
        if (i !== edit.k) return h
        const { arcs: _, ...rest } = h
        return { ...rest, vertices: c.vertices, ...(c.arcs ? { arcs: c.arcs } : {}) }
      })
    }
    return g.holes.map((h, i) => {
      if (i !== edit.k) return h
      const { corridor: _, ...rest } = h
      return edit.width && edit.width > 0 ? { ...rest, corridor: edit.width } : rest
    })
  })
  return { ...w, ...(k !== undefined && !w.reason ? { k } : {}) }
}

/**
 * A block's mass redrawn from a new outer face (`setMassOutline`; the agent's tools): the points on the site, counter-clockwise. Each
 * new edge takes the wall of the old edge it lies along (the first piece keeps its id), else the envelope's; the box is fitted round it
 * and the copy becomes a variant. Undefined when the mass is not a block's.
 */
export function setBlockOutline(p: Project, massId: Id, points: Point[]): ShapeWrite | undefined {
  const x = blockOf(p, massId)
  if (!x) return undefined
  if (points.length < 3 || points.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) return refuse(p, 'An outline needs three corners at least')
  const local = points.map((q) => ({ ...fromPlace(x.w.place, q), r: 0 }))
  const face: Contour = { vertices: local }
  const old = x.g.face.vertices
  // each new edge lies along the old edge it runs on (parallel and on its line), else it is new
  const from = local.map((a, k) => {
    const b = local[(k + 1) % local.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-9) return null
    const j = old.findIndex((c, i) => {
      const d = old[(i + 1) % old.length]
      const l = Math.hypot(d.x - c.x, d.y - c.y)
      const cross = Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)) / (len * l)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      return cross < 1e-6 && distancePointSegment(mid, c, d) < 0.05
    })
    return j < 0 ? null : j
  })
  const seen: { run?: OutlineRun } = {}
  const r = copyEdited(p, x.b.id, (made, g) => {
    seen.run = outlineFromFace(made, g, face, from)
    return seen.run.ok ? seen.run.edit : null
  })
  if (!r) return seen.run && !seen.run.ok ? refusedRun(p, seen.run) : refuse(p, 'The outline cannot be that')
  return wrote(r.project, r.edit, r.notes)
}

// ---- A truck court, a shape of its own on the shape engine (Phase D.3, Decisions "Court shape", "Shape engine") ----------------

/** What a court's ref names: a type's (`court`: `<typeId>/<edgeId>[/<courtId>]`, the block editor's) or a placed copy's (`block-court`: `<hallMassId>/<edgeId>[/<courtId>]`). */
function courtRefOf(ref: Ref): { owner: Id; edge: Id; court?: Id } | null {
  if (ref.kind !== 'court' && ref.kind !== 'block-court') return null
  const [owner, edge, ...rest] = ref.id.split('/')
  return owner && edge ? { owner, edge, ...(rest.length ? { court: rest.join('/') } : {}) } : null
}

/**
 * A truck court as the shape engine finds it: the block it belongs to as it is (a type; a copy read as its own type, its own courts or its type's),
 * the wall it stands on, its contour in the wall's frame (`contour`) and the two ways between that frame and the viewport's (`to`, `from`: the type's
 * frame in the block editor, the plan on the site). A court with no shape of its own is the rectangle across its wall by its depth (`rect`: the depth).
 */
interface CourtHere {
  made: WarehouseType
  typeId: Id
  edge: ShapeEdge
  /** What the rule holds its wall side to: the wall's face from corner to corner, in the block editor and on the site alike. */
  span: WallSpan
  /** The block's courts now (a copy's: its own, else its type's) and where this court's entry is in them (-1: a docked wall's court with no entry yet). */
  courts: CourtByEdge[]
  at: number
  entry: CourtByEdge | undefined
  /** On the site: the copy's building, its hall's mass and the wall of that mass the court stands in front of. */
  site: { building: Building; hall: Mass; wall: Wall } | null
  contour: Contour
  rect: number | null
  to(q: Point): Point
  from(q: Point): Point
}

/** The wall of a hall's footprint a block's edge stands on (found by the middle of its first stretch of wall on the plan, as `copyParts` finds it); null: none. */
function wallOnSite(m: Mass, g: Pick<Generated, 'walls'>, edge: Id, place: Place): Wall | null {
  const piece = g.walls.find((x) => x.part === 'hall' && x.edge === edge)
  if (!piece) return null
  const mid = onPlace(place, { x: (piece.a.x + piece.b.x) / 2, y: (piece.a.y + piece.b.y) / 2 })
  return dockableWalls(footprintPolygon(m.footprint)).find((w) => distancePointSegment(mid, w.a, w.b) < 1e-3) ?? null
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** The court a ref names, or null: it is not there (no such block, wall or court; a wall not along the grid has none, Phase D.2). */
function courtHere(p: Project, ref: Ref): CourtHere | null {
  const r = courtRefOf(ref)
  if (!r) return null
  let made: WarehouseType
  let g: Generated
  let typeId: Id
  let place: Place | null = null
  let site: { building: Building; hall: Mass } | null = null
  if (ref.kind === 'court') {
    const t = typeOf(p, r.owner)
    if (!t) return null
    made = t
    g = generate(t)
    typeId = t.id
  } else {
    const x = blockOf(p, r.owner)
    if (!x) return null
    // a copy with an outline of its own keeps its type's courts only on the edges it has (review N7)
    made = typeWith(x.t, ownBundle(x.t, x.w.overrides))
    g = x.g
    typeId = x.t.id
    place = x.w.place
    site = { building: x.b, hall: x.m }
  }
  const edge = g.edges.find((e) => e.id === r.edge)
  if (!edge || edge.axis === null) return null
  const wall = site && place ? wallOnSite(site.hall, g, edge.id, place) : null
  if (site && !wall) return null
  const courts = made.courts ?? []
  const mine = courts.filter((c) => c.edge === edge.id)
  const entry = r.court !== undefined ? mine.find((c) => c.id === r.court) : (mine.find((c) => c.id === undefined) ?? mine[0])
  const docked = g.doors.some((d) => d.kind === 'dock' && d.edge === edge.id)
  if (r.court !== undefined ? !entry : !entry && !docked) return null
  const frame = wallFrame(edge)
  // the face from corner to corner: where a court's wall side may stand; the site's rectangle spans it, the block editor's the reference line's
  const face = faceSpan(edge, g.walls)
  const span = face ?? { lo: 0, hi: frame.length }
  // the wall's own depth (the pill, Mass.courts) is the court the site derives, over a shape
  const own = site && wall ? edgeOwnDepth(site.hall, wall) : undefined
  const depth = own ?? entry?.depth ?? made.court?.depth ?? standardsOf(p).courtDepth
  const shaped = own === undefined ? entry?.shape : undefined
  const contour = shaped ?? courtContour({}, edge, depth, site ? (face ?? undefined) : undefined)
  const pl = place
  return {
    made,
    typeId,
    edge,
    span,
    courts,
    at: entry ? courts.indexOf(entry) : -1,
    entry,
    site: site && wall ? { ...site, wall } : null,
    contour,
    rect: shaped ? null : depth,
    to: pl ? (q) => onPlace(pl, fromWall(frame, q)) : (q) => fromWall(frame, q),
    from: pl ? (q) => toWall(frame, fromPlace(pl, q)) : (q) => toWall(frame, q),
  }
}

/** A hall's own court depth on a wall (`Mass.courts`: the pill's), if it has one. */
function edgeOwnDepth(m: Mass, w: Wall): number | undefined {
  const poly = footprintPolygon(m.footprint)
  return m.courts?.find((c) => edgeAt(poly, c.t).i === w.i)?.depth
}

/** A court's wall side as the viewport's edge indices (the viewport runs the other way round: edge k of the wall's frame is edge n - 2 - k). */
const viewEdge = (k: number, n: number) => (((n - 2 - k) % n) + n) % n

/**
 * A truck court as the shape engine reads it (`court`, `block-court`): its contour in the viewport's frame, counter-clockwise; its wall side `fixed`
 * (no pill, no push); the far edge of a rectangle `value`: its depth, 5-200 m (a shape has none: its deepest point is its depth); its corners on the
 * wall `onLine`: a drag slides them along it. Null: no such court.
 */
export function courtShapeOf(p: Project, ref: Ref): ShapeRead | null {
  const c = courtHere(p, ref)
  if (!c) return null
  const view = mirrored(c.contour, c.to)
  const n = view.vertices.length
  const side = new Set(wallSide(c.contour).map((k) => viewEdge(k, n)))
  const walls: ShapeWall[] = view.vertices.map((_, j) => ({
    ...(side.has(j) ? { fixed: true as const } : {}),
    // the far edge of the rectangle is edge 0 of its viewport's contour
    ...(c.rect !== null && j === 0 ? { value: { now: c.rect, lo: COURT_DEPTH_MIN, hi: COURT_DEPTH_MAX } } : {}),
  }))
  const corners = c.contour.vertices.flatMap((v, i) => (Math.abs(v.y) <= 1e-4 ? [n - 1 - i] : []))
  return { contour: view, walls, onLine: { corners, a: c.to({ x: 0, y: 0 }), b: c.to({ x: 1, y: 0 }) } }
}

/** A court's block with its courts written (the type's, or the copy's own: a variant), and on the site the wall's own depth cleared when `clear`. */
function courtsWritten(p: Project, c: CourtHere, courts: CourtByEdge[], clear: boolean): Project {
  let q: Project
  if (c.site) {
    const k = copyNow(p, c.site.building.id)
    q = k ? setWarehouseOverrides(p, c.site.building.id, { ...k.o, courts }) : p
    if (clear && q !== p && edgeOwnDepth(c.site.hall, c.site.wall) !== undefined) q = setCourtDepth(q, c.site.hall.id, c.site.wall.t, null)
  } else {
    const t = typeOf(p, c.typeId)
    if (!t) return p
    const { courts: _, ...rest } = t
    q = withElements(p, t, courts.length ? { ...t, courts } : rest)
  }
  return q
}

/** A court's list with its own entry made these (a split: several, in its place), each with an id: the first keeps the court's own, the others take the next free ones. */
function courtsWith(c: CourtHere, shapes: Contour[]): CourtByEdge[] {
  const used: { id?: Id }[] = c.courts.flatMap((x) => (x.id !== undefined ? [{ id: x.id }] : []))
  const fresh = (): Id => {
    const id = freeCourtId(used)
    used.push({ id })
    return id
  }
  const entries = shapes.map((shape, k): CourtByEdge => ({ edge: c.edge.id, id: k === 0 && c.entry?.id !== undefined ? c.entry.id : fresh(), shape }))
  return c.at < 0 ? [...c.courts, ...entries] : [...c.courts.slice(0, c.at), ...entries, ...c.courts.slice(c.at + 1)]
}

/** A rectangle's depth moved by `op.by`: the block's court depth (`setEdgeCourt`) in the block editor, the wall's own (`setCourtDepth`, the pill's) on the site; held to 5-200 m, and said. */
function courtDeepened(p: Project, c: CourtHere, by: number): ShapeWrite {
  if (!Number.isFinite(by)) return { project: p, applied: 0, reason: 'The distance must be a number' }
  const now = c.rect as number
  if (by === 0) return { project: p, applied: 0 }
  const want = round2(now + by)
  const depth = Math.min(COURT_DEPTH_MAX, Math.max(COURT_DEPTH_MIN, want))
  const held = depth !== want ? [`Held to ${depth} m: a court is ${COURT_DEPTH_MIN}–${COURT_DEPTH_MAX} m deep`] : []
  if (depth === now) return { project: p, applied: 0, reason: held[0] ?? 'The court does not move', ...(held.length ? { notes: held } : {}) }
  const q = c.site ? setCourtDepth(p, c.site.hall.id, c.site.wall.t, depth) : setEdgeCourt(p, c.typeId, c.edge.id, { depth })
  return q === p ? { project: p, applied: 0, reason: 'The court does not move' } : { project: q, applied: round2(depth - now), ...(held.length ? { notes: held } : {}) }
}

/**
 * One operation on a truck court, free but for its wall (the `court` and `block-court` kinds take every op but a move): a push of its far edge when it is a
 * rectangle sets its depth and nothing else (a rectangle stays one, so the optimizer's `court.depth` still reaches it); every other op writes a shape, in the
 * wall's frame, held by the rule on write (`courtRule`): its wall side stays on the wall (a push of it, or a corner dragged off it, lands on it), its far part
 * in front of it, its depth 5-200 m. A split keeps the pieces that touch the wall, each a court with its id. In the block editor the shape is the type's, on
 * the site the copy's own (a variant): *Back to type* clears it, and the wall's own depth with it. A refusal is the same project and why.
 */
export function editCourtShape(p: Project, ref: Ref, op: ShapeOp): ShapeWrite {
  const c = courtHere(p, ref)
  if (!c) return refuse(p, 'That truck court is not there')
  if (op.op === 'move') return refuse(p, 'A truck court moves with its wall')
  const view = mirrored(c.contour, c.to)
  const n = view.vertices.length
  const modN = (i: number) => ((i % n) + n) % n
  const pushed = op.op === 'push' || op.op === 'bump'
  const stopped = (reason: string, notes: string[] = []): ShapeWrite => ({ project: p, reason, ...(pushed ? { applied: 0 } : {}), ...(notes.length ? { notes } : {}) })
  if (c.rect !== null && op.op === 'push' && modN(op.wall) === 0) return courtDeepened(p, c, op.by)
  if (pushed && wallSide(c.contour).some((k) => viewEdge(k, n) === modN(op.wall))) return stopped(STAYS_ON_WALL)
  // a corner on the wall slides along it only: the drag is projected on its line
  let asked = op
  if (op.op === 'vertex') {
    const wall = courtShapeOf(p, ref)!.onLine!
    if (wall.corners.includes(modN(op.vertex))) {
      const d = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y }
      const t = ((op.to.x - wall.a.x) * d.x + (op.to.y - wall.a.y) * d.y) / (d.x * d.x + d.y * d.y)
      asked = { ...op, to: { x: wall.a.x + d.x * t, y: wall.a.y + d.y * t } }
    }
  }
  const run = runShapeOp(view, asked)
  if (!run.ok) return stopped(run.reason, run.notes)
  if (run.contour === view) return { project: p, ...(run.applied !== undefined ? { applied: run.applied } : {}) }
  if (asked.op === 'split') {
    const s = splitCourt(c.contour, c.from(asked.a), c.from(asked.b))
    const held = s.pieces.map((piece) => courtRule(piece, c.span.hi, c.span.lo))
    const pieces = held.flatMap((h) => ('contour' in h ? [h.contour] : []))
    if (!pieces.length) return stopped(STAYS_ON_WALL)
    const went = s.went + (held.length - pieces.length)
    const notes = [...(went ? [wentNote(went)] : []), ...held.flatMap((h) => ('notes' in h ? h.notes : []))]
    const q = courtsWritten(p, c, courtsWith(c, pieces), true)
    return { project: q, ...(notes.length ? { notes } : {}) }
  }
  const held = courtRule(mirrored(run.contour, c.from), c.span.hi, c.span.lo)
  if ('reason' in held) return stopped(held.reason, run.notes)
  const notes = [...run.notes, ...held.notes]
  const q = courtsWritten(p, c, courtsWith(c, [held.contour]), true)
  return { project: q, ...(run.applied !== undefined ? { applied: run.applied } : {}), ...(notes.length ? { notes } : {}) }
}

/**
 * *Back to a rectangle*: a court's shape gone, its depth its deepest point's (held to 5-200 m), its id with it. A court with no shape: the same project; a wall
 * with other courts as well (after a split) refuses, as one rectangle across its wall would lie on them.
 */
export function courtToRectangle(p: Project, ref: Ref): { project: Project; reason?: string; notes?: string[] } {
  const c = courtHere(p, ref)
  if (!c) return { project: p, reason: 'That truck court is not there' }
  if (!c.entry?.shape) return { project: p }
  if (c.courts.filter((x) => x.edge === c.edge.id).length > 1) return { project: p, reason: 'Back to a rectangle takes a wall’s only court: remove the others first' }
  const deepest = round2(courtDepth(c.entry.shape))
  const depth = Math.min(COURT_DEPTH_MAX, Math.max(COURT_DEPTH_MIN, deepest))
  const notes = depth !== deepest ? [`Held to ${depth} m: a court is ${COURT_DEPTH_MIN}–${COURT_DEPTH_MAX} m deep`] : []
  const courts = c.courts.map((x) => (x === c.entry ? { edge: c.edge.id, depth } : x))
  return { project: courtsWritten(p, c, courts, true), ...(notes.length ? { notes } : {}) }
}

/**
 * One truck court taken away by its ref (Delete on a picked piece of a split court): the other courts of its wall stay. The wall's last court (or a court of no
 * list yet) goes as the Court tool's null does: a type's or the copy's own, the standard one of a docked wall then standing. Nothing changed: the same project.
 */
export function removeCourt(p: Project, ref: Ref): Project {
  const c = courtHere(p, ref)
  if (!c) return p
  if (c.entry && c.courts.filter((x) => x.edge === c.edge.id).length > 1) return courtsWritten(p, c, c.courts.filter((x) => x !== c.entry), true)
  return c.site ? setCopyEdgeCourt(p, c.site.building.id, c.edge.id, null) : setEdgeCourt(p, c.typeId, c.edge.id, null)
}

/** Masses deleted (a block's mass, its block's copy with it: Decision "Block shape", one mass). */
export function removeMassesWithBlocks(p: Project, ids: Id[]): Project {
  return removeMasses(p, ids)
}

/** A copy's variant: what it changes of its type (null or empty: none, back to the type); its masses made again. */
/**
 * The copies an option shows past their block's range (Decision "Past the range by hand", RB.2: what the optimizer's
 * Run names before a run that varies their boxes): each with its name, its sides past it and those in words. `bays`:
 * how far the optimizer searches a block without a range (its variable's; two by default).
 */
export function pastRanges(p: Project, optionId: Id, bays = 2): { id: Id; name: string; sides: PastSide[]; says: string }[] {
  const o = p.options.find((x) => x.id === optionId)
  if (!o) return []
  return o.buildingIds.flatMap((id) => {
    const b = p.buildings.find((x) => x.id === id)
    const sides = b && !b.context ? pastRange(p, id, bays) : []
    return b && sides.length ? [{ id, name: b.name, sides, says: `${b.name} (${sides.map(pastInWords).join('; ')})` }] : []
  })
}

/**
 * The copies an option shows past their block's range brought back to it (RB.2, the optimizer's Run): each side to
 * the nearer end of what the optimizer searches, on the block's modules; one at the block's size is no override.
 * Remade where each stands. None past it: the same project.
 */
export function bringToRange(p: Project, optionId: Id, bays = 2): Project {
  let q = p
  for (const c of pastRanges(p, optionId, bays)) {
    const b = q.buildings.find((x) => x.id === c.id)
    const t = b?.warehouse && typeOf(q, b.warehouse.type)
    if (!b?.warehouse || !t) continue
    const o = b.warehouse.overrides ?? {}
    const hall = { ...o.hall }
    for (const s of c.sides) {
      if (Math.abs(s.to - t.hall[s.key]) < 1e-6) delete hall[s.key]
      else hall[s.key] = s.to
    }
    const { hall: _, ...rest } = o
    q = setWarehouseOverrides(q, c.id, Object.keys(hall).length ? { ...rest, hall } : rest)
  }
  return q
}

/**
 * A copy's own elements come with its own outline (Decision "Elements by module"): they are counted on the box it was
 * drawn on, so its type's later edits never change what they mean. Given without one (counted on the copy's box now):
 * its shape as it stands there, drawn on that box, its own.
 */
function withOwnShape(t: WarehouseType, o: WarehouseOverrides): WarehouseOverrides {
  if (!o.elements || drawn(o.morphology?.outline)) return o
  const { elements: _, ...rest } = o
  const c = typeWith(t, rest)
  return { ...o, morphology: { ...o.morphology, ...shapeNow(c, hallRuns(c)) } }
}

/**
 * Given overrides made one bundle (`ownBundle`) on the copy's box as it was (`was`: its overrides before), the frame
 * `rebasedCopy` reads a given's elements in, so a part given alone (its outline without its elements) and the rest
 * completed are rebased once; its own hall and grid as given. A whole bundle, or no own outline: as given.
 */
function bundledBefore(t: WarehouseType, was: WarehouseOverrides | undefined, given: WarehouseOverrides): WarehouseOverrides {
  const { hall, grid, ...shape } = given
  const before = { ...shape, ...(was?.hall && { hall: was.hall }), ...(was?.grid && { grid: was.grid }) }
  const b = ownBundle(t, before)
  if (!b || b === before) return given
  const { hall: _, grid: __, ...bundle } = b
  return { ...bundle, ...(hall && { hall }), ...(grid && { grid }) }
}

export function setWarehouseOverrides(p: Project, buildingId: Id, given: WarehouseOverrides | null): Project {
  const b = p.buildings.find((x) => x.id === buildingId)
  const t = b?.warehouse && typeOf(p, b.warehouse.type)
  if (!b?.warehouse) return p
  const placed = withPlaces(p, b.warehouse.type)
  const at = placed.buildings.find((x) => x.id === buildingId)!
  const { overrides: _, ...rest } = at.warehouse!
  const was = t && ownBundle(t, at.warehouse!.overrides)
  const overrides = given && t ? rebasedCopy(t, was, t, bundledBefore(t, was, withOwnShape(t, given))) : given
  const empty = !overrides || Object.keys(overrides).length === 0
  const warehouse = empty ? rest : { ...rest, overrides }
  if (JSON.stringify(warehouse) === JSON.stringify(b.warehouse)) return p
  const q = { ...placed, buildings: placed.buildings.map((x) => (x.id === buildingId ? { ...x, warehouse } : x)) }
  return remake(q, buildingId)
}

// ---- A placed block's own docks and courts (Decision "Blocks on the site", GT.7) ----------------------------------

/**
 * A copy as it stands on the plan, read as its own type (`typeWith`, its own shape one bundle: `ownBundle`), so its
 * edges are the ones a press on the site hits; null without its type.
 */
function copyNow(p: Project, buildingId: Id) {
  const b = p.buildings.find((x) => x.id === buildingId)
  const t = b?.warehouse && typeOf(p, b.warehouse.type)
  if (!b?.warehouse || !t) return null
  const levels = levelsOf(b)
  const hall = p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')
  const w = copyOnPlan(t, b.warehouse, hall?.footprint)
  const o = ownBundle(t, w.overrides) ?? {}
  return { b, o, c: typeWith(t, o) }
}

/**
 * The element tools on a placed block (`putElements` on its box): that copy's only, its type never changed. From the
 * first, it keeps its own list (with the shape it is counted on, drawn on its box now), so its type's later element edits
 * no longer reach it until Back to type (`copyBackToType`). Nothing changed: the same project.
 */
export function putCopyElements(p: Project, buildingId: Id, kind: HallElement['kind'], edge: Id, modules: number[], on: boolean, name?: string): Project {
  return copyElementsEdited(p, buildingId, { op: on ? 'put' : 'take', edge, slots: modules, kind, ...(name !== undefined ? { name } : {}) }).project
}

/**
 * The Court tool on a placed block (`setEdgeCourt` on its box): that copy's own courts, its type never changed (an own
 * list, empty too: its type's no longer reach it). Not a depth, no such edge, or nothing changed: the same project. A
 * court's depth on the site stays the pill's (`Mass.courts`).
 */
export function setCopyEdgeCourt(p: Project, buildingId: Id, edge: Id, court: { depth?: number } | null): Project {
  const k = copyNow(p, buildingId)
  const courts = k && courtsSet(k.c, edge, court)
  if (!k || !courts || JSON.stringify(courts) === JSON.stringify(k.c.courts ?? [])) return p
  return setWarehouseOverrides(p, buildingId, { ...k.o, courts })
}

/** Back to type (Properties): a copy as its type again in every respect, its overrides gone (its own docks and courts
 *  among them) and its hall's own court depths (`Mass.courts`). Already so: the same project. */
export function copyBackToType(p: Project, buildingId: Id): Project {
  const b = p.buildings.find((x) => x.id === buildingId)
  if (!b?.warehouse) return p
  const q = setWarehouseOverrides(p, buildingId, null)
  const levels = levelsOf(b)
  const hall = q.masses.find((m) => levels.has(m.levelId) && m.part === 'hall' && m.courts)
  if (!hall) return q
  const { courts: _, ...plain } = hall
  return { ...q, masses: q.masses.map((m) => (m.id === hall.id ? plain : m)) }
}

// ---- A block's walls as the On edge engine's host (Phase D.3, Decision "On edge engine") --------------------------------

/** What an On edge op makes of a block's elements read as a type (`elementsEdited`): the list as it becomes (null: nothing changed), the edge whose depthless court a put dock drops, what it did beyond what was asked, or why it refused. */
interface ElementsEdit {
  elements: HallElement[] | null
  dock?: Id
  notes?: string[]
  reason?: string
}

const ELEMENT_KINDS: readonly string[] = ['dock', 'door', 'pattern']

/**
 * One On edge op on a block read as a type (a type, or a copy as its own: `typeWith`), whichever host writes it: put, take, slide, width and count,
 * `byRule` and a count by the dock rule (`dockRule.ts`). Pure: the list of elements it makes, never the project. A wall not along the grid refuses
 * with its reason; a refusal that has no words (nothing to change) is `elements: null`.
 */
function elementsEdited(t: WarehouseType, op: EdgeOp): ElementsEdit {
  const box = onBoxNow(t)
  // the dock rule reads the doors that stand (none on a chamfer's cut), as the views' presses do (review N4)
  const rule: RuleHost = { edges: box.edges, runs: hallRuns(t), doors: generate(t).doors }
  if (op.op === 'width') {
    if (!(Number.isFinite(op.width) && op.width > 0)) return { elements: null, reason: 'A width is more than 0 m' }
    const these = new Set(op.ids)
    const elements = t.elements.map((x) => (these.has(x.id) && x.width !== op.width ? { ...x, width: op.width } : x))
    return { elements: elements.some((x, i) => x !== t.elements[i]) ? elements : null }
  }
  if (op.op === 'slide') {
    if (!Number.isFinite(op.by) || Math.round(op.by) === 0) return { elements: null }
    if (!canSlide(box.elements, box.edges, op.ids, op.by)) return { elements: null, reason: 'They cannot slide that far: a wall’s end or another element is in the way' }
    const k = Math.round(op.by)
    const these = new Set(op.ids)
    return { elements: box.elements.map((x) => (these.has(x.id) ? { ...x, module: x.module + k } : x)) }
  }
  if (!ELEMENT_KINDS.includes(op.kind)) return { elements: null, reason: `A ${op.kind} does not stand on a wall` }
  const kind = op.kind as HallElement['kind']
  const e = box.edges.find((x) => x.id === op.edge)
  if (!e) return { elements: null, reason: 'That wall is not there' }
  if (e.axis === null) return { elements: null, reason: ANGLED_ELEMENTS }
  if (op.op === 'put' || op.op === 'take') {
    const slots = op.byRule && kind === 'dock' ? onDockRule(rule, e, op.slots) : op.slots
    const on = op.op === 'put'
    const elements = elementsPut(t, kind, op.edge, slots, on, op.name)
    return { elements, ...(on && kind === 'dock' ? { dock: op.edge } : {}) }
  }
  // a count: n of the kind on the wall, added or taken at one end of its run
  const n = Math.round(op.n)
  if (!(Number.isFinite(op.n) && n >= 0)) return { elements: null, reason: 'A count is a whole number, 0 or more' }
  const named = kind === 'pattern' ? (op.name ?? patternName(box.elements)) : undefined
  const held = box.elements.filter((x) => isOf(x, kind, op.edge, named)).map((x) => x.module).sort((a, b) => a - b)
  if (n === held.length) return { elements: null }
  if (n < held.length) {
    const drop = op.end === 'end' ? held.slice(n) : held.slice(0, held.length - n)
    return { elements: elementsPut(t, kind, op.edge, drop, false, named) }
  }
  const span = edgeModules(e)
  const all = Array.from({ length: span.hi - span.lo }, (_, i) => span.lo + i)
  const free = (kind === 'dock' ? onDockRule(rule, e, all) : all).filter((k) => !held.includes(k))
  // from the end of the run toward the wall's end; with none held, from that end of the wall
  const ahead = held.length === 0 ? free : op.end === 'end' ? free.filter((k) => k > held[held.length - 1]) : free.filter((k) => k < held[0])
  const ordered = op.end === 'end' && held.length === 0 ? [...ahead].reverse() : op.end === 'start' && held.length > 0 ? [...ahead].reverse() : ahead
  const add = ordered.slice(0, n - held.length)
  const notes = add.length < n - held.length ? [`Only ${held.length + add.length} fit on that wall`] : []
  return { elements: elementsPut(t, kind, op.edge, add, true, named), ...(kind === 'dock' ? { dock: op.edge } : {}), ...(notes.length ? { notes } : {}) }
}

/** An edit's write as the engine says it: the same project and its reason, or the new one and what it said. */
const edgeWrite = (q: Project, r: ElementsEdit): EdgeWrite => ({ project: q, ...(r.reason ? { reason: r.reason } : {}), ...(r.notes ? { notes: r.notes } : {}) })

/** A type's elements edited by an On edge op (`block-type` host): opens step 6 as `editStep` does. Nothing changed, or a refusal: the same project. */
export function editTypeEdge(p: Project, host: Ref, op: EdgeOp): EdgeWrite {
  const t = typeOf(p, host.id)
  if (!t) return { project: p, reason: 'That block is not there' }
  const r = elementsEdited(t, op)
  if (!r.elements) return edgeWrite(p, r)
  const courts = r.dock !== undefined ? docked(t.courts, r.dock) : t.courts
  if (op.op !== 'put' && op.op !== 'count') return edgeWrite(withElements(p, t, { ...t, elements: r.elements }), r)
  const { courts: _, ...rest } = t
  return edgeWrite(withElements(p, t, { ...(courts?.length ? { ...rest, courts } : rest), elements: r.elements }), r)
}

/** A copy's elements edited by an On edge op: that copy's own (its overrides: a variant), its type never changed (`putCopyElements`' rule). */
function copyElementsEdited(p: Project, buildingId: Id, op: EdgeOp): EdgeWrite {
  const k = copyNow(p, buildingId)
  if (!k) return { project: p, reason: 'That block is not there' }
  const r = elementsEdited(k.c, op)
  if (!r.elements) return edgeWrite(p, r)
  const courts = r.dock !== undefined ? docked(k.o.courts, r.dock) : k.o.courts
  const morphology = { ...k.o.morphology, ...shapeNow(k.c, hallRuns(k.c)) }
  return edgeWrite(setWarehouseOverrides(p, buildingId, { ...k.o, ...(courts ? { courts } : {}), morphology, elements: r.elements }), r)
}

/** The edit of a placed block's hall (`mass` host): the copy's own elements; a locked block refuses. */
export function editBlockEdge(p: Project, host: Ref, op: EdgeOp): EdgeWrite {
  const x = blockOf(p, host.id)
  if (!x) return { project: p, reason: 'That block is not there' }
  if (massIsLocked(p, x.m)) return { project: p, reason: 'That block is locked' }
  return copyElementsEdited(p, x.b.id, op)
}

/** A type's edges with their slots and elements, in its own frame (`block-type` host); null: no such type. */
export function typeEdgeOf(p: Project, host: Ref): EdgeRead | null {
  const t = typeOf(p, host.id)
  return t ? edgesRead(t, (q) => q, (q) => q) : null
}

/** A placed block's edges, in the site's frame (`mass` host: its hall); null for any other mass. */
export function blockEdgeOf(p: Project, host: Ref): EdgeRead | null {
  const x = blockOf(p, host.id)
  const k = x && copyNow(p, x.b.id)
  if (!x || !k) return null
  const [c, s] = cosSin(x.w.place.angle)
  const rotate = (q: Point): Point => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c })
  return edgesRead(k.c, (q) => ({ x: x.w.place.x + rotate(q).x, y: x.w.place.y + rotate(q).y }), rotate)
}

/**
 * The walls of a block as the On edge engine reads them: each along the grid with its whole modules (the slots, from the wall's low end, their bay as
 * the group), a wall not along the grid with its reason and no slots; the elements by slot. `place` takes a point of the type's frame to the
 * viewport's, `turn` a direction.
 */
function edgesRead(t: WarehouseType, place: (q: Point) => Point, turn: (q: Point) => Point): EdgeRead {
  const box = onBoxNow(t)
  const runs = hallRuns(t)
  const edges = box.edges.map((e): EdgeInfo => {
    const low = (e.horizontal ? e.a.x <= e.b.x : e.a.y <= e.b.y) ? e.a : e.b
    const along = e.horizontal ? low.x : low.y
    const info = {
      id: e.id,
      name: /^e(\d+)$/.test(e.id) ? e.id.toUpperCase() : `E${e.index + 1}`,
      a: place(e.a),
      b: place(e.b),
      out: turn(outwardOf(e.side)),
      origin: place(low),
      dir: turn(e.horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 }),
    }
    if (e.axis === null) return { ...info, slots: [], refused: ANGLED_ELEMENTS }
    const r = runAlongEdge(runs, e)
    const bays = baysOf(runs, e)
    const span = edgeModules(e)
    const slots = Array.from({ length: span.hi - span.lo }, (_, i) => {
      const k = span.lo + i
      return { k, from: lineAt(r, k) - along, to: lineAt(r, k + 1) - along, group: bays.findIndex((b) => b.includes(k)) }
    })
    return { ...info, slots }
  })
  const open = new Set(edges.filter((e) => !e.refused).map((e) => e.id))
  const elements = box.elements.filter((x) => open.has(x.edge)).map((x) => ({ id: x.id, kind: x.kind, ...(x.name !== undefined ? { name: x.name } : {}), edge: x.edge, slot: x.module, width: x.width }))
  return { edges, elements }
}
