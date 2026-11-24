// The site and the masses' room, read as geometry (Phase 8.3–8.6, Decision "Agent sees the site"): what an agent needs
// to place masses without trial and error. Every figure comes from the engine the checks use (deriveSite, the docks,
// the gates), so what these tools say is what getIssues will say. Core, every typology: the docks and truck courts are
// the programs' that have docks (industrial's warehouses), nothing for the others.
import { z } from 'zod'
import { allLevels } from '../../engine/buildings.ts'
import { FLOW_ISSUES } from '../../engine/circulation/index.ts'
import { derive, deriveMassing, withCirculation } from '../../engine/derive.ts'
import { polygonFootprint } from '../../engine/geom/draw.ts'
import { difference, offset, regionsArea } from '../../engine/geom/boolean.ts'
import { edgeAt } from '../../engine/geom/perimeter.ts'
import { area, bounds, toCounterClockwise } from '../../engine/geom/polygon.ts'
import { minimumRectangle } from '../../engine/geom/rectangle.ts'
import { pack, type Packed, type PackedMass } from '../../engine/massing/pack.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { lanesOf } from '../../engine/path/lanes.ts'
import { courtShapes, type Issue } from '../../engine/types.ts'
import { isLayerLocked } from '../../model/drawings.ts'
import type { Footprint, Id, Point, Polygon, Project } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { need, tool, ToolError, type ToolContext } from './tool.ts'

const OPTION = z.string().optional().describe('An option id; absent: the one in view')
const optionOf = (p: Project, ctx: ToolContext, id?: string) => need(p.options, id ?? ctx.option, 'option')

const cm = (n: number) => Math.round(n * 100) / 100 || 0 // never -0
const pt = (q: Point) => ({ x: cm(q.x), y: cm(q.y) })
const box = (poly: Polygon) => {
  const b = bounds(poly)
  return { minX: cm(b.minX), minY: cm(b.minY), maxX: cm(b.maxX), maxY: cm(b.maxY) }
}

/**
 * The imported drawings (Decision "Drawings move"), so an agent can name what moveDrawings, turnDrawings and the locks
 * take: per file (those with layers, then those that brought parcels alone), its layers with their lines and lock,
 * whether it is separated (`split`), and its parcels with their lock. Absent fields are the defaults: a layer unlocked,
 * one piece, parcels locked.
 */
export function drawingsOf(p: Project) {
  const drawings = p.site.drawings ?? []
  const parcels = p.site.parcels ?? []
  const files = [...new Set([...drawings.map((d) => d.file), ...parcels.flatMap((x) => (x.file === undefined ? [] : [x.file]))])]
  return files.map((file) => {
    const d = drawings.find((x) => x.file === file)
    return {
      file,
      split: d?.split === true,
      layers: (d?.layers ?? []).map((l) => ({ name: l.name, lines: l.lines.length, locked: isLayerLocked(l) })),
      parcels: parcels.filter((x) => x.file === file).map((x) => ({ name: x.name, locked: !x.unlocked })),
    }
  })
}

/** How the standards size the room round masses (the docks' rules and a street's room, engine/circulation/). */
const ROOM =
  'A docked wall needs its court’s depth free in front of it (courtDepth, unless its block or its wall has one of its own: getDocks), inside the boundary (two docked walls facing each other share one court, as deep as the deeper of the two asks); its docks keep the front when there is also roadWidth between the court and the boundary. A street round a building needs ringClear + roadWidth from a wall without docks, roadWidth past a court (the app derives none: streets are drawn, addStreet). Built masses stand inside the buildable area.'

