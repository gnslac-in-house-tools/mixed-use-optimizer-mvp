// The edits (Decision "Agent tools"): the app's verbs an agent may call, each one undo step, through `actions` (so
// the decision log names the verb). Their inputs name things by id (getProject lists them); a missing id says what
// there is. Distances in metres, angles in degrees counter-clockwise.
import { z } from 'zod'
import { allLevels, buildingOfLevel } from '../../engine/buildings.ts'
import { polygonFootprint } from '../../engine/geom/draw.ts'
import { intersection } from '../../engine/geom/boolean.ts'
import { footprintContour, footprintPolygon } from '../../engine/geom/footprint.ts'
import { HOLE_MIN } from '../../engine/geom/holes.ts'
import { vertexTs } from '../../engine/geom/perimeter.ts'
import { dockableWalls } from '../../modules/docks/engine/docks.ts'
import { contourFromPolygon } from '../../engine/geom/contour.ts'
import { area, isSimple, signedArea } from '../../engine/geom/polygon.ts'
import { massIsLocked } from '../../kinds/locked.ts'
import { DocksSchema, ParkingSideSchema, StandardsSchema, StreetParkingSchema, VEHICLES, type Contour, type Footprint, type GateOn, type Id, type Lot, type Point, type Project } from '../../model/schema.ts'
import { facingOf, wallsOf } from '../../modules/parking/engine/lots.ts'
import { pulledLanes, storedLanes } from '../../engine/path/lanes.ts'
import type { Stretch } from '../../engine/path/types.ts'
import { actions } from '../../state/actions/index.ts'
import { need, tool, ToolError, type Tool, type ToolContext } from './tool.ts'

type Made = Project | { project: Project; [k: string]: unknown } | null

/** An edit: the verb's result, with what it made (an id) for the agent; null: the verb refused it. */
function edit<I>(t: Omit<Tool<I>, 'kind' | 'run'> & { apply(p: Project, input: I, ctx: ToolContext): Made }) {
  const { apply, ...rest } = t
  return tool<I>({
    ...rest,
    kind: 'edit',
    run(p, input, ctx) {
      const r = apply(p, input, ctx)
      if (r === null) throw new ToolError(`${t.name} was refused: the shape or the place does not work.`)
      // a verb returns the project, or the project with what it made
      if ('masses' in r) return { project: r as Project, output: r === p ? 'Nothing changed.' : 'Done.' }
      const { project, ...made } = r as { project: Project; [k: string]: unknown }
      return { project, output: project === p ? 'Nothing changed.' : { done: true, ...made } }
    },
  })
}

const ID = z.string()
const MASS = ID.describe('A mass id')
const MASSES = z.array(ID).min(1).describe('Mass ids')
const PROGRAM = ID.describe('A program id')
const OPTION = ID.optional().describe('An option id; absent: the one in view')
/** A parking lot's own sizes (Decision "Lot tool"), over the standards'. */
const LOT_SIZES = z
  .object({ stallWidth: z.number().positive(), stallDepth: z.number().positive(), aisleWidth: z.number().positive() })
  .partial()
  .optional()
  .describe('Its own stall width, stall depth and aisle width (m), over the standards’')
const LEVEL = ID.optional().describe('A level id; absent: the one in view')

const mass = (p: Project, id: Id) => need(p.masses, id, 'mass')
const masses = (p: Project, ids: Id[]) => ids.map((id) => mass(p, id).id)
/**
 * A locked mass is not changed by any tool (the padlock is CAD's; settle.ts holds every field of it): a tool that would
 * change one says so, in these words, instead of "the shape or the place does not work". `groups`: its group's members
 * count too (grouping or ungrouping would change them).
 */
function notLocked(p: Project, ids: Id[], groups = false): Id[] {
  const asked = p.masses.filter((m) => ids.includes(m.id))
  const near = groups ? p.masses.filter((m) => asked.some((a) => a.id === m.id || (a.group !== undefined && a.group === m.group))) : asked
  const locked = near.filter((m) => massIsLocked(p, m))
  if (locked.length > 0) throw lockedError(locked.map((m) => m.name), 'lockMasses')
  return ids
}

/** The refusal of a tool that would change locked things (the padlock is CAD's; settle.ts holds it anyway): the same words for every kind. */
function lockedError(names: string[], unlockWith: string): ToolError {
  const one = names.length === 1
  return new ToolError(`${names.join(', ')} ${one ? 'is' : 'are'} locked: unlock ${one ? 'it' : 'them'} (${unlockWith}) to change ${one ? 'it' : 'them'}.`)
}

/** Street segments of the option the tools may change: none of them locked (lockStreets frees them). */
function freeSegments(p: Project, optionId: Id, ids: Id[]): Id[] {
  const locked = (p.options.find((o) => o.id === optionId)?.streets?.segments ?? []).filter((g) => ids.includes(g.id) && g.locked === true)
  if (locked.length > 0) throw lockedError(locked.map((g) => `Street segment ${g.id}`), 'lockStreets')
  return ids
}

/** A gate of the option the tools may change: not locked (lockGates frees it). */
function freeGate(p: Project, optionId: Id, id: Id): Id {
  const g = (p.options.find((o) => o.id === optionId)?.gates ?? p.site.gates ?? []).find((x) => x.id === id)
  if (g?.locked === true) throw lockedError([`Gate ${g.id}`], 'lockGates')
  return id
}

/** Lots of the option the tools may change: none locked (lockLots frees them). */
function freeLots(p: Project, optionId: Id, ids: Id[]): Id[] {
  const locked = (p.options.find((o) => o.id === optionId)?.lots ?? []).filter((l) => ids.includes(l.id) && l.locked === true)
  if (locked.length > 0) throw lockedError(locked.map((l) => l.name), 'lockLots')
  return ids
}

/** A level the tools may change: its building is not locked (lockBuildings frees it). */
function freeLevel(p: Project, levelId: Id): Id {
  const b = buildingOfLevel(p, levelId)
  if (b) freeBuilding(p, b.id)
  return levelId
}

/** A building the tools may change (its data, its levels): not locked (lockBuildings frees it). */
function freeBuilding(p: Project, id: Id): Id {
  const b = p.buildings.find((x) => x.id === id)
  if (b?.locked === true) throw lockedError([b.name], 'lockBuildings')
  return id
}
const program = (p: Project, id: Id) => need(p.programs, id, 'program').id
const option = (p: Project, ctx: ToolContext, id?: Id) => need(p.options, id ?? ctx.option, 'option').id
const building = (p: Project, id: Id) => need(p.buildings, id, 'building').id
const level = (p: Project, ctx: ToolContext, id?: Id) => need(allLevels(p), id ?? ctx.level, 'level').id
const rule = (p: Project, id: Id) => need(p.rules, id, 'rule').id
/** The side of a mass's box (Decision "Lot tool") that faces this way: the nearest to it. */
function sideFacing(p: Project, massId: Id, facing: 'north' | 'east' | 'south' | 'west'): NonNullable<Lot['anchor']>['side'] {
  const way = { north: { x: 0, y: 1 }, east: { x: 1, y: 0 }, south: { x: 0, y: -1 }, west: { x: -1, y: 0 } }[facing]
  const walls = wallsOf(footprintPolygon(mass(p, massId).footprint))
  if (walls.length === 0) throw new ToolError('That mass has no outline to stand a lot against.')
  const best = walls.reduce((a, b) => (b.out.x * way.x + b.out.y * way.y > a.out.x * way.x + a.out.y * way.y ? b : a))
  if (facingOf(best.out) !== facing && best.out.x * way.x + best.out.y * way.y < 0.5) throw new ToolError(`No wall of that mass faces ${facing}.`)
  return best.side
}
const gate = (p: Project, optionId: Id, id: Id) => need(p.options.find((o) => o.id === optionId)?.gates ?? p.site.gates, id, 'gate').id

// ---- Masses ----

const RECT = {
  x: z.number().describe('Centre, east'),
  y: z.number().describe('Centre, north'),
  width: z.number().positive().describe('Along its own x axis, before rotation'),
  depth: z.number().positive().describe('Along its own y axis, before rotation'),
}

