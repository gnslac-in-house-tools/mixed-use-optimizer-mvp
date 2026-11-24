// The readings (Decision "Agent tools"): what an agent looks at before and after it changes something. The figures
// and checks come from the engine, never from the model's own sums: it reads them, then explains them.
import { z } from 'zod'
import { FLOW_ISSUES } from '../../engine/circulation/index.ts'
import { derive } from '../../engine/derive.ts'
import { streetTypesOf } from '../../engine/circulation/streets.ts'
import { footprintContour, footprintPolygon } from '../../engine/geom/footprint.ts'
import { area } from '../../engine/geom/polygon.ts'
import { kpiCatalog, readKpi } from '../../modules/catalog.ts'
import { massIsLocked } from '../../kinds/locked.ts'
import type { Contour, Project } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { need, tool, type ToolContext } from './tool.ts'
import { hallRuns } from '../../modules/warehouse/engine/generate.ts'
import { drawingsOf } from './site.ts'

const OPTION = z.string().optional().describe('An option id; absent: the one in view')

const optionOf = (p: Project, ctx: ToolContext, id?: string) => need(p.options, id ?? ctx.option, 'option')

export const getProject = tool({
  name: 'getProject',
  description:
    'The project as ids and names: its site rules, programs with their brief, buildings with their levels, options, the rules between programs, the masses of one option with their program, level, size and area, and the imported drawings by file (their layers, parcels, locks and split). Read it first: every other tool takes these ids and names.',
  kind: 'read',
  verbs: [],
  input: z.object({ option: OPTION }),
  run(p, input, ctx) {
    const option = optionOf(p, ctx, input.option)
    const d = derive(p, option.id)
    const shown = new Set(option.buildingIds)
    const levels = p.buildings.filter((b) => shown.has(b.id)).flatMap((b) => b.levels.map((l) => l.id))
    return {
      project: p,
      output: {
        id: p.id,
        name: p.name,
        typology: p.typology,
        units: 'metres, square metres, degrees counter-clockwise; x east, y north',
        siteRules: p.site.rules,
        gates: (option.gates ?? p.site.gates ?? []).map((g) => ({ id: g.id, t: g.t, ...(g.on ? { on: g.on } : {}), width: g.width, flow: g.flow, vehicles: g.vehicles, locked: g.locked ?? false })),
        existingRoads: (p.site.existingRoads ?? []).map((r) => ({ id: r.id, name: r.name ?? null, width: r.stretches[0].left + r.stretches[0].right, stretches: r.stretches, points: r.points, ...(r.locked ? { locked: true } : {}), ...(r.group ? { group: r.group } : {}) })),
        streets: option.streets ?? { nodes: [], segments: [] },
        streetTypes: streetTypesOf(p, option),
        // the warehouse types (blocks), their truck courts (setBlockCourt; Decision "Truck court") and their column lines
        // along each axis, m from the first (setBlockGridLine, setBlockEndJoin; Decision "Grid by line")
        warehouseTypes: (p.warehouseTypes ?? []).map((t) => {
          const runs = hallRuns(t)
          return { id: t.id, name: t.name, court: t.court ?? null, columnLines: { x: runs.x.lines, y: runs.y.lines }, ownLines: !!t.grid.lines, joinUnder: t.hall.joinUnder ?? null }
        }),
        parking: option.parking ?? null,
        // its parking lots (Decision "Lot tool"), as laid out: against which wall, their rows and stalls, their entrance
        lots: d.circulation.lots.map((l) => ({
          id: l.id,
          name: l.name,
          anchor: l.anchor ? { mass: l.anchor.massId, wall: l.anchor.facing, ...(option.lots?.find((x) => x.id === l.id)?.anchor?.length !== undefined ? { from: l.frame.a0, length: l.length } : {}) } : null,
          rect: option.lots?.find((x) => x.id === l.id)?.rect ?? null,
          rows: l.rows,
          stalls: l.stalls.length,
          sizes: l.sizes,
          entrance: { end: l.entrance.end, reached: l.reached },
          locked: option.lots?.find((x) => x.id === l.id)?.locked ?? false,
        })),
        programs: p.programs.map((x) => ({ id: x.id, name: x.name, built: x.built, target: x.target ?? null })),
        buildings: p.buildings.map((b) => ({
          id: b.id,
          name: b.name,
          context: b.context ?? false,
          locked: b.locked ?? false,
          levels: b.levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation, height: l.height, floors: l.repeat })),
        })),
        options: p.options.map((o) => ({ id: o.id, name: o.name, buildingIds: o.buildingIds, inView: o.id === option.id })),
        rules: p.rules ?? [],
        // the imported drawings by file name (Decision "Drawings move"): what moveDrawings and the locks take
        drawings: drawingsOf(p),
        masses: p.masses
          .filter((m) => levels.includes(m.levelId))
          .map((m) => ({
            id: m.id,
            name: m.name,
            programId: m.programId,
            levelId: m.levelId,
            footprint:
              m.footprint.kind === 'rect'
                ? { kind: 'rect', center: m.footprint.center, width: m.footprint.width, depth: m.footprint.depth, rotation: m.footprint.rotation }
                : { kind: 'contour', corners: m.footprint.contour.vertices.length, see: 'getMassOutline' },
            area: Math.round(d.masses[m.id]?.area ?? 0),
            height: m.height ?? null,
            locked: massIsLocked(p, m),
          })),
      },
    }
  },
})