export const getSite = tool({
  name: 'getSite',
  description:
    'The site as geometry, to plan where masses go before placing them: the boundary counter-clockwise with each edge (index, ends, length), the buildable area (the boundary less the setback and the existing roads: where built masses must stand, as polygons with holes), areas and bounding boxes, the gates in plan coordinates (their edge, width, flow, vehicles, the direction into the site), the roads, the circulation standards (road width, truck court depth, ring clearance) that size the room between masses, and the imported drawings (per file: its layers with their line count and lock, whether it is separated, its parcels with their lock: what moveDrawings and turnDrawings take).',
  kind: 'read',
  verbs: [],
  input: z.object({ option: OPTION }),
  run(p, input, ctx) {
    const option = optionOf(p, ctx, input.option)
    const d = derive(p, option.id)
    const poly = d.site.polygon
    const standards = standardsOf(p)
    const buildable = d.site.buildable.map(([outer, ...holes]) => ({
      outer: outer.map(pt),
      holes: holes.map((h) => h.map(pt)),
      area: cm(regionsArea([[outer, ...holes]])),
    }))
    let boundary = null
    let gates: unknown[] = []
    // the engine's outline is counter-clockwise (contourToPolygon): the gates' t is measured on it
    if (poly && poly.length >= 3) {
      const n = poly.length
      const edges = poly.map((a, i) => {
        const b = poly[(i + 1) % n]
        return { i, from: pt(a), to: pt(b), length: cm(Math.hypot(b.x - a.x, b.y - a.y)) }
      })
      boundary = { points: poly.map(pt), area: cm(area(poly)), bbox: box(poly), edges }
      gates = d.circulation.gates.map((g) => ({
        id: g.id,
        x: cm(g.at.x),
        y: cm(g.at.y),
        // a gate on the boundary names its edge; one on a street names its host and side: `on` (addGate and updateGate take the same)
        ...(g.t !== undefined ? { edge: edgeAt(poly, g.t).i } : {}),
        ...(g.on ? { on: g.on } : {}),
        width: g.width,
        flow: g.flow,
        vehicles: g.vehicles,
        inward: { x: cm(g.inward.x), y: cm(g.inward.y) },
      }))
    }
    const linkedNodes = new Map((p.options.find((o) => o.id === d.option)?.streets?.nodes ?? []).map((n) => [n.id, n]))
    return {
      project: p,
      output: {
        units: 'metres, square metres; x east, y north',
        boundary,
        setback: p.site.rules.setback,
        maxCoverage: p.site.rules.maxCoverage,
        buildable: {
          area: cm(regionsArea(d.site.buildable)),
          bbox: d.site.buildable.length ? box(d.site.buildable.flatMap((r) => r[0])) : null,
          regions: buildable,
        },
        gates,
        // each stretch with its lanes (the stored ones, or the equal lanes it shows), the padlock and the group (moveExistingRoad, rotateExistingRoad, updateExistingRoad)
        existingRoads: (p.site.existingRoads ?? []).map((r) => ({
          id: r.id,
          name: r.name ?? null,
          width: r.stretches[0].left + r.stretches[0].right,
          stretches: r.stretches.map((s) => ({ left: s.left, right: s.right, lanes: lanesOf(s, standards.laneWidth) })),
          points: r.points.map(pt),
          locked: r.locked ?? false,
          group: r.group ?? null,
        })),
        streets: (d.circulation.roads.filter((r) => r.kind === 'street')).map((r) => ({
          street: r.street ?? null,
          segments: r.segments,
          type: r.streetType,
          width: r.width,
          vehicles: r.vehicles,
          left: r.left ?? r.width / 2,
          right: r.right ?? r.width / 2,
          // the lanes, left to right walking the run (setStreetLanes sets them)
          lanes: r.lanes ?? null,
          points: (r.nodePoints ?? r.points).map(pt),
          // the ends linked to an existing street (Decision "Street links"): the node, where, and the road it follows
          links: (r.nodes ?? []).flatMap((id) => {
            const n = linkedNodes.get(id)
            return n?.road ? [{ node: id, at: pt(n), road: n.road }] : []
          }),
        })),
        standards: { roadWidth: standards.roadWidth, courtDepth: standards.courtDepth, ringClear: standards.ringClear },
        room: ROOM,
        drawings: drawingsOf(p),
      },
    }
  },
})

/** The compass point a wall faces (its normal out of the mass). */
const COMPASS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']
const facing = (out: Point) => COMPASS[Math.round(((Math.atan2(out.y, out.x) * 180) / Math.PI + 360) / 45) % 8]