const massTools = [
  edit({
    name: 'addMass',
    description:
      'Adds a rectangular block of a program (a building of its own, in the option in view): the rectangle is its outer face, its walls inside it, its grid along the rectangle. Its type is the program’s, made from the typology’s defaults the first time (the first block of a type is the type itself, the later ones its variants). It has no docks: they go on its walls in the block editor. null: no program. Returns the id of its mass.',
    verbs: ['drawBlock'],
    input: z.object({ program: PROGRAM.nullable(), ...RECT, rotation: z.number().default(0), level: LEVEL, name: z.string().optional().describe('Its building’s name'), height: z.number().positive().optional() }),
    apply(p, i, ctx) {
      const r = actions.drawBlock(p, {
        programId: i.program === null ? null : program(p, i.program),
        footprint: { kind: 'rect', center: { x: i.x, y: i.y }, width: i.width, depth: i.depth, rotation: i.rotation },
        levelId: level(p, ctx, i.level),
        optionId: ctx.option,
        name: i.name,
        height: i.height,
      })
      if (!r) throw new ToolError('That rectangle is too small to hold a block’s walls.')
      return { project: r.project, id: r.id }
    },
  }),
  edit({
    name: 'updateMass',
    description:
      'Changes a mass: its name, program or height, and for a rectangle its centre, width, depth or rotation (its area changes with width and depth; a block’s width and depth stretch its box: its walls move by the difference, as moveWall does). A locked mass is not changed by any tool: unlock it first (lockMasses).',
    verbs: ['updateMass'],
    input: z.object({
      mass: MASS,
      name: z.string().optional(),
      program: PROGRAM.nullable().optional(),
      height: z.number().positive().optional(),
      x: RECT.x.optional(),
      y: RECT.y.optional(),
      width: RECT.width.optional(),
      depth: RECT.depth.optional(),
      rotation: z.number().optional(),
    }),
    apply(p, i) {
      const m = mass(p, i.mass)
      if (massIsLocked(p, m) && (i.name !== undefined || i.program !== undefined)) throw new ToolError(`${m.name} is locked: unlock it (lockMasses) to change its name or its program.`)
      const shape = [i.x, i.y, i.width, i.depth, i.rotation].some((v) => v !== undefined)
      let footprint: Footprint | undefined
      if (shape) {
        if (m.footprint.kind !== 'rect') throw new ToolError(`${m.name} is not a rectangle: move it with moveMass, turn it with rotateMass.`)
        const f = m.footprint
        // a block's size is its box's (its place is free): a width or depth that is not its own goes through its outline, as its walls move, not around it
        const resized = (i.width !== undefined && i.width !== f.width) || (i.depth !== undefined && i.depth !== f.depth)
        if (resized && actions.blockWalls(p, m.id)) {
          let q = p
          for (const [wall, by] of [[1, (i.width ?? f.width) - f.width], [2, (i.depth ?? f.depth) - f.depth]] as const) {
            if (by === 0) continue
            const r = actions.moveWall(q, m.id, wall, by)
            if (r.reason && r.applied === 0) throw new ToolError(r.reason)
            q = r.project
          }
          // its place after: where it was asked, whatever its box grew by
          const g = q.masses.find((x) => x.id === m.id)!.footprint
          return actions.updateMass(q, m.id, {
            ...(i.name !== undefined && { name: i.name }),
            ...(i.program !== undefined && { programId: i.program === null ? null : program(p, i.program) }),
            ...(i.height !== undefined && { height: i.height }),
            ...(g.kind === 'rect' && (i.x !== undefined || i.y !== undefined || i.rotation !== undefined) && { footprint: { ...g, center: { x: i.x ?? g.center.x, y: i.y ?? g.center.y }, rotation: i.rotation ?? g.rotation } }),
          })
        }
        footprint = { ...f, center: { x: i.x ?? f.center.x, y: i.y ?? f.center.y }, width: i.width ?? f.width, depth: i.depth ?? f.depth, rotation: i.rotation ?? f.rotation }
      }
      return actions.updateMass(p, m.id, {
        ...(i.name !== undefined && { name: i.name }),
        ...(i.program !== undefined && { programId: i.program === null ? null : program(p, i.program) }),
        ...(i.height !== undefined && { height: i.height }),
        ...(footprint && { footprint }),
      })
    },
  }),
  edit({
    name: 'moveMass',
    description: 'Moves a mass by dx, dy (and the masses attached to it).',
    verbs: ['moveMass'],
    input: z.object({ mass: MASS, dx: z.number(), dy: z.number() }),
    apply: (p, i) => actions.moveMass(p, mass(p, i.mass).id, { x: i.dx, y: i.dy }),
  }),
  edit({
    name: 'moveMasses',
    description: 'Moves several masses together by dx, dy.',
    verbs: ['moveMasses'],
    input: z.object({ masses: MASSES, dx: z.number(), dy: z.number() }),
    apply: (p, i) => actions.moveMasses(p, masses(p, i.masses), { x: i.dx, y: i.dy }),
  }),
  edit({
    name: 'rotateMass',
    description: 'Turns a mass about its centre.',
    verbs: ['rotateMass'],
    input: z.object({ mass: MASS, degrees: z.number() }),
    apply: (p, i) => actions.rotateMass(p, mass(p, i.mass).id, i.degrees),
  }),
  edit({
    name: 'rotateMasses',
    description: 'Turns several masses together about their common centre.',
    verbs: ['rotateMasses'],
    input: z.object({ masses: MASSES, degrees: z.number() }),
    apply: (p, i) => actions.rotateMasses(p, masses(p, i.masses), i.degrees),
  }),
  edit({
    name: 'moveWall',
    description: 'Pushes one wall of a mass out (d > 0) or in (d < 0); wall i runs from corner i to corner i + 1. A block’s box wall stretches its box by d metres; any other wall of it moves alone.',
    verbs: ['moveWall'],
    input: z.object({ mass: MASS, wall: z.number().int().min(0), d: z.number() }),
    apply(p, i) {
      const id = mass(p, i.mass).id
      const r = actions.moveWall(p, id, i.wall, i.d)
      // a block's wall that cannot move says why
      if (r.applied === 0 && r.reason && actions.blockWalls(p, id)) throw new ToolError(r.reason)
      return r
    },
  }),
  edit({
    name: 'copyMass',
    description: 'Copies a mass, moved by dx, dy. Returns the copy’s id. A block is copied whole: a new block of its type, a building of its own (the id is its hall’s).',
    verbs: ['copyMass'],
    input: z.object({ mass: MASS, dx: z.number(), dy: z.number() }),
    apply(p, i, ctx) {
      const m = mass(p, i.mass)
      const d = { x: i.dx, y: i.dy }
      // a block's hall is not copied as a plain mass: its copy is a new block (the same copy Duplicate and Paste make)
      if (!actions.isBlockMass(p, m)) return actions.copyMass(p, m, d)
      const r = actions.copyWithBlocks(p, [m], d, ctx.option)
      if (r.blocks.length === 0 || r.ids.length === 0) throw new ToolError(`${m.name} could not be copied there.`)
      return { project: r.project, id: r.ids[0] }
    },
  }),
  edit({
    name: 'removeMasses',
    description: 'Deletes masses (a locked one refuses it: unlock it first, lockMasses).',
    verbs: ['removeMasses'],
    input: z.object({ masses: MASSES }),
    apply: (p, i) => actions.removeMasses(p, masses(p, i.masses)),
  }),
  edit({
    name: 'lockMasses',
    description: 'Locks masses (a locked mass is seen and is not changed by any tool: its shape, place, name, program, docks, courts and doors stay) or frees them (a mass of a locked building stays locked with it: it is freed with lockBuildings).',
    verbs: ['lockMasses'],
    input: z.object({ masses: MASSES, locked: z.boolean() }),
    apply(p, i) {
      const ids = masses(p, i.masses)
      // a mass of a locked building stays locked with it: freeing the mass alone would say nothing, so the tool says whose padlock holds it
      if (!i.locked) {
        for (const id of ids) {
          const m = mass(p, id)
          const b = p.buildings.find((x) => x.locked === true && x.levels.some((l) => l.id === m.levelId))
          if (b) throw new ToolError(`${m.name} is locked with its building: unlock ${b.name} (lockBuildings) to unlock it.`)
        }
      }
      return actions.lockMasses(p, ids, i.locked)
    },
  }),
  edit({
    name: 'groupMasses',
    description: 'Groups masses: they are picked, moved and turned as one.',
    verbs: ['groupMasses'],
    input: z.object({ masses: MASSES }),
    apply: (p, i) => actions.groupMasses(p, notLocked(p, masses(p, i.masses), true)),
  }),
  edit({
    name: 'ungroupMasses',
    description: 'Takes masses out of their groups.',
    verbs: ['ungroupMasses'],
    input: z.object({ masses: MASSES }),
    apply: (p, i) => actions.ungroupMasses(p, notLocked(p, masses(p, i.masses), true)),
  }),
  edit({
    name: 'mergeMasses',
    description:
      'Merges masses that touch (share a wall or overlap), on one level, into one mass: a boolean union of their outlines, so no walls split it; a court they close becomes a hole. It keeps the first one’s id, name, program and height; the others go. Unlike groupMasses, the shape becomes one. Blocks join when they are of one type (into the first’s own outline, a variant of its type); blocks of two types are refused: give them one type first.',
    verbs: ['mergeMasses', 'mergeBlocks'],
    input: z.object({ masses: MASSES.min(2) }),
    apply(p, i) {
      const ids = masses(p, i.masses)
      const picked = p.masses.filter((m) => ids.includes(m.id))
      // blocks: each a building of its own, so no one level; they say why not
      const blocks = actions.mergeBlocks(p, ids)
      if (blocks && 'reason' in blocks) throw new ToolError(`${blocks.reason}.`)
      if (!blocks && picked.some((m) => m.levelId !== picked[0].levelId)) throw new ToolError('They stand on different levels: merge masses of one level.')
      const r = actions.mergeMasses(p, ids)
      if (!r) throw new ToolError('They do not all touch: merge masses that share a wall or overlap.')
      return r
    },
  }),
  edit({
    name: 'moveMassToLevel',
    description: 'Moves a mass one level up (1) or down (-1) in its building.',
    verbs: ['moveMassToLevel'],
    input: z.object({ mass: MASS, direction: z.union([z.literal(1), z.literal(-1)]) }),
    apply: (p, i) => actions.moveMassToLevel(p, notLocked(p, [mass(p, i.mass).id])[0], i.direction),
  }),
]

// ---- Shapes, point by point (Phase H.0): the Mass tool's polygon and the corner handles, for an agent ----

const POINTS = z
  .array(z.object({ x: z.number(), y: z.number() }))
  .min(3)
  .describe('The outline corner by corner, in order around it (either way round); the first is not repeated at the end')
const CORNER = z.number().int().min(0).describe('A corner index, from getMassOutline')

/** The points as a footprint, as the Mass tool closes them: four on a square box stay a rectangle. */
function outline(points: Point[]): Footprint {
  const [first, last] = [points[0], points[points.length - 1]]
  const ring = points.length > 3 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-6 ? points.slice(0, -1) : points
  // corners on one line read as a spike, a crossing: say what it is
  const f = area(ring) < 1e-6 ? null : polygonFootprint(ring)
  if (f === 'crossing') throw new ToolError('The outline crosses itself: give its corners in order around it.')
  if (f === null) throw new ToolError('The outline encloses nothing: it needs 3 or more corners not on one line.')
  return f
}

/** Corner i of a mass, or what there is. */
function corner(p: Project, id: Id, i: number): Id {
  const m = mass(p, id)
  const n = footprintContour(m.footprint).vertices.length
  if (i >= n) throw new ToolError(`${m.name} has ${n} corners, 0 to ${n - 1}: getMassOutline lists them.`)
  return m.id
}

// ---- Holes (Phase H.5): a mass's courts, point by point, and the corridors round them ----

const HOLE = z.number().int().min(0).describe('A hole index, from getMassOutline')
const CORRIDOR = z.number().nonnegative().describe('m: the width of a corridor round the hole, inside the mass; 0 = none')
const HOLE_INPUT = z.object({ points: POINTS, corridor: CORRIDOR.optional() })

/** The points as a hole's outline (as a mass's: checked the same way). */
const holeOutline = (points: Point[]): Contour => footprintContour(outline(points))

/** Hole k of a mass, or what there is. */
function hole(p: Project, id: Id, k: number): Id {
  const m = mass(p, id)
  const n = m.holes?.length ?? 0
  if (k >= n)
    throw new ToolError(n === 0 ? `${m.name} has no holes.` : n === 1 ? `${m.name} has one hole, 0.` : `${m.name} has ${n} holes, 0 to ${n - 1}: getMassOutline lists them.`)
  return m.id
}