export const getKpis = tool({
  name: 'getKpis',
  description: 'The figures of one option: every KPI the app measures (areas, coverage, issues, per program and building), with its unit, limit and whether it is over.',
  kind: 'read',
  verbs: [],
  input: z.object({ option: OPTION, ids: z.array(z.string()).optional().describe('Only these KPI ids; absent: all') }),
  run(p, input, ctx) {
    const option = optionOf(p, ctx, input.option)
    const d = derive(p, option.id)
    const defs = kpiCatalog(p).filter((k) => !input.ids || input.ids.includes(k.id))
    return { project: p, output: defs.map((k) => ({ ...readKpi(k.id, p, d), help: k.help })) }
  },
})

export const getIssues = tool({
  name: 'getIssues',
  description:
    'What is wrong with one option, from the app’s checks: each issue’s code, error or warning, message, the masses, rule or program it is about, and its step: massing (the masses settle it) or flow (the roads and gates do).',
  kind: 'read',
  verbs: [],
  input: z.object({ option: OPTION }),
  run(p, input, ctx) {
    const option = optionOf(p, ctx, input.option)
    // without where its chip stands: the masses, rule or program say it
    return {
      project: p,
      output: derive(p, option.id).issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
        massIds: i.massIds,
        rule: i.rule,
        program: i.program,
        step: FLOW_ISSUES.includes(i.code) ? 'flow' : 'massing',
      })),
    }
  },
})

const cm = (n: number) => Math.round(n * 100) / 100

/** An outline's corners and walls by index, as the shape tools take them. */
function cornersOf(c: Contour) {
  const v = c.vertices
  return {
    corners: v.map((q, i) => ({ i, x: cm(q.x), y: cm(q.y), radius: q.r, ...(q.chamfer && { chamfer: [cm(q.chamfer[0]), cm(q.chamfer[1])] }) })),
    walls: v.map((q, i) => {
      const n = v[(i + 1) % v.length]
      return { i, length: cm(Math.hypot(n.x - q.x, n.y - q.y)), ...(c.arcs?.[String(i)] !== undefined && { arc: true }) }
    }),
  }
}

export const getMassOutline = tool({
  name: 'getMassOutline',
  description:
    'One mass’s outline corner by corner, counter-clockwise: each corner’s index, point and radius (and its chamfer, [a, b] m cut back along the wall into it and the wall out of it, when it has one: no tool sets one), and each wall’s index (from corner i to i + 1) and length; then its holes, each with its index, corridor and the same corners and walls. moveVertex, insertVertex, removeVertex, setCornerRadius and moveWall take these indices; the hole tools take a hole’s.',
  kind: 'read',
  verbs: [],
  input: z.object({ mass: z.string().describe('A mass id') }),
  run(p, input) {
    const m = need(p.masses, input.mass, 'mass')
    // a block's face (its walls as its writer counts them), not its faceted footprint: a chamfer is one corner, not two
    const c = actions.shapeOf(p, { kind: 'mass', id: m.id })?.contour ?? footprintContour(m.footprint)
    const corridors = derive(p).masses[m.id]?.corridors ?? []
    return {
      project: p,
      output: {
        id: m.id,
        name: m.name,
        kind: m.footprint.kind,
        area: cm(area(footprintPolygon(m.footprint))),
        ...cornersOf(c),
        holes: (m.holes ?? []).map((h, k) => ({
          k,
          corridor: h.corridor ?? 0,
          ...(corridors.some((x) => x.k === k) && { corridorArea: cm(corridors.find((x) => x.k === k)!.area) }),
          ...cornersOf(h),
        })),
      },
    }
  },
})

export const READ_TOOLS = [getProject, getMassOutline, getKpis, getIssues]