export const getDocks = tool({
  name: 'getDocks',
  description:
    'The docks and truck courts of one option (the masses whose program has docks, or with docks of their own): per mass, each docked wall (its index on the mass’s outline, ends, length, the direction it faces), its doors and its truck court as a polygon (the frame trucks come in by) and its depth (its wall’s own, its block’s or the standards’; the deepest of its courts where they have shapes), and, where its block gave the wall courts a shape of their own, `shapes`: each court’s corners on the plan (what is paved; `court` is then the rectangle that holds them), the docked wall of another mass it shares its court with across a gap; whether its walls are its own (setMassDocks) or its program’s; what its court runs into (another mass, out of the site); whether a truck gate reaches it. Also the masses whose docks found no free wall. Programs without docks have none.',
  kind: 'read',
  verbs: [],
  input: z.object({ option: OPTION, mass: z.string().optional().describe('Only this mass (an id); absent: every one') }),
  run(p, input, ctx) {
    const option = optionOf(p, ctx, input.option)
    const only = input.mass === undefined ? null : need(p.masses, input.mass, 'mass').id
    const d = derive(p, option.id)
    const c = d.circulation
    const ids = [...new Set(c.docks.map((x) => x.massId))].filter((id) => only === null || id === only)
    const trucks = c.gates.some((g) => g.vehicles !== 'cars' && g.flow !== 'out')
    const courts = d.issues.filter((i) => i.code === 'court' || i.code === 'access')
    return {
      project: p,
      output: {
        courtDepth: standardsOf(p).courtDepth,
        masses: ids.map((id) => {
          const mine = c.docks.filter((x) => x.massId === id)
          return {
            mass: id,
            name: d.masses[id]?.name ?? id,
            own: mine[0].own,
            walls: mine.map((x) => ({
              wall: x.wall,
              from: pt(x.a),
              to: pt(x.b),
              length: cm(Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y)),
              facing: facing(x.out),
              out: { x: cm(x.out.x), y: cm(x.out.y) },
              doors: x.doors.length,
              court: x.court.map(pt),
              ...(x.shapes ? { shapes: x.shapes.map((s) => s.map(pt)) } : {}),
              depth: cm(x.depth),
              ...(x.shares ? { sharedWith: { mass: x.shares.massId, wall: x.shares.wall, gap: cm(x.shares.gap) } } : {}),
            })),
            doors: mine.reduce((n, x) => n + x.doors.length, 0),
            reached: trucks ? c.reached.includes(id) : false,
            issues: courts.filter((i) => i.massIds[0] === id).map((i) => i.message),
          }
        }),
        noFreeWall: c.covered.filter((id) => only === null || id === only),
      },
    }
  },
})

// ---- A dry run (8.5): masses tried on a copy, the project untouched ----

/** A mass to try: a new one (a program) or one there is (`mass`), as a rectangle or point by point. */
export const CANDIDATE = z.object({
  mass: z.string().optional().describe('A mass there is, tried in a new place or shape; absent: a new mass'),
  program: z.string().nullable().optional().describe('A new mass’s program id (null: none); a mass there is keeps its own unless given'),
  x: z.number().optional().describe('A rectangle’s centre, east'),
  y: z.number().optional().describe('A rectangle’s centre, north'),
  width: z.number().positive().optional().describe('A rectangle’s side along its own x axis, before rotation'),
  depth: z.number().positive().optional().describe('A rectangle’s side along its own y axis, before rotation'),
  rotation: z.number().optional().describe('Degrees counter-clockwise; absent: 0 (a mass there is: its own)'),
  points: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .min(3)
    .optional()
    .describe('Instead of a rectangle: the outline corner by corner'),
})
export type Candidate = z.infer<typeof CANDIDATE>

/**
 * The copy with the candidates in it (each new one a block drawn on `level` in `option`, as addMass makes it: Phase D.2, every building is
 * a block, so what the dry run says is what the placed layout would say; each one there is reshaped) and the ids tried (a new one's, its hall's).
 */
export function tryMasses(p: Project, level: Id, option: Id, candidates: Candidate[], remove: Id[] = []): { project: Project; ids: Id[] } {
  let q = remove.length ? actions.removeMasses(p, remove.map((id) => need(p.masses, id, 'mass').id)) : p
  const ids: Id[] = []
  candidates.forEach((c, k) => {
    const old = c.mass === undefined ? null : need(q.masses, c.mass, 'mass')
    let footprint: Footprint
    if (c.points) {
      const f = polygonFootprint(c.points)
      if (f === null || f === 'crossing') throw new ToolError(`Candidate ${k + 1}: its outline ${f === 'crossing' ? 'crosses itself' : 'encloses nothing'}.`)
      footprint = f
    } else {
      const was = old?.footprint.kind === 'rect' ? old.footprint : null
      const x = c.x ?? was?.center.x
      const y = c.y ?? was?.center.y
      const width = c.width ?? was?.width
      const depth = c.depth ?? was?.depth
      if (x === undefined || y === undefined || width === undefined || depth === undefined)
        throw new ToolError(`Candidate ${k + 1}: give x, y, width and depth (or points).`)
      footprint = { kind: 'rect', center: { x, y }, width, depth, rotation: c.rotation ?? was?.rotation ?? 0 }
    }
    const programId = c.program === undefined ? undefined : c.program === null ? null : need(q.programs, c.program, 'program').id
    if (old) {
      q = actions.updateMass(q, old.id, { footprint, ...(programId !== undefined && { programId }) })
      ids.push(old.id)
    } else {
      const made = actions.drawBlock(q, { programId: programId ?? null, footprint, levelId: level, optionId: option })
      if (!made) throw new ToolError(`Candidate ${k + 1}: too small to hold a block’s walls.`)
      q = made.project
      ids.push(made.id)
    }
  })
  return { project: q, ids }
}