/** Cuts a hole of `points` in mass id, with its corridor; refused when it falls outside the mass. */
function withNewHole(p: Project, id: Id, points: Point[], corridor?: number): { project: Project; k: number } {
  const c = holeOutline(points)
  const m = p.masses.find((x) => x.id === id)!
  const inside = intersection([footprintPolygon(m.footprint)], [footprintPolygon({ kind: 'contour', contour: c })]).reduce((s, r) => s + Math.abs(signedArea(r[0])), 0)
  if (inside < HOLE_MIN) throw new ToolError(`The hole falls outside ${m.name}: give corners inside its outline.`)
  const r = actions.addHole(p, id, c)
  if (!r) throw new ToolError(`The hole falls outside ${m.name}: give corners inside its outline.`)
  return corridor ? { project: actions.setHoleCorridor(r.project, id, r.k, corridor), k: r.k } : r
}

/** A shape verb returns the same project when the geometry rejects the edit: say so. */
/** Why a corner edit failed: what its mass says it refuses (a block’s outline is free: it refuses nothing); else the tool’s own text. */
const whyNot = (p: Project, ref: string, own: string) => actions.refusalOf(p, mass(p, ref).id) ?? own

const shaped = (p: Project, q: Project, why: string) => {
  if (q === p) throw new ToolError(why)
  return q
}

const shapeTools = [
  edit({
    name: 'addMassFromPoints',
    description:
      'Adds a block of any shape (an L, a trapezoid, one that follows the site) from its corners, point by point, on a level, with holes (courts) if asked, each with a corridor round it: the outline is its outer face, its grid along its longest straight wall (a rectangle’s own sides). A building of its own, of its program’s type (as addMass). Returns the id of its mass. Four corners on a square box make a rectangle.',
    verbs: ['drawBlock'],
    input: z.object({
      program: PROGRAM.nullable(),
      points: POINTS,
      holes: z.array(HOLE_INPUT).optional().describe('Its holes (courts), each point by point inside it, with a corridor round it if asked'),
      level: LEVEL,
      name: z.string().optional(),
      height: z.number().positive().optional(),
    }),
    apply(p, i, ctx) {
      const footprint = outline(i.points)
      const out = footprintPolygon(footprint)
      // its holes are cuts of its outer face, inside it
      const holes = (i.holes ?? []).map((h) => {
        const c = holeOutline(h.points)
        const inside = intersection([out], [footprintPolygon({ kind: 'contour', contour: c })]).reduce((s, r) => s + Math.abs(signedArea(r[0])), 0)
        if (inside < HOLE_MIN) throw new ToolError('The hole falls outside the block: give corners inside its outline.')
        return h.corridor ? { ...c, corridor: h.corridor } : c
      })
      const r = actions.drawBlock(p, {
        programId: i.program === null ? null : program(p, i.program),
        footprint,
        holes,
        levelId: level(p, ctx, i.level),
        optionId: ctx.option,
        name: i.name,
        height: i.height,
      })
      if (!r) throw new ToolError('That outline is too small to hold a block’s walls.')
      if (r.dropped > 0) throw new ToolError('The hole falls outside the block: give corners inside its outline.')
      return { project: r.project, id: r.id }
    },
  }),
  edit({
    name: 'setMassOutline',
    description:
      'Redraws a mass’s outline from its corners, point by point; it keeps its name, program, level and height. The corners come out sharp: a redraw does not keep a radius or a chamfer the old outline had. A block takes it as its own outline, at any angle (its grid clipped by it, a variant of its type): its walls and what stands on them (docks, doors, patterns, truck courts) stay on the walls it lies along, and a wall that is not along the grid keeps none.',
    verbs: ['updateMass', 'setBlockOutline'],
    input: z.object({ mass: MASS, points: POINTS }),
    apply(p, i) {
      const id = mass(p, i.mass).id
      const footprint = outline(i.points)
      // a block's outline is its own: it is drawn on its grid, not written around it
      const block = actions.setBlockOutline(p, id, footprintPolygon(footprint))
      if (block) {
        if (block.reason && block.project === p) throw new ToolError(block.reason)
        return block.project
      }
      return actions.updateMass(p, id, { footprint })
    },
  }),
  edit({
    name: 'moveVertex',
    description: 'Moves one corner of a mass to x, y. A rectangle stays one (its opposite corner stays); any other shape moves that corner only.',
    verbs: ['moveVertex'],
    input: z.object({ mass: MASS, corner: CORNER, x: z.number(), y: z.number() }),
    apply: (p, i) =>
      shaped(p, actions.moveVertex(p, corner(p, i.mass, i.corner), i.corner, { x: i.x, y: i.y }), whyNot(p, i.mass, 'The corner cannot go there: the outline would cross itself or flip.')),
  }),
  edit({
    name: 'insertVertex',
    description:
      'Adds a corner on wall i (from corner i to i + 1), at the point of the wall closest to x, y; it becomes corner i + 1. Move it out with moveVertex to make a notch or a bend.',
    verbs: ['insertVertex'],
    input: z.object({ mass: MASS, wall: z.number().int().min(0).describe('A wall index, from getMassOutline'), x: z.number(), y: z.number() }),
    apply: (p, i) => shaped(p, actions.insertVertex(p, corner(p, i.mass, i.wall), i.wall, { x: i.x, y: i.y }), whyNot(p, i.mass, 'A corner is already there.')),
  }),
  edit({
    name: 'removeVertex',
    description: 'Takes a corner out of a mass: its two walls become one. A shape keeps at least 3 corners.',
    verbs: ['removeVertex'],
    input: z.object({ mass: MASS, corner: CORNER }),
    apply: (p, i) => shaped(p, actions.removeVertex(p, corner(p, i.mass, i.corner), i.corner), 'That corner cannot go: the shape needs 3 corners, and it must not cross itself.'),
  }),
  edit({
    name: 'setCornerRadius',
    description:
      'Rounds one corner of a mass with a radius in metres; a radius over 0 takes a chamfer on that corner away, and 0 (sharp) leaves a chamfer as it is: no tool sets or clears a chamfer (the designer’s Chamfer tool does; getMassOutline shows it).',
    verbs: ['setCornerRadius'],
    input: z.object({ mass: MASS, corner: CORNER, radius: z.number().nonnegative() }),
    apply(p, i) {
      const id = corner(p, i.mass, i.corner)
      return actions.setCornerRadius(p, id, i.corner, i.radius)
    },
  }),
]

const holeTools = [
  edit({
    name: 'addHole',
    description: 'Cuts a hole (a court, a light well) in a mass from its corners, point by point, inside its outline, with a corridor round it if asked. Returns its index.',
    verbs: ['addHole', 'setHoleCorridor'],
    input: z.object({ mass: MASS, points: POINTS, corridor: CORRIDOR.optional() }),
    apply: (p, i) => withNewHole(p, mass(p, i.mass).id, i.points, i.corridor),
  }),
  edit({
    name: 'setHoleCorridor',
    description: 'Sets the width of the corridor round a hole, inside the mass (0 = none); its area counts in the Corridors KPI.',
    verbs: ['setHoleCorridor'],
    input: z.object({ mass: MASS, hole: HOLE, width: CORRIDOR }),
    apply: (p, i) => actions.setHoleCorridor(p, hole(p, i.mass, i.hole), i.hole, i.width),
  }),
  edit({
    name: 'setHoleOutline',
    description: 'Redraws a hole from its corners, point by point; its corridor stays.',
    verbs: ['setHole'],
    input: z.object({ mass: MASS, hole: HOLE, points: POINTS }),
    apply(p, i) {
      const id = hole(p, i.mass, i.hole)
      const corridor = p.masses.find((m) => m.id === id)!.holes![i.hole].corridor
      const q = actions.setHole(p, id, i.hole, holeOutline(i.points))
      return corridor ? actions.setHoleCorridor(q, id, i.hole, corridor) : q
    },
  }),
  edit({
    name: 'moveHole',
    description: 'Moves a hole by dx, dy (its corridor with it).',
    verbs: ['moveHole'],
    input: z.object({ mass: MASS, hole: HOLE, dx: z.number(), dy: z.number() }),
    apply: (p, i) => actions.moveHole(p, hole(p, i.mass, i.hole), i.hole, { x: i.dx, y: i.dy }),
  }),
  edit({
    name: 'copyHole',
    description: 'Copies a hole of a mass, moved by dx, dy (without its corridor). Returns the copy’s index.',
    verbs: ['copyHole'],
    input: z.object({ mass: MASS, hole: HOLE, dx: z.number(), dy: z.number() }),
    apply: (p, i) => actions.copyHole(p, hole(p, i.mass, i.hole), i.hole, { x: i.dx, y: i.dy }),
  }),
  edit({
    name: 'removeHole',
    description: 'Fills a hole in: the mass is whole there again (its corridor goes too). The holes after it move down one index.',
    verbs: ['removeHole'],
    input: z.object({ mass: MASS, hole: HOLE }),
    apply: (p, i) => actions.removeHole(p, hole(p, i.mass, i.hole), i.hole),
  }),
  edit({
    name: 'moveHoleVertex',
    description: 'Moves one corner of a hole to x, y.',
    verbs: ['moveHoleVertex'],
    input: z.object({ mass: MASS, hole: HOLE, corner: CORNER, x: z.number(), y: z.number() }),
    apply: (p, i) => shaped(p, actions.moveHoleVertex(p, hole(p, i.mass, i.hole), i.hole, i.corner, { x: i.x, y: i.y }), 'The corner cannot go there: the hole would cross itself or flip.'),
  }),
  edit({
    name: 'insertHoleVertex',
    description: 'Adds a corner on wall i of a hole (from corner i to i + 1), at the point of the wall closest to x, y; it becomes corner i + 1.',
    verbs: ['insertHoleVertex'],
    input: z.object({ mass: MASS, hole: HOLE, wall: z.number().int().min(0), x: z.number(), y: z.number() }),
    apply: (p, i) => shaped(p, actions.insertHoleVertex(p, hole(p, i.mass, i.hole), i.hole, i.wall, { x: i.x, y: i.y }), 'A corner is already there.'),
  }),
  edit({
    name: 'removeHoleVertex',
    description: 'Takes a corner out of a hole: its two walls become one. A hole keeps at least 3 corners.',
    verbs: ['removeHoleVertex'],
    input: z.object({ mass: MASS, hole: HOLE, corner: CORNER }),
    apply(p, i) {
      const r = actions.removeHoleVertex(p, hole(p, i.mass, i.hole), i.hole, i.corner)
      if (r.reason) throw new ToolError(`That corner cannot go: ${r.reason}.`)
      return r.project
    },
  }),
  edit({
    name: 'moveHoleWall',
    description: 'Pushes one wall of a hole out (d > 0, a bigger hole) or in (d < 0); wall i runs from corner i to corner i + 1.',
    verbs: ['moveHoleWall'],
    input: z.object({ mass: MASS, hole: HOLE, wall: z.number().int().min(0), d: z.number() }),
    apply: (p, i) => actions.moveHoleWall(p, hole(p, i.mass, i.hole), i.hole, i.wall, i.d),
  }),
]