const issueOut = (i: Issue) => ({ code: i.code, severity: i.severity, message: i.message, massIds: i.massIds, step: FLOW_ISSUES.includes(i.code) ? 'flow' : 'massing' })
const key = (i: Issue) => `${i.code}|${i.message}`

/** What a layout gives (the option's Issues, the candidates' own, coverage), on the copy; `before`: the project's. */
export function judge(before: Project, after: Project, option: Id, ids: Id[], flow = true) {
  const d = flow ? derive(after, option) : withCirculation(after, deriveMassing(after, option), { network: false })
  const was = new Set((flow ? derive(before, option) : withCirculation(before, deriveMassing(before, option), { network: false })).issues.map(key))
  const issues = d.issues.map((i) => ({ ...issueOut(i), new: !was.has(key(i)) }))
  return {
    candidates: ids.map((id, k) => ({
      k,
      id,
      area: cm(d.masses[id]?.area ?? 0),
      issues: d.issues.filter((i) => i.massIds.includes(id)).map((i) => ({ code: i.code, severity: i.severity, message: i.message })),
    })),
    issues,
    totals: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      new: issues.filter((i) => i.new).length,
    },
    coverage: d.metrics.coverage === null ? null : Math.round(d.metrics.coverage * 1000) / 1000,
  }
}

export const checkMasses = tool({
  name: 'checkMasses',
  description:
    'A dry run: tries masses on a copy of the project and says what getIssues would then say, changing nothing (no undo step). Each candidate is a new block (a program, a rectangle or points: its outer face; as addMass makes it) or a mass there is (`mass`) in a new place or shape; `remove` takes masses out of the trial. Returns each candidate’s id (a new one’s is not kept), area and Issues, every Issue of the option with whether it is new, the totals and the coverage. Try a whole layout in one call, then apply it with addMass / updateMass.',
  kind: 'read',
  verbs: [],
  input: z.object({
    option: OPTION,
    level: z.string().optional().describe('The level new masses stand on; absent: the one in view'),
    masses: z.array(CANDIDATE).min(1),
    remove: z.array(z.string()).optional().describe('Masses taken out of the trial'),
    flow: z.boolean().default(true).describe('false: skip the roads (faster; no gate, access or road Issues)'),
  }),
  run(p, input, ctx) {
    const option = optionOf(p, ctx, input.option)
    const level = need(allLevels(p), input.level ?? ctx.level, 'level').id
    const tried = tryMasses(p, level, option.id, input.masses, input.remove)
    return { project: p, output: judge(p, tried.project, option.id, tried.ids, input.flow) }
  },
})

// ---- Packing (8.6): N masses of a program, laid out in rows with their courts, checked as above ----

/**
 * Issues that rule a placed mass out: any error, or its court broken, or an overlap. Not its access: the buildings come
 * first, then the streets that reach them (Decision "Streets", ST.4: no road is derived to reach a mass placed).
 */
const BREAKS = new Set(['court', 'overlap'])
/** Times a layout is checked again after leaving out what broke. */
const ROUNDS = 3
const clean = (c: { issues: { code: string; severity: string }[] }) => c.issues.every((i) => i.severity !== 'error' && !BREAKS.has(i.code))

/** m: a buildable edge at least this long is a direction rows may run along. */
const LONG_EDGE = 60

/** Directions rows may run (degrees, 0–180): the buildable area's minimum rectangle and square to it, its long edges, the axes. */
function rowAngles(regions: Polygon[][]): number[] {
  const deg = (u: Point) => (((Math.atan2(u.y, u.x) * 180) / Math.PI) % 180 + 180) % 180
  const outers = regions.map((r) => r[0]).filter((r) => r && r.length >= 3)
  const pts = outers.flat()
  const out: number[] = []
  if (pts.length >= 3) {
    const main = deg(minimumRectangle(pts).u)
    out.push(main, (main + 90) % 180)
  }
  for (const r of outers)
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length]
      if (Math.hypot(b.x - a.x, b.y - a.y) >= LONG_EDGE) out.push(deg({ x: b.x - a.x, y: b.y - a.y }))
    })
  out.push(0, 90)
  // one of each, to a degree
  return out.reduce<number[]>((acc, a) => (acc.some((b) => Math.abs(((a - b + 270) % 180) - 90) < 1) ? acc : [...acc, Math.round(a * 100) / 100]), [])
}

export const packMasses = tool({
  name: 'packMasses',
  description:
    'Lays out `count` blocks of a program in the buildable area, around what is there: rows of rectangles of the area asked (down to its tolerance), in the proportions and directions allowed, `gap` apart; for a program with docks, rows in pairs facing each other across room for a shared truck court (its depth kept free between the rows), the court inside the site. The blocks placed are drawn with no docks of their own: they go on their walls in the block editor. Every layout found is checked as getIssues would (no errors, no court or overlap Issue on a mass placed; the streets that reach them come after, addStreet); the best is returned as rectangles, and placed (one undo step) with apply. If fewer fit, it says how many and why: the coverage limit, the buildable area, or the site’s shape and the room courts and roads need.',
  kind: 'edit',
  verbs: ['drawBlock'],
  input: z.object({
    program: z.string().describe('A program id'),
    count: z.number().int().min(1).max(200),
    area: z.number().positive().optional().describe('m² per mass; absent: the program’s target area per mass, or its new-mass area'),
    tolerance: z.number().min(0).max(0.5).default(0.1).describe('How much smaller a mass may be, as a fraction (0.1: down to 90 %)'),
    aspects: z.array(z.number().min(1)).min(1).optional().describe('Long side / short side to try; absent: 1.5, 2, 2.5, 3 (no more than the program’s maximum)'),
    angles: z.array(z.number()).min(1).optional().describe('Directions the rows may run, degrees counter-clockwise; absent: along the buildable area and square to it, along its long edges, and the axes'),
    gap: z.number().min(0).optional().describe('m between masses side by side and back to back; absent: room for a street with its clearance on both sides (roadWidth + 2 × ringClear)'),
    option: OPTION,
    level: z.string().optional().describe('The level the masses stand on; absent: the one in view'),
    apply: z.boolean().default(false).describe('true: place the layout found (one undo step); false: only say it'),
  }),
  run(p, input, ctx) {
    const option = optionOf(p, ctx, input.option)
    const level = need(allLevels(p), input.level ?? ctx.level, 'level').id
    const program = need(p.programs, input.program, 'program')
    const s = standardsOf(p)
    const t = program.target
    const area = input.area ?? (t?.area && t.count ? t.area / t.count : program.massArea)
    if (!area) throw new ToolError(`Say the area of each ${program.name} mass (area).`)
    const d = derive(p, option.id)
    if (!d.site.polygon) throw new ToolError('The site has no boundary yet: draw it first (setBoundary).')
    const gap = input.gap ?? s.roadWidth + 2 * s.ringClear
    const court = program.docks ? s.courtDepth : null
    const areas = [...new Set([area, area * (1 - input.tolerance / 2), area * (1 - input.tolerance)])]
    const smallest = Math.min(...areas)

    // the coverage limit: no more than it allows
    const cap = p.site.rules.maxCoverage
    const allowed = cap === null ? Infinity : cap * d.metrics.siteArea - d.metrics.builtFootprint
    const byCoverage = program.built ? Math.max(0, Math.floor(allowed / smallest + 1e-9)) : Infinity
    const count = Math.min(input.count, byCoverage)

    const angles = input.angles ?? rowAngles(d.site.buildable)
    const aspects = input.aspects ?? [1.5, 2, 2.5, 3].filter((a) => !program.maxAspect || a <= program.maxAspect)
    const asCandidates = (ms: PackedMass[]) => ms.map((m) => ({ program: program.id, x: m.center.x, y: m.center.y, width: m.width, depth: m.depth, rotation: m.rotation }))
    // what is there: the option's masses on the ground and their courts
    const shownIds = new Set(option.buildingIds)
    const there = Object.values(d.masses).filter((m) => shownIds.has(m.buildingId) && m.polygon.length >= 3 && m.span[0] <= 1e-6)
    const kept = [...there.map((m) => m.polygon), ...d.circulation.docks.flatMap(courtShapes)].map(toCounterClockwise)
    const courtRoom = difference(offset([d.site.polygon], -s.roadWidth).flat(), there.map((m) => toCounterClockwise(m.polygon)))

    /** The best layout `gap` apart: each found checked as getIssues would; a mass that breaks something is left out, a
     *  spare (a layout may place more than asked) takes its place, and the rest is checked again. */
    const attempt = (gap: number) => {
      const room = kept.length ? difference(d.site.buildable.flat(), offset(kept, gap).flat()) : d.site.buildable
      const layouts = count > 0 ? pack({ room, courtRoom, count, areas, aspects: aspects.length ? aspects : [1], angles, gap, court }) : []
      let best: { layout: Packed; masses: PackedMass[]; verdict: ReturnType<typeof judge> } | null = null
      for (const layout of layouts) {
        let pool = layout.masses
        let masses = pool.slice(0, count)
        let tried = tryMasses(p, level, option.id, asCandidates(masses))
        let verdict = judge(p, tried.project, option.id, tried.ids)
        for (let round = 0; round < ROUNDS && !verdict.candidates.every(clean); round++) {
          const bad = new Set(masses.filter((_, k) => !clean(verdict.candidates[k])))
          pool = pool.filter((m) => !bad.has(m))
          masses = pool.slice(0, count)
          tried = tryMasses(p, level, option.id, asCandidates(masses))
          verdict = judge(p, tried.project, option.id, tried.ids)
        }
        if (!verdict.candidates.every(clean)) continue
        const better = !best || masses.length > best.masses.length || (masses.length === best.masses.length && verdict.totals.new < best.verdict.totals.new)
        if (better) best = { layout, masses, verdict }
        if (masses.length >= count && verdict.totals.new === 0) break
      }
      return { best, room }
    }
    const { best, room } = attempt(gap)

    const placed = best?.masses.length ?? 0
    let limit: { reason: string; message: string; closer?: { gap: number; placed: number }[] } | null = null
    if (placed < input.count) {
      const roomArea = regionsArea(room)
      if (byCoverage < input.count && placed >= byCoverage)
        limit = {
          reason: 'coverage',
          message: `The coverage limit (${Math.round((cap ?? 0) * 100)} % of the site) leaves ${Math.round(allowed)} m² to build: ${byCoverage} masses of ${Math.round(smallest)} m².`,
        }
      else if (input.count * smallest * (court === null ? 1.3 : 1.8) > roomArea)
        limit = {
          reason: 'buildable-area',
          message: `${input.count} masses of ${Math.round(smallest)} m²${court === null ? '' : ' with their truck courts'} and the roads between them need more than the ${Math.round(roomArea)} m² of buildable area free.`,
        }
      else {
        // closer together (the gap not asked for): how many would fit, for the designer to choose
        const closer =
          input.gap === undefined
            ? [2 * s.ringClear, s.roadWidth].filter((g) => g < gap).map((g) => ({ gap: g, placed: attempt(g).best?.masses.length ?? 0 })).filter((c) => c.placed > placed)
            : []
        limit = {
          reason: 'shape',
          message: `The site’s shape and the room between masses (${gap} m apart${court === null ? '' : `, ${court} m truck courts inside the site`}) fit ${placed} masses of ${Math.round(best?.layout.area ?? smallest)} m²${
            closer.length ? `; closer together more fit (${closer.map((c) => `${c.placed} at gap ${c.gap} m`).join(', ')}): one street between two masses then serves both` : '; try other directions (angles), proportions (aspects) or a smaller area'
          }.`,
          ...(closer.length && { closer }),
        }
      }
    }
    const out = {
      program: program.id,
      asked: input.count,
      placed,
      area: best ? cm(best.layout.area) : null,
      aspect: best?.layout.aspect ?? null,
      angle: best?.layout.angle ?? null,
      masses: (best?.masses ?? []).map((m) => ({ x: cm(m.center.x), y: cm(m.center.y), width: cm(m.width), depth: cm(m.depth), rotation: cm(m.rotation) })),
      issues: best ? { totals: best.verdict.totals, new: best.verdict.issues.filter((i) => i.new).map((i) => `${i.code}: ${i.message}`) } : null,
      limit,
      applied: false as boolean | Id[],
    }
    if (!input.apply || !best || placed === 0) return { project: p, output: out }
    // the layout placed as blocks (Phase D.2): each a building of its own, of the program's type, its rectangle its outer face
    const made = tryMasses(p, level, option.id, asCandidates(best.masses))
    return { project: made.project, output: { ...out, applied: made.ids } }
  },
})

export const SITE_TOOLS = [getSite, getDocks, checkMasses, packMasses]