// ---- The brief's rules and Solve ----

const RULE_FIELDS = {
  kind: z.enum(['adjacent', 'near', 'apart', 'attached']).describe('adjacent: share a wall · near: within max m · apart: at least min m · attached: moves with it'),
  a: PROGRAM.describe('The program the rule speaks of: each of its masses…'),
  b: PROGRAM.describe('…towards its nearest mass of this program (may be the same)'),
  weight: z.number().positive().optional().describe('Priority when arranging; default 1'),
  required: z.boolean().optional().describe('Broken, it is an error (else a warning)'),
  reason: z.string().optional().describe('Why, in plain words'),
  minShared: z.number().nonnegative().optional().describe('adjacent: the shared wall, m'),
  max: z.number().nonnegative().optional().describe('near: the most distance, m'),
  min: z.number().nonnegative().optional().describe('apart: the least distance, m'),
}

const ruleTools = [
  edit({
    name: 'addRule',
    description: 'Adds a rule of the brief between two programs. Returns its id.',
    verbs: ['addRule'],
    input: z.object(RULE_FIELDS),
    apply: (p, i) => actions.addRule(p, { ...i, a: program(p, i.a), b: program(p, i.b) }),
  }),
  edit({
    name: 'updateRule',
    description: 'Changes a rule of the brief.',
    verbs: ['updateRule'],
    input: z.object({ rule: ID.describe('A rule id'), ...z.object(RULE_FIELDS).partial().shape }),
    apply: (p, { rule: id, ...patch }) => actions.updateRule(p, rule(p, id), patch),
  }),
  edit({
    name: 'removeRule',
    description: 'Deletes a rule of the brief.',
    verbs: ['removeRule'],
    input: z.object({ rule: ID.describe('A rule id') }),
    apply: (p, i) => actions.removeRule(p, rule(p, i.rule)),
  }),
  edit({
    name: 'solve',
    description: '▶ Solve: places the masses the brief still asks for where their rules ask, biggest programs first, then slides the option’s masses to meet the rules. Returns what it placed and how many found no room.',
    verbs: ['solve'],
    input: z.object({ option: OPTION, level: LEVEL }),
    apply: (p, i, ctx) => actions.solve(p, option(p, ctx, i.option), level(p, ctx, i.level)),
  }),
  edit({
    name: 'arrange',
    description: 'Slides the option’s masses to meet the brief’s rules, the smaller of each pair moving; places nothing new.',
    verbs: ['arrange'],
    input: z.object({ option: OPTION }),
    apply: (p, i, ctx) => actions.arrange(p, option(p, ctx, i.option)),
  }),
  edit({
    name: 'addFromBrief',
    description: 'Adds the masses the brief still asks for (of one program, or all), placed by their rules: each a block (a building of its own, no docks until they are put on its walls in the block editor).',
    verbs: ['addFromBrief'],
    input: z.object({ program: PROGRAM.optional(), option: OPTION, level: LEVEL }),
    apply: (p, i, ctx) => actions.addFromBrief(p, option(p, ctx, i.option), level(p, ctx, i.level), i.program && program(p, i.program)),
  }),
]

// ---- Programs and the brief ----

const programTools = [
  edit({
    name: 'addProgram',
    description: 'Adds a program (a use: warehouse, office, yard…). Returns its id.',
    verbs: ['addProgram'],
    input: z.object({ name: z.string().optional(), built: z.boolean().optional().describe('A building (true) or open ground (false)') }),
    apply: (p, i) => actions.addProgram(p, i),
  }),
  edit({
    name: 'updateProgram',
    description: 'Renames a program, or says whether it is built.',
    verbs: ['updateProgram'],
    input: z.object({ program: PROGRAM, name: z.string().optional(), built: z.boolean().optional() }),
    apply: (p, { program: id, ...patch }) => actions.updateProgram(p, program(p, id), patch),
  }),
  edit({
    name: 'setProgramTarget',
    description: 'What the brief asks of a program: its floor area in m² and how many masses (null: not asked).',
    verbs: ['setProgramTarget'],
    input: z.object({ program: PROGRAM, area: z.number().nonnegative().nullable().optional(), count: z.number().int().nonnegative().nullable().optional() }),
    apply: (p, { program: id, ...patch }) => actions.setProgramTarget(p, program(p, id), patch),
  }),
  edit({
    name: 'removeProgram',
    description: 'Deletes a program; withMasses also deletes its masses (else they keep no program).',
    verbs: ['removeProgram'],
    input: z.object({ program: PROGRAM, withMasses: z.boolean().default(false) }),
    apply: (p, i) => actions.removeProgram(p, program(p, i.program), i.withMasses),
  }),
  edit({
    name: 'updateBriefFromDesign',
    description: 'Sets the brief to what the option has (one program, or all): its areas and counts.',
    verbs: ['updateBriefFromDesign'],
    input: z.object({ program: PROGRAM.optional(), option: OPTION }),
    apply: (p, i, ctx) => actions.updateBriefFromDesign(p, option(p, ctx, i.option), i.program && program(p, i.program)),
  }),
]

// ---- Options, buildings and levels ----

const optionTools = [
  edit({
    name: 'addOption',
    description: 'Adds a design option, showing these buildings (absent: none). Returns its id.',
    verbs: ['addOption'],
    input: z.object({ name: z.string().optional(), buildings: z.array(ID).optional() }),
    apply: (p, i) => actions.addOption(p, { name: i.name, buildingIds: i.buildings?.map((b) => building(p, b)) }),
  }),
  edit({
    name: 'duplicateOption',
    description: 'Copies an option, its buildings linked (the same buildings). Returns the copy’s id.',
    verbs: ['duplicateOption'],
    input: z.object({ option: ID.describe('An option id') }),
    apply: (p, i, ctx) => actions.duplicateOption(p, option(p, ctx, i.option)),
  }),
  edit({
    name: 'renameOption',
    description: 'Renames an option.',
    verbs: ['renameOption'],
    input: z.object({ option: ID.describe('An option id'), name: z.string().min(1) }),
    apply: (p, i, ctx) => actions.renameOption(p, option(p, ctx, i.option), i.name),
  }),
  edit({
    name: 'removeOption',
    description: 'Deletes an option; its buildings that no other option shows are deleted too, with their masses.',
    verbs: ['removeOption'],
    input: z.object({ option: ID.describe('An option id') }),
    apply: (p, i, ctx) => actions.removeOption(p, option(p, ctx, i.option)),
  }),
  edit({
    name: 'addBuilding',
    description: 'Adds a building (a named group of masses with its own levels) to an option. Returns its id.',
    verbs: ['addBuilding'],
    input: z.object({ name: z.string().optional(), option: OPTION }),
    apply: (p, i, ctx) => actions.addBuilding(p, { name: i.name, optionId: option(p, ctx, i.option) }),
  }),
  edit({
    name: 'updateBuilding',
    description: 'Renames a building, sets the height of its new levels, or makes it context (drawn, not counted).',
    verbs: ['updateBuilding'],
    input: z.object({ building: ID.describe('A building id'), name: z.string().optional(), levelHeight: z.number().positive().optional(), context: z.boolean().optional() }),
    apply: (p, { building: id, ...patch }) => actions.updateBuilding(p, freeBuilding(p, building(p, id)), patch),
  }),
  edit({
    name: 'removeBuilding',
    description: 'Deletes a building; withMasses also deletes its masses.',
    verbs: ['removeBuilding'],
    input: z.object({ building: ID.describe('A building id'), withMasses: z.boolean().default(false) }),
    apply: (p, i) => actions.removeBuilding(p, freeBuilding(p, building(p, i.building)), i.withMasses),
  }),
  edit({
    name: 'updateLevel',
    description: 'Changes a level: its name, elevation, floor-to-floor height or how many identical floors it stacks.',
    verbs: ['updateLevel'],
    input: z.object({ level: ID.describe('A level id'), name: z.string().optional(), elevation: z.number().optional(), height: z.number().positive().optional(), floors: z.number().int().min(1).optional() }),
    apply: (p, { level: id, floors, ...patch }, ctx) => actions.updateLevel(p, freeLevel(p, level(p, ctx, id)), { ...patch, ...(floors !== undefined && { repeat: floors }) }),
  }),
  edit({
    name: 'removeLevel',
    description: 'Deletes a level and its masses (a building keeps at least one).',
    verbs: ['removeLevel'],
    input: z.object({ level: ID.describe('A level id') }),
    apply: (p, i, ctx) => actions.removeLevel(p, freeLevel(p, level(p, ctx, i.level))),
  }),
  edit({
    name: 'lockBuildings',
    description: 'Locks buildings (a locked building is seen and is not changed by any tool: its name, levels and platform stay, and so does every mass in it, which is locked too; none is added or taken out) or frees them (freeing it also frees the masses locked one by one).',
    verbs: ['lockBuildings'],
    input: z.object({ buildings: z.array(ID).min(1).describe('Building ids'), locked: z.boolean() }),
    apply: (p, i) => actions.lockBuildings(p, i.buildings.map((id) => building(p, id)), i.locked),
  }),
]

// ---- Site and circulation ----

const GATE_FIELDS = {
  width: z.number().positive().optional(),
  radius: z.number().nonnegative().optional().describe('Turning radius it is built for, m'),
  flow: z.enum(['in', 'out', 'both']).optional(),
  vehicles: z.enum(VEHICLES).optional(),
  guardHouse: z.boolean().optional(),
}

// ---- Streets and roads (stress test: "the streets came out as masses, not as streets") ----

const LINE = z
  .array(z.object({ x: z.number(), y: z.number() }))
  .min(2)
  .describe('The centreline, point by point (2 or more)')
const SIDE = z.enum(['left', 'centre', 'right'])
const REACH = z.number().min(0).optional()
const MIN_PAVING = 0.5
const thin = () => new ToolError(`The paving is at least ${MIN_PAVING} m wide in all (left + right).`)
/** A street's sides as the agent gave them: left and right, or a width and a side, never both; none given: undefined. */
function sidesGiven(i: { left?: number; right?: number; width?: number; side?: 'left' | 'centre' | 'right' }): { left: number; right: number } | undefined {
  const edges = i.left !== undefined || i.right !== undefined
  if (edges && (i.width !== undefined || i.side !== undefined)) throw new ToolError('Give either left and right, or a width and a side, not both.')
  if (!edges) return undefined
  const e = { left: i.left ?? 0, right: i.right ?? 0 }
  if (e.left + e.right < MIN_PAVING) throw thin()
  return e
}
const existing = (p: Project, id: Id) => need(p.site.existingRoads, id, 'existing road').id
const streetSegment = (p: Project, optionId: Id, id: Id) => need(p.options.find((o) => o.id === optionId)?.streets?.segments, id, 'street segment').id

/** An existing street the tools may change: not locked (updateExistingRoad's `locked: false` frees it). */
function freeRoad(p: Project, id: Id): Id {
  const r = p.site.existingRoads?.find((x) => x.id === id)
  if (r?.locked === true) throw lockedError([r.name ?? `Existing road ${r.id}`], 'updateExistingRoad with locked false')
  return id
}

/** A stretch with its left and right set (m): its lanes follow as the path engine's side pull does (the edge lane takes it, or gives it up), none stored: none. */
function withSides(t: Stretch, left: number, right: number): Stretch {
  const { lanes: _lanes, ...bare } = t
  const was = storedLanes(t)
  if (!was) return { ...bare, left, right }
  const pulled = pulledLanes(pulledLanes(was, 'left', left - t.left).lanes, 'right', right - t.right).lanes
  const next: Stretch = { ...bare, left, right, lanes: pulled }
  return storedLanes(next) ? next : { ...bare, left, right }
}

/** Where a gate stands when it is on a street: a street's segment (`street`, or its street id) or an existing street (`road`), and which side of it, `at` m along. */
const GATE_ON = z
  .object({
    street: ID.optional().describe('A street segment id (getSite: segments of a street; its street id `street:<segment>` too)'),
    road: ID.optional().describe('An existing road id'),
    side: z.enum(['left', 'right']).describe('The side of the street, walking it from its node a (an existing street: along its drawn line)'),
    at: z.number().min(0).describe('m along that line from its start; the gate is kept inside the street'),
  })
  .describe('On a side of a street or an existing street, in place of t')
function gateOn(p: Project, optionId: Id, i: z.infer<typeof GATE_ON>): GateOn {
  if ((i.street === undefined) === (i.road === undefined)) throw new ToolError('Give street or road, one of them, in on.')
  if (i.road !== undefined) return { kind: 'existing-road', id: existing(p, i.road), side: i.side, at: i.at }
  const seg = i.street!.startsWith('street:') ? i.street!.slice('street:'.length) : i.street!
  return { kind: 'street', id: streetSegment(p, optionId, seg), side: i.side, at: i.at }
}

const roadTools = [
  edit({
    name: 'addExistingRoad',
    description:
      'A street or road that is there already, part of the context (round the context buildings, along the site, through it): its drawn line point by point, its width and the side that line is (left or right edge, or centre: the default). A street is never a mass. Returns its id.',
    verbs: ['addExistingRoad', 'updateExistingRoad'],
    input: z.object({
      points: LINE,
      width: z.number().min(MIN_PAVING).optional().describe('m, 0.5 at least; absent: the standards’ road width'),
      side: SIDE.optional().describe('The side of the street the line is, walking it: its left edge, its centre (default) or its right edge'),
      left: REACH.describe('m of paving on the left of the line, walking it; with right, in place of width and side'),
      right: REACH.describe('m of paving on the right of the line, walking it; with left, in place of width and side'),
      name: z.string().optional(),
    }),
    apply(p, i) {
      const edges = sidesGiven(i)
      const r = actions.addExistingRoad(p, i.points, i.width, i.side)
      if (!r) return null
      if (edges) return { project: actions.updateExistingRoad(r.project, r.id, { stretches: i.points.slice(1).map(() => ({ ...edges })), ...(i.name ? { name: i.name } : {}) }), id: r.id }
      return i.name ? { project: actions.updateExistingRoad(r.project, r.id, { name: i.name }), id: r.id } : r
    },
  }),
  edit({
    name: 'updateExistingRoad',
    description:
      'Changes an existing street: its drawn line, the paving each side of its line (left and right, on every stretch; one alone keeps the other; its lanes follow: the lane at that edge takes or gives the difference), its name, or its padlock (locked true or false: a locked street is seen and no tool changes it, moves it, turns it or deletes it).',
    verbs: ['updateExistingRoad', 'lockExistingRoads'],
    input: z.object({
      road: ID.describe('An existing road id'),
      points: LINE.optional(),
      left: REACH.describe('m of paving on the left, every stretch'),
      right: REACH.describe('m of paving on the right, every stretch'),
      name: z.string().optional(),
      locked: z.boolean().optional().describe('true locks it, false frees it'),
    }),
    apply(p, { road, left, right, locked, ...patch }) {
      const id = existing(p, road)
      const was = p.site.existingRoads!.find((r) => r.id === id)!
      const changes = left !== undefined || right !== undefined || patch.points !== undefined || patch.name !== undefined
      // a locked street changes nothing but its padlock
      if (changes) freeRoad(p, id)
      // one pair per stretch of the line it will have: the new points' count, a longer line carrying on the last pair
      const stretches =
        left === undefined && right === undefined
          ? undefined
          : (patch.points ?? was.points).slice(1).map((_, k) => {
              const t = was.stretches[k] ?? was.stretches[was.stretches.length - 1]
              const e = { left: left ?? t.left, right: right ?? t.right }
              if (e.left + e.right < MIN_PAVING) throw thin()
              return withSides(t, e.left, e.right)
            })
      const edited = changes ? actions.updateExistingRoad(p, id, { ...patch, ...(stretches ? { stretches } : {}) }) : p
      return locked === undefined ? edited : actions.lockExistingRoads(edited, [id], locked)
    },
  }),
  edit({
    name: 'removeExistingRoad',
    description: 'Deletes an existing street (not a locked one).',
    verbs: ['removeExistingRoad'],
    input: z.object({ road: ID.describe('An existing road id') }),
    apply: (p, i) => actions.removeExistingRoad(p, freeRoad(p, existing(p, i.road))),
  }),
  edit({
    name: 'moveExistingRoad',
    description: 'Moves an existing street by dx, dy (m): its drawn line goes, its sides and lanes stay; the street ends linked to it and the gates standing on it follow. A locked street stays.',
    verbs: ['moveExistingRoads'],
    input: z.object({ road: ID.describe('An existing road id'), dx: z.number(), dy: z.number() }),
    apply: (p, i) => actions.moveExistingRoads(p, [freeRoad(p, existing(p, i.road))], { x: i.dx, y: i.dy }),
  }),
  edit({
    name: 'rotateExistingRoad',
    description: 'Turns an existing street by degrees (counter-clockwise) about x, y (both, or neither: the middle of the bounds of its points); the street ends linked to it and the gates standing on it follow. A locked street stays.',
    verbs: ['turnExistingRoads'],
    input: z.object({ road: ID.describe('An existing road id'), degrees: z.number(), x: z.number().optional(), y: z.number().optional() }),
    apply(p, i) {
      if ((i.x === undefined) !== (i.y === undefined)) throw new ToolError('Give x and y, both or neither.')
      const id = freeRoad(p, existing(p, i.road))
      const pts = p.site.existingRoads!.find((r) => r.id === id)!.points
      const xs = pts.map((q) => q.x)
      const ys = pts.map((q) => q.y)
      const pivot = i.x !== undefined ? { x: i.x, y: i.y! } : { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
      return actions.turnExistingRoads(p, [id], pivot, i.degrees)
    },
  }),
  edit({
    name: 'setStreetLanes',
    description:
      'Sets the lanes of a street of the design (street: a segment id or its street id, getSite) or of an existing street (road), on every stretch of it: count makes that many equal lanes of each stretch’s width, widths sets each lane (m, left to right walking the street; they must add up to the stretch’s width). A lane is 2 m wide at least. The paving’s width stays. Locked segments are left out and named (lockStreets frees them).',
    verbs: ['setLanes'],
    input: z.object({
      street: ID.optional().describe('A street segment id, or `street:<segment>`'),
      road: ID.optional().describe('An existing road id'),
      count: z.number().int().min(1).optional().describe('This many equal lanes'),
      widths: z.array(z.number().positive()).min(1).optional().describe('Each lane’s width, m, left to right'),
      option: OPTION,
    }),
    apply(p, i, ctx) {
      if ((i.street === undefined) === (i.road === undefined)) throw new ToolError('Give street or road, one of them.')
      if ((i.count === undefined) === (i.widths === undefined)) throw new ToolError(i.count === undefined ? 'Give count or widths.' : 'Give either count or widths, not both.')
      const optionId = option(p, ctx, i.option)
      const ref = i.road !== undefined ? { kind: 'existing-road', id: freeRoad(p, existing(p, i.road)) } : { kind: 'street', id: streetSegment(p, optionId, i.street!.startsWith('street:') ? i.street!.slice('street:'.length) : i.street!) }
      const r = actions.setLanes(p, ref, i.count !== undefined ? { count: i.count } : { widths: i.widths! }, optionId)
      if (r.reason) throw new ToolError(r.reason)
      const left = (r.notes ?? []).filter((n) => n.startsWith('Left out'))
      return left.length > 0 ? { project: r.project, note: `${left.join('. ')} (lockStreets frees them).` } : r.project
    },
  }),
  edit({
    name: 'addStreet',
    description:
      'A street of the design in an option (Decision "Streets": a service road, a fire lane, the way from a gate to a court; since ST.4 the only roads the design has, the app derives none): its corners point by point, of a street type (the project’s: trucks, cars… absent: the first), its width its own only when it differs from the type’s. A point on a street’s node joins it; on a street, it makes a T; where it crosses one, a node. Returns its first segment’s id and the nodes and segments it made.',
    verbs: ['drawStreet'],
    input: z.object({
      points: LINE,
      type: ID.optional().describe('A street type id (getProject: streetTypes); absent: the first'),
      width: z.number().min(MIN_PAVING).optional().describe('m, 0.5 at least; absent: the type’s'),
      side: SIDE.optional().describe('With width: the side of the street the line is, walking it: its left edge, its centre (default) or its right edge'),
      left: REACH.describe('m of paving on the left of the line, walking it; with right, in place of width and side'),
      right: REACH.describe('m of paving on the right of the line, walking it; with left, in place of width and side'),
      option: OPTION,
    }),
    apply(p, i, ctx) {
      const edges = sidesGiven(i)
      const r = actions.drawStreet(p, option(p, ctx, i.option), i.points, i.type, i.width, undefined, edges ? { edges } : { side: i.side })
      return r && { project: r.project, id: r.segments[0], nodes: r.nodes, segments: r.segments }
    },
  }),
  edit({
    name: 'connectStreets',
    description:
      'Connect (Decision "Streets", ST.7): each truck court that no truck gate reaches gets the shortest way from its mouth to a truck gate or to the streets one reaches, around the masses and out of the other courts, inside the site (on a terrain, the shortest within the max. road grade), drawn as streets of the trucks’ type and joined where they meet; then they are streets like any other. Then each gate that led nowhere is joined to them, and each parking lot whose entrance no road reaches gets its way, of the cars’ type. Returns how many segments it drew, the courts it linked, those it found no way for (draw them with addStreet), the gates it joined and the lots it reached (lotsLeft: those it found no way for).',
    verbs: ['connectStreets'],
    input: z.object({ option: OPTION }),
    apply(p, i, ctx) {
      const r = actions.connectStreets(p, option(p, ctx, i.option))
      return { project: r.project, segments: r.segments, linked: r.linked, left: r.left, gates: r.gates, lots: r.lots, lotsLeft: r.lotsLeft }
    },
  }),
  edit({
    name: 'setStreetType',
    description: 'Gives street segments a street type (the width a new street takes, and its turning radius; their sides stay), clearing their own vehicles and radius.',
    verbs: ['setStreetSegmentType'],
    input: z.object({ segments: z.array(ID).min(1).describe('Street segment ids'), type: ID.describe('A street type id'), option: OPTION }),
    apply(p, i, ctx) {
      const id = option(p, ctx, i.option)
      return actions.setStreetSegmentType(p, id, freeSegments(p, id, i.segments.map((g) => streetSegment(p, id, g))), i.type)
    },
  }),
  edit({
    name: 'setStreetEdges',
    description:
      'Sets the paving each side of street segments, walking each from its node a to b: left, right or both (one alone keeps the other), in m from the drawn line; together at least 0.5 m. Locked segments are left out and named (lockStreets frees them). The drawn line stays where it is.',
    verbs: ['setStreetEdges'],
    input: z.object({ segments: z.array(ID).min(1).describe('Street segment ids'), left: REACH, right: REACH, option: OPTION }),
    apply(p, i, ctx) {
      if (i.left === undefined && i.right === undefined) throw new ToolError('Give left, right or both.')
      const id = option(p, ctx, i.option)
      const all = p.options.find((o) => o.id === id)?.streets?.segments ?? []
      const ids = i.segments.map((g) => streetSegment(p, id, g))
      const held = all.filter((g) => ids.includes(g.id) && g.locked === true).map((g) => g.id)
      const free = all.filter((g) => ids.includes(g.id) && g.locked !== true)
      const edges = Object.fromEntries(
        free.map((g) => {
          const e = { left: i.left ?? g.left, right: i.right ?? g.right }
          if (e.left + e.right < MIN_PAVING) throw thin()
          return [g.id, e]
        }),
      )
      const project = actions.setStreetEdges(p, id, edges)
      return held.length > 0 ? { project, locked: held, note: `Left out, locked: ${held.join(', ')} (lockStreets frees them).` } : project
    },
  }),
  edit({
    name: 'moveStreet',
    description: 'Moves street segments by dx, dy: their nodes move, and what meets them follows; where they land on a street, they join it.',
    verbs: ['moveStreetNodes'],
    input: z.object({ segments: z.array(ID).min(1).describe('Street segment ids'), dx: z.number(), dy: z.number(), option: OPTION }),
    apply(p, i, ctx) {
      const id = option(p, ctx, i.option)
      const segs = freeSegments(p, id, i.segments.map((g) => streetSegment(p, id, g)))
      const all = p.options.find((o) => o.id === id)!.streets!.segments
      const nodes = [...new Set(all.filter((g) => segs.includes(g.id)).flatMap((g) => [g.a, g.b]))]
      return actions.moveStreetNodes(p, id, nodes, { x: i.dx, y: i.dy })
    },
  }),
  edit({
    name: 'moveStreetNode',
    description: 'Moves a street’s node to x, y: its segments follow; dropped on another node it is that node, on a street a T.',
    verbs: ['moveStreetNode'],
    input: z.object({ node: ID.describe('A street node id'), x: z.number(), y: z.number(), option: OPTION }),
    apply(p, i, ctx) {
      const id = option(p, ctx, i.option)
      const node = need(p.options.find((o) => o.id === id)?.streets?.nodes, i.node, 'street node').id
      // a node of a locked segment keeps its place
      freeSegments(p, id, (p.options.find((o) => o.id === id)?.streets?.segments ?? []).filter((g) => g.a === node || g.b === node).map((g) => g.id))
      return actions.moveStreetNode(p, id, node, { x: i.x, y: i.y })
    },
  }),
  edit({
    name: 'removeStreet',
    description: 'Deletes street segments (their nodes too, where nothing else meets).',
    verbs: ['removeStreetSegment'],
    input: z.object({ segments: z.array(ID).min(1).describe('Street segment ids'), option: OPTION }),
    apply(p, i, ctx) {
      const id = option(p, ctx, i.option)
      return freeSegments(p, id, i.segments.map((g) => streetSegment(p, id, g))).reduce((q, g) => actions.removeStreetSegment(q, id, g), p)
    },
  }),
  edit({
    name: 'lockStreets',
    description: 'Locks street segments (a locked segment is seen and is not changed by any tool: its type, width and side stay, its two nodes keep their places, and it is not deleted) or frees them. A street is locked when all its segments are.',
    verbs: ['lockStreets'],
    input: z.object({ segments: z.array(ID).min(1).describe('Street segment ids'), locked: z.boolean(), option: OPTION }),
    apply(p, i, ctx) {
      const id = option(p, ctx, i.option)
      return actions.lockStreets(p, i.segments.map((g) => streetSegment(p, id, g)), i.locked, id)
    },
  }),
]

// ---- Docks: which programs dock, and on which walls a mass does (any typology: data, not a template) ----

const dockTools = [
  edit({
    name: 'setProgramDocks',
    description:
      'Whether a program’s masses get docks and truck courts, and how many doors: one every `every` m of docked wall (per m) or one per `every` m² of floor (per m2); null: none. Its masses dock on a long wall with room for a court, unless one has walls of its own (setMassDocks).',
    verbs: ['setProgramDocks'],
    input: z.object({ program: PROGRAM, docks: DocksSchema.nullable() }),
    apply: (p, i) => actions.setProgramDocks(p, program(p, i.program), i.docks),
  }),
  edit({
    name: 'setMassDocks',
    description:
      'Which walls of a mass take docks, by their index on its outline (getDocks and getMassOutline number them: wall i runs from corner i to i + 1; a wall under 8 m takes none). [] : no docks; null: back to its program’s choice. Each docked wall gets a truck court as deep as its wall’s own, its block’s or the standards’ (updateStandards courtDepth); getDocks says each one’s.',
    verbs: ['setMassDocks'],
    input: z.object({ mass: MASS, walls: z.array(z.number().int().min(0)).nullable() }),
    apply(p, i) {
      const m = mass(p, i.mass)
      notLocked(p, [m.id])
      if (i.walls === null) return actions.setMassDocks(p, m.id, null)
      // a wall's middle, as t on the outline the docks are measured on
      const poly = footprintPolygon(m.footprint)
      const ts = vertexTs(poly)
      const ok = new Set(dockableWalls(poly).map((w) => w.i))
      const bad = i.walls.filter((w) => !ok.has(w))
      if (bad.length) throw new ToolError(`${m.name} has no wall ${bad.join(', ')} that takes docks; these do: ${[...ok].join(', ') || 'none'}.`)
      return actions.setMassDocks(p, m.id, i.walls.map((w) => (ts[w] + (w === poly.length - 1 ? 1 : ts[w + 1])) / 2))
    },
  }),
  edit({
    name: 'setCourtDepth',
    description:
      'A docked wall’s own truck court depth (Decision "Truck court": the pill on the plan), by the wall’s index on the mass’s outline (getDocks numbers them), 5 to 200 m; null: its block’s or the standards’ again. Two docked walls facing each other share their court: under the deeper depth either asks, a warning (getDocks: sharedWith, its gap).',
    verbs: ['setCourtDepth'],
    input: z.object({ mass: MASS, wall: z.number().int().min(0), depth: z.number().positive().nullable() }),
    apply(p, i) {
      const m = mass(p, i.mass)
      notLocked(p, [m.id])
      const poly = footprintPolygon(m.footprint)
      const docked = dockableWalls(poly).find((w) => w.i === i.wall)
      if (!docked) throw new ToolError(`${m.name} has no wall ${i.wall} that takes docks.`)
      const why = i.depth === null ? undefined : actions.courtDepthRefusal(p, m.id, docked.t)
      if (why) throw new ToolError(why)
      return actions.setCourtDepth(p, m.id, docked.t, i.depth)
    },
  }),
  edit({
    name: 'setBlockCourt',
    description:
      'A warehouse type’s (block’s) truck courts (Decision "Truck court", its docks step): the depth in front of each docked edge of its copies, and the range the optimizer may search it in (from ≤ depth ≤ to); null: the standards’ courtDepth again. A copy’s wall with its own depth keeps it (setCourtDepth).',
    verbs: ['setTypeCourt'],
    input: z.object({
      type: ID.describe('A warehouse type id (getProject: warehouseTypes)'),
      court: z.object({ depth: z.number().positive(), from: z.number().positive().optional(), to: z.number().positive().optional() }).nullable(),
    }),
    apply(p, i) {
      const t = need(p.warehouseTypes ?? [], i.type, 'warehouse type')
      const c = i.court
      if (c && (c.from === undefined) !== (c.to === undefined)) throw new ToolError('A range needs both from and to.')
      const court = c ? { depth: c.depth, ...(c.from !== undefined && c.to !== undefined ? { range: [c.from, c.to] as [number, number] } : {}) } : null
      const r = actions.setTypeCourt(p, t.id, court)
      if (r === p && court && court.range && !(court.range[0] <= court.depth && court.depth <= court.range[1])) throw new ToolError('The depth must be within its range.')
      return r
    },
  }),  edit({
    name: 'setBlockGridLine',
    description:
      'A warehouse type’s (block’s) grid line by hand (Decision "Grid by line"): line `line` along `axis` (x: the length’s A, B, C… as 0, 1, 2…; y: the width’s 1, 2, 3… as 0, 1, 2…) moved to the module line nearest `to` (m from the first line), between the lines either side; null deletes it (the bays either side become one). The first and last lines are the box’s walls: they stay. Docks and doors stay on their modules (Decision "Elements by module"); a copy of another length keeps the edit counted from its nearer wall.',
    verbs: ['moveGridLine', 'removeGridLine'],
    input: z.object({
      type: ID.describe('A warehouse type id (getProject: warehouseTypes)'),
      axis: z.enum(['x', 'y']),
      line: z.number().int().min(1),
      to: z.number().nullable().describe('m from the first line; null: deleted'),
    }),
    apply(p, i) {
      const t = need(p.warehouseTypes ?? [], i.type, 'warehouse type')
      const r = i.to === null ? actions.removeGridLine(p, t.id, i.axis, i.line) : actions.moveGridLine(p, t.id, i.axis, i.line, i.to)
      if (r === p) throw new ToolError(`Line ${i.line} along ${i.axis} is not a line inside the box, or it is already there.`)
      return r
    },
  }),
  edit({
    name: 'regularBlockGrid',
    description: 'A warehouse type’s (block’s) grid lines back to its rules (step 1’s Regular grid again): every line moved or deleted by hand (setBlockGridLine) undone.',
    verbs: ['regularGrid'],
    input: z.object({ type: ID.describe('A warehouse type id (getProject: warehouseTypes)') }),
    apply(p, i) {
      const t = need(p.warehouseTypes ?? [], i.type, 'warehouse type')
      return actions.regularGrid(p, t.id)
    },
  }),
  edit({
    name: 'setBlockEndsAutomatically',
    description:
      'A warehouse type’s (block’s) end bays laid automatically, once (step 1’s Set end bays automatically): at both ends along each axis, an equal end bay at each end of what the whole bays leave (none when the length is whole bays; a short one joins the bay next to it by the join rule, setBlockEndJoin), and the grid’s own lines (setBlockGridLine) cleared. The length does not change, so docks, doors, patterns, the shape’s corners, holes and zones keep their place on the site, each on the module (line) nearest where it stood. After it, move the column lines by hand.',
    verbs: ['setEndsAutomatically'],
    input: z.object({ type: ID.describe('A warehouse type id (getProject: warehouseTypes)') }),
    apply(p, i) {
      const t = need(p.warehouseTypes ?? [], i.type, 'warehouse type')
      return actions.setEndsAutomatically(p, t.id)
    },
  }),
  edit({
    name: 'setBlockEndJoin',
    description:
      'A warehouse type’s (block’s) short end bays (Decision "Grid by line", its Grid step): an end bay shorter than `under` m joins the whole bay next to it, along either axis (so a 218 m block of 12 m bays has end bays of 19 m, not 7 m); null: two thirds of a bay again (the default). A joined bay keeps its modules, so docks and doors stay on theirs (Decision "Elements by module").',
    verbs: ['setHallJoin'],
    input: z.object({
      type: ID.describe('A warehouse type id (getProject: warehouseTypes)'),
      under: z.number().nonnegative().nullable().describe('m; 0: none joins'),
    }),
    apply(p, i) {
      const t = need(p.warehouseTypes ?? [], i.type, 'warehouse type')
      return actions.setHallJoin(p, t.id, i.under)
    },
  }),
]

const siteTools = [
  edit({
    name: 'updateSiteRules',
    description: 'The site’s rules: the setback every built mass keeps from the boundary (m) and the most coverage (0 to 1, null: none).',
    verbs: ['updateSiteRules'],
    input: z.object({ setback: z.number().nonnegative().optional(), maxCoverage: z.number().min(0).max(1).nullable().optional() }),
    apply: (p, i) => actions.updateSiteRules(p, i),
  }),
  edit({
    name: 'setBoundary',
    description: 'Replaces the site’s boundary with a polygon (m, plan coordinates). The gates on the old one go; the gates on a street or an existing street stay with it, and the existing roads stay.',
    verbs: ['setBoundary'],
    input: z.object({ points: POINTS }),
    apply(p, i) {
      if (!isSimple(i.points) || area(i.points) < 1) throw new ToolError('The boundary must not cross itself and must enclose at least 1 m².')
      return actions.setBoundary(p, contourFromPolygon(i.points), 'Agent')
    },
  }),
  edit({
    name: 'setLocation',
    description:
      'Where the site is on the Earth: a latitude and longitude (WGS 84, degrees) put at the centre of the site, and north (degrees counter-clockwise from the plan’s +y to true north; absent: as it is, 0 the first time).',
    verbs: ['locateSite', 'updateGeo'],
    input: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), north: z.number().optional() }),
    apply: (p, { lat, lon, north }) => {
      const q = actions.locateSite(p, { lat, lon })
      return north === undefined ? q : actions.updateGeo(q, { north })
    },
  }),
  edit({
    name: 'addGate',
    description:
      'Adds a gate for this option, in one of two places: in the boundary at t (0 to 1 along its perimeter from its first corner), or on a side of a street or an existing street, `on` (the street’s segment or the road, the side, and m along it). A gate on a street of the design goes into this option’s own gates. Returns its id.',
    verbs: ['addGate', 'addGateOn'],
    input: z.object({ t: z.number().min(0).max(1).optional(), on: GATE_ON.optional(), option: OPTION, ...GATE_FIELDS }),
    apply(p, { t, on, option: o, ...init }, ctx) {
      if ((t === undefined) === (on === undefined)) throw new ToolError('Give either t or on, not both.')
      const optionId = option(p, ctx, o)
      return on ? actions.addGateOn(p, optionId, gateOn(p, optionId, on), init) : actions.addGate(p, optionId, t!, init)
    },
  }),
  edit({
    name: 'updateGate',
    description: 'Changes a gate: its place (t on the boundary, or `on` a side of a street or an existing street: one of the two, the other is dropped), width, radius, flow, vehicles or guard house.',
    verbs: ['updateGate'],
    input: z.object({ gate: ID.describe('A gate id'), option: OPTION, t: z.number().min(0).max(1).optional(), on: GATE_ON.optional(), ...GATE_FIELDS }),
    apply: (p, { gate: id, option: o, on, ...patch }, ctx) => {
      if (on !== undefined && patch.t !== undefined) throw new ToolError('Give either t or on, not both.')
      const optionId = option(p, ctx, o)
      return actions.updateGate(p, optionId, freeGate(p, optionId, gate(p, optionId, id)), { ...patch, ...(on ? { on: gateOn(p, optionId, on) } : {}) })
    },
  }),
  edit({
    name: 'removeGate',
    description: 'Deletes a gate of this option.',
    verbs: ['removeGate'],
    input: z.object({ gate: ID.describe('A gate id'), option: OPTION }),
    apply: (p, i, ctx) => {
      const optionId = option(p, ctx, i.option)
      return actions.removeGate(p, optionId, freeGate(p, optionId, gate(p, optionId, i.gate)))
    },
  }),
  edit({
    name: 'lockGates',
    description: 'Locks gates of this option (a locked gate is seen and is not changed by any tool: its place, width, radius and flow stay, and it is not deleted) or frees them.',
    verbs: ['lockGates'],
    input: z.object({ gates: z.array(ID).min(1).describe('Gate ids'), locked: z.boolean(), option: OPTION }),
    apply(p, i, ctx) {
      const optionId = option(p, ctx, i.option)
      return actions.lockGates(p, i.gates.map((g) => gate(p, optionId, g)), i.locked, optionId)
    },
  }),
  edit({
    name: 'setParking',
    description:
      'Car stalls along the streets with no side of their own, in this option: on one side, both or none (over the standard). null clears it.',
    verbs: ['setParking'],
    input: z.object({ side: ParkingSideSchema.nullable(), option: OPTION }),
    apply: (p, i, ctx) => actions.setParking(p, option(p, ctx, i.option), i.side),
  }),
  edit({
    name: 'setStreetParking',
    description:
      'Car stalls along street segments of their own (Decision "Street parking by side"), over the option’s: on a segment’s left or right walking from its node a to b, both or none; null clears it, back to the option’s. A street for trucks alone has none either way.',
    verbs: ['setStreetParking'],
    input: z.object({
      segments: z.array(ID).min(1).describe('Street segment ids (getProject: the option’s streets)'),
      side: StreetParkingSchema.nullable(),
      option: OPTION,
    }),
    apply(p, i, ctx) {
      const id = option(p, ctx, i.option)
      return actions.setStreetParking(p, id, Object.fromEntries(freeSegments(p, id, i.segments.map((g) => streetSegment(p, id, g))).map((g) => [g, i.side])))
    },
  }),
  edit({
    name: 'addParkingLot',
    description:
      'A parking lot (Decision "Lot tool"): car stalls in rows at right angles to aisles, two rows to an aisle. Anchored to a wall of a mass (`mass` and `wall`, the side of its box facing that way; it follows the mass when it grows, moves or turns): along the whole wall, or `length` m from `from` m past the corner where the wall starts; `rows` deep (absent: as many as fit before the first street, court or mass in its way, else the setback). Or free: `rect` (its centre, its width along its rows, its depth, its rotation). `sizes`: its own stall width, stall depth and aisle width over the standards’. `entry`: the end of its aisles a street must reach (start: where the wall starts; absent, the end nearer a road). A truck court’s wall takes no lot. getProject lists the lots with their stalls; getIssues (code lot) says what one runs over, rows past the setback, or that no street reaches its entrance (connectStreets draws one). Returns its id.',
    verbs: ['addLot'],
    input: z.object({
      mass: MASS.optional().describe('Anchored: the mass whose wall it stands against'),
      wall: z.enum(['north', 'east', 'south', 'west']).optional().describe('Anchored: the side of the mass’s box facing this way'),
      from: z.number().min(0).optional().describe('m past the corner where the wall starts (with length)'),
      length: z.number().positive().optional().describe('m along the wall; absent: the whole wall'),
      rows: z.number().int().min(1).optional().describe('Rows deep; absent: as many as fit before the first street, court or mass in its way, else the setback'),
      rect: z
        .object({ center: z.object({ x: z.number(), y: z.number() }), width: z.number().positive(), depth: z.number().positive(), rotation: z.number().default(0) })
        .optional()
        .describe('Free: its rectangle, its rows along its width'),
      sizes: LOT_SIZES,
      entry: z.enum(['start', 'end']).optional(),
      name: z.string().optional(),
      option: OPTION,
    }),
    apply(p, i, ctx) {
      const o = option(p, ctx, i.option)
      if (!i.rect === !i.mass) throw new ToolError('A lot is anchored to a wall (mass and wall) or free (rect): give one of the two.')
      const anchor = i.mass ? { massId: mass(p, i.mass).id, side: sideFacing(p, i.mass, i.wall ?? 'south'), ...(i.length !== undefined ? { from: i.from ?? 0, length: i.length } : {}) } : undefined
      return actions.addLot(p, o, { ...(anchor ? { anchor } : { rect: i.rect }), ...(i.rows !== undefined && { rows: i.rows }), ...(i.sizes && { sizes: i.sizes }), ...(i.entry && { entry: i.entry }), ...(i.name && { name: i.name }) })
    },
  }),
  edit({
    name: 'updateParkingLot',
    description:
      'A parking lot changed (Decision "Lot tool"): its name; an anchored one’s stretch of wall (`length` m from `from`; length null: the whole wall again) and rows (null: as many as fit before the first street, court or mass in its way, else the setback); a free one’s rectangle (`rect`; given to an anchored one, it frees it from its wall); its sizes (null: the standards’ again); its entrance’s end.',
    verbs: ['setLot'],
    input: z.object({
      lot: ID.describe('A lot id (getProject: the option’s lots)'),
      name: z.string().optional(),
      from: z.number().min(0).optional(),
      length: z.number().positive().nullable().optional(),
      rows: z.number().int().min(1).nullable().optional(),
      rect: z.object({ center: z.object({ x: z.number(), y: z.number() }), width: z.number().positive(), depth: z.number().positive(), rotation: z.number().default(0) }).optional(),
      sizes: LOT_SIZES.nullable(),
      entry: z.enum(['start', 'end']).optional(),
      option: OPTION,
    }),
    apply(p, i, ctx) {
      const o = option(p, ctx, i.option)
      const lot = need(p.options.find((x) => x.id === o)?.lots, i.lot, 'parking lot')
      const patch: Parameters<typeof actions.setLot>[3] = {}
      if (i.name) patch.name = i.name
      if (i.rows !== undefined) patch.rows = i.rows
      if (i.sizes !== undefined) patch.sizes = i.sizes
      if (i.entry) patch.entry = i.entry
      if (i.rect) Object.assign(patch, { rect: i.rect, anchor: null, rows: null })
      else if (lot.anchor && (i.length !== undefined || i.from !== undefined)) {
        const { from: _, length: __, ...side } = lot.anchor
        const length = i.length === undefined ? lot.anchor.length : i.length
        patch.anchor = length === null || length === undefined ? side : { ...side, from: i.from ?? lot.anchor.from ?? 0, length }
      }
      freeLots(p, o, [lot.id])
      return actions.setLot(p, o, lot.id, patch)
    },
  }),
  edit({
    name: 'removeParkingLots',
    description: 'Parking lots taken away (Decision "Lot tool").',
    verbs: ['removeLots'],
    input: z.object({ lots: z.array(ID).min(1).describe('Lot ids'), option: OPTION }),
    apply(p, i, ctx) {
      const o = option(p, ctx, i.option)
      const lots = p.options.find((x) => x.id === o)?.lots
      return actions.removeLots(p, o, freeLots(p, o, i.lots.map((id) => need(lots, id, 'parking lot').id)))
    },
  }),
  edit({
    name: 'lockLots',
    description: 'Locks parking lots of this option (a locked lot is seen and is not changed by any tool: its wall, rows, sizes and entrance stay, and it is not deleted) or frees them.',
    verbs: ['lockLots'],
    input: z.object({ lots: z.array(ID).min(1).describe('Lot ids'), locked: z.boolean(), option: OPTION }),
    apply(p, i, ctx) {
      const o = option(p, ctx, i.option)
      const lots = p.options.find((x) => x.id === o)?.lots
      return actions.lockLots(p, i.lots.map((id) => need(lots, id, 'parking lot').id), i.locked)
    },
  }),
  edit({
    name: 'updateStandards',
    description: 'The circulation’s standards: road width, a car road’s width (the Cars street type’s, unless the project has its own types), truck court depth, ring clearance, a new gate’s width and radius, car stall size, parking along roads.',
    verbs: ['updateStandards'],
    input: StandardsSchema,
    apply: (p, i) => actions.updateStandards(p, i),
  }),
  edit({
    name: 'setProgramDemand',
    description:
      'What a program asks of the parking (the Brief’s Circulation tab): a car stall per so many m² of its floor (carStalls), so many trailer stalls per dock door of its masses (trailerStalls). null clears one. Fewer car stalls along the roads than the programs ask is a parking Issue in Flow.',
    verbs: ['setProgramDemand'],
    input: z.object({
      program: ID.describe('A program id'),
      carStalls: z.number().positive().nullable().optional().describe('m² of its floor per car stall'),
      trailerStalls: z.number().positive().nullable().optional().describe('trailer stalls per dock door'),
    }),
    apply: (p, i) => actions.setProgramDemand(p, program(p, i.program), { ...(i.carStalls !== undefined && { carStalls: i.carStalls }), ...(i.trailerStalls !== undefined && { trailerStalls: i.trailerStalls }) }),
  }),
]

// ---- The project ----

const projectTools = [
  edit({
    name: 'renameProject',
    description: 'Renames the project.',
    verbs: ['renameProject'],
    input: z.object({ name: z.string().min(1) }),
    apply: (p, i) => actions.renameProject(p, i.name),
  }),
  edit({
    name: 'setKpis',
    description: 'Which KPIs the top strip shows, in order (ids from getKpis).',
    verbs: ['setKpis'],
    input: z.object({ ids: z.array(z.string()) }),
    apply: (p, i) => actions.setKpis(p, i.ids),
  }),
]

// ---- Imported drawings (Decision "Drawings move"): a file's layers and parcels moved, turned and locked ----

const PARTS = z
  .array(
    z.object({
      file: z.string().describe('An imported file’s name, as getSite’s drawings list it'),
      layer: z.string().optional().describe('One of its layers; absent (and no parcels): the whole drawing, its layers and its parcels'),
      parcels: z.literal(true).optional().describe('Its parcels'),
    }),
  )
  .min(1)
  .describe('The parts to carry: a whole drawing, one of its layers, or its parcels')

/** The imported file of this name, or why not (the files there are). */
function drawingFile(p: Project, file: string): string {
  const files = [...new Set([...(p.site.drawings ?? []).map((d) => d.file), ...(p.site.parcels ?? []).map((x) => x.file).filter((x): x is string => !!x)])]
  if (!files.includes(file)) throw new ToolError(`No imported drawing "${file}". There are: ${files.join(', ') || 'none'}.`)
  return file
}

/** The layer of that file, or why not (the layers it has: getSite lists them). */
function drawingLayer(p: Project, file: string, layer: string): string {
  const layers = (p.site.drawings ?? []).find((d) => d.file === drawingFile(p, file))?.layers ?? []
  if (!layers.some((l) => l.name === layer)) throw new ToolError(`No layer "${layer}" in "${file}". There are: ${layers.map((l) => l.name).join(', ') || 'none'}.`)
  return layer
}

/** That file brought parcels, or why not. */
function parcelsOf(p: Project, file: string): string {
  if (!(p.site.parcels ?? []).some((x) => x.file === drawingFile(p, file))) throw new ToolError(`"${file}" brought no parcels.`)
  return file
}

/** That file has layers (a file that brought parcels alone has none), or why not. */
function layersOf(p: Project, file: string): string {
  if (!(p.site.drawings ?? []).some((d) => d.file === drawingFile(p, file))) throw new ToolError(`"${file}" has no layers, only parcels.`)
  return file
}

/** Each part names what there is: its file, its layer, its parcels (else a ToolError that lists what there is). */
function checkParts(p: Project, parts: { file: string; layer?: string; parcels?: true }[]): void {
  for (const x of parts) {
    if (x.layer !== undefined) drawingLayer(p, x.file, x.layer)
    else if (x.parcels) parcelsOf(p, x.file)
    else drawingFile(p, x.file)
  }
}

/** A carry's answer: what moved, or why nothing did (a locked layer stays). */
function carried(p: Project, r: { project: Project; skipped: string[] }): Made {
  if (r.project === p && r.skipped.length) throw new ToolError(`Nothing moved. ${r.skipped.join('. ')}.`)
  return { project: r.project, ...(r.skipped.length ? { skipped: r.skipped } : {}) }
}

const drawingTools = [
  edit({
    name: 'moveDrawings',
    description:
      'Moves imported drawings by dx, dy (m): a whole drawing moves its unlocked layers and its unlocked parcels (it says how many stayed, locked); a layer or the parcels named alone must be unlocked. The boundary, the ground and the roads do not move.',
    verbs: ['moveDrawings'],
    input: z.object({ parts: PARTS, dx: z.number(), dy: z.number() }),
    apply: (p, i) => {
      checkParts(p, i.parts)
      return carried(p, actions.moveDrawings(p, i.parts, { x: i.dx, y: i.dy }))
    },
  }),
  edit({
    name: 'turnDrawings',
    description: 'Turns imported drawings by degrees (counter-clockwise) about the point x, y (m); the parts and what stays are the same as in moveDrawings.',
    verbs: ['turnDrawings'],
    input: z.object({ parts: PARTS, x: z.number(), y: z.number(), degrees: z.number() }),
    apply: (p, i) => {
      checkParts(p, i.parts)
      return carried(p, actions.turnDrawings(p, i.parts, { x: i.x, y: i.y }, i.degrees))
    },
  }),
  edit({
    name: 'setDrawingLayerLocked',
    description: 'Locks a layer of an imported drawing (it is not picked and does not move) or unlocks it. Reference layers start unlocked.',
    verbs: ['setDrawingLayerLocked'],
    input: z.object({ file: z.string(), layer: z.string(), locked: z.boolean() }),
    apply: (p, i) => actions.setDrawingLayerLocked(p, i.file, drawingLayer(p, i.file, i.layer), i.locked),
  }),
  edit({
    name: 'setParcelsLocked',
    description: 'Locks the parcels of an imported file (all together; they start locked) or unlocks them so they move with their drawing.',
    verbs: ['setParcelsLocked'],
    input: z.object({ file: z.string(), locked: z.boolean() }),
    apply: (p, i) => actions.setParcelsLocked(p, parcelsOf(p, i.file), i.locked),
  }),
  edit({
    name: 'setDrawingSplit',
    description: 'Separates the layers of an imported drawing (each is picked and moved on its own) or joins them again into one piece.',
    verbs: ['setDrawingSplit'],
    input: z.object({ file: z.string(), split: z.boolean() }),
    apply: (p, i) => actions.setDrawingSplit(p, layersOf(p, i.file), i.split),
  }),
]

export const EDIT_TOOLS = [...massTools, ...shapeTools, ...holeTools, ...roadTools, ...ruleTools, ...programTools, ...dockTools, ...optionTools, ...siteTools, ...drawingTools, ...projectTools]
