// The core's kinds of *What may change* (Decisions "Optimizer plugin", "Optimization pipeline", "Masses template",
// "Fixed size" and "Catalog"; what every kind shares: modules/vary.ts). Each writes through the verbs the UI and MCP
// use (updateGrid, setDimensionLength, updateLevel, moveMasses, rotateMasses, updateMass, updateGate,
// setOptionStandards). Until Phase M.8 the circulation is core, so the gates and road widths are here (the ring roads
// went with ST.4, Decision "Streets").
//   grid.bay          the option's grid's bay each way (Phase G.4, Decision "Structural grid"), ±range m around its own,
//                     into the option's own grid (ownGrid, updateGrid); with no grid, none
//   grid.module       how many modules its bay has, 1 to range
//   grid.angle        its angle, ±range° around its own
//   grid.origin       where it starts, within one bay of where it was each way, by whole modules
//   dimension.length  a dimension on one free mass (both ends on its corners, not locked): its length, ±range (a share
//                     of it, 20 %), through setDimensionLength, the verb a typed length uses (it stretches the same wall)
//   level.height      a level's floor-to-floor height, ±range m around its own (never under MIN_FLOOR_HEIGHT)
//   level.floors      a level's floors (×N), 1 to range; with it, each mass's footprint follows its floors: the
//                     brief's area per mass ÷ its floors (without one, the floor area it has, kept)
//   mass.proportion   a free rect's width at its area (depth = area ÷ width), up to its program's N:1 either way
//                     (programAspect); a rect whose program fixes its size takes that size. On the grid, a rect on it:
//                     its width in whole modules, its depth the whole modules nearest its area (proportion in bays)
//   mass.rotation     a mass's rotation, wrapping at 360°: a rect's from the site's main axis (its street, else its
//                     longest side), a contour's from the way it is drawn. On the grid, from its axes, by quarters
//   mass.position     a mass's centre (a contour's centroid), inside the buildable area's bounds. On the grid, its box's
//                     low corner along the grid's axes, on whole modules (so a rect on the grid stays on its lines)
//   gate.position     a gate on a boundary side (Decision "Masses + Circulation"): metres along it, half its width
//                     from each corner (as the plan slides it), into the option's own gates (the site's stay; Keep carries
//                     the option's)
//   gate.vehicles     a gate: for whom (a choice: trucks · cars · all; Decision "Circulation
//                     optimization": a gate per flow), into the option's own gates
//   road.width        the road widths whose standards give a range to search (Phase K.4, the Brief's Circulation tab):
//                     the option's own
//   streets.connect   no gene (ST.8, Decision "Streets"): written after the gates and the widths, it runs Connect, so
//                     each specimen's courts get their ways from its own gates, as streets of the trucks' type
import { buildingOfLevel, optionOf } from '../../engine/buildings.ts'
import { clampToStretch } from '../../engine/circulation/access.ts'
import { gatesOf } from '../../engine/circulation/gates.ts'
import { gateRange } from '../../engine/circulation/gateGeometry.ts'
import { SEARCHED_STANDARDS, standardsOf } from '../../engine/circulation/standards.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { stretchLength } from '../../engine/geom/perimeter.ts'
import { axesOf, gridOf, moduleOf, rectOnGrid, toGrid } from '../../engine/grid/index.ts'
import { VEHICLES, type Dimension, type Grid, type Id, type Mass, type Point, type Project } from '../../model/schema.ts'
import { ownGates, setOptionStandards, updateGate } from '../../state/actions/circulation.ts'
import { setDimensionLength } from '../../state/actions/dimensions.ts'
import { connectStreets } from '../../state/actions/streets.ts'
import { ownGrid, updateGrid } from '../../state/actions/grid.ts'
import { updateLevel } from '../../state/actions/levels.ts'
import { moveMasses, rotateMasses, updateMass } from '../../state/actions/masses.ts'
import {
  centreOf,
  DIMENSION_RANGE,
  GRID_ANGLE_RANGE,
  GRID_BAY_RANGE,
  HEIGHT_RANGE,
  MAX_FLOORS,
  MIN_FLOOR_HEIGHT,
  MOST_MODULES,
  widths,
  type Context,
  type ParamKind,
  type Variable,
} from '../vary.ts'

const massOf = (p: Project, id: Id) => p.masses.find((m) => m.id === id)
const levelIn = (p: Project, id: Id) => buildingOfLevel(p, id)?.levels.find((l) => l.id === id)
const rect = (m: Mass | undefined) => (m?.footprint.kind === 'rect' ? m.footprint : null)
const grouped = (ctx: Context, id: Id) => (ctx.units.get(id)?.length ?? 1) > 1
/** May its floors or its proportion change its shape: alone, and its dimensions do not hold it. */
const reshapes = (ctx: Context, id: Id) => !grouped(ctx, id) && !ctx.held.has(id)
const lengthOf = (d: Pick<Dimension, 'a' | 'b'>) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
/** An angle in [0, 360). */
const turn = (a: number) => ((a % 360) + 360) % 360

const dimension: ParamKind = {
  id: 'dimension.length',
  module: 'core',
  order: 70,
  rank: 13,
  area: 'massing',
  role: 'masses',
  label: 'Dimensions',
  help: 'The unlocked dimensions on one mass: its sides as you dimensioned them',
  fields: 'share-step',
  hint: 'm',
  unit: 'm',
  step: 1,
  range: DIMENSION_RANGE,
  variables(ctx, { step, range }) {
    return ctx.knobs.flatMap((d): Variable[] => {
      const l = lengthOf(d)
      const min = Math.max(step, Math.floor(l * (1 - range)))
      const max = Math.ceil(l * (1 + range))
      if (max - min < step) return []
      const m = ctx.masses.find((x) => x.id === d.anchorA!.massId)!
      return [
        {
          key: `${d.id}.length`,
          kind: 'dimension.length',
          target: d.id,
          label: `${m.name} · ${Math.round(l * 10) / 10} m dimension`,
          gene: { kind: 'real', min, max, step },
          read: (p) => {
            const now = p.dimensions?.find((x) => x.id === d.id)
            return now ? lengthOf(now) : l
          },
        },
      ]
    })
  },
  write(p, values, ctx) {
    return ctx.knobs.reduce((q, d) => {
      const v = values.get(`${d.id}.length`)
      // a length the mass cannot take leaves it as it is (the verb says why)
      return v === undefined ? q : setDimensionLength(q, d.id, v).project
    }, p)
  },
}

const height: ParamKind = {
  id: 'level.height',
  module: 'core',
  order: 80,
  rank: 5,
  area: 'massing',
  label: 'Floor height',
  help: 'Each level’s floor-to-floor height; the levels above follow',
  fields: 'range-step',
  hint: 'm',
  unit: 'm',
  step: 0.5,
  range: HEIGHT_RANGE,
  variables(ctx, { step, range }) {
    return ctx.levels.map((l) => ({
      key: `${l.id}.height`,
      kind: 'level.height',
      target: l.id,
      label: `${l.name} · floor height`,
      gene: { kind: 'real', min: Math.max(MIN_FLOOR_HEIGHT, l.height - range), max: l.height + range, step },
      read: (p) => levelIn(p, l.id)?.height ?? l.height,
    }))
  },
  write(p, values, ctx) {
    return ctx.levels.reduce((q, l) => {
      const h = values.get(`${l.id}.height`)
      return h === undefined ? q : updateLevel(q, l.id, { height: h })
    }, p)
  },
}

const floors: ParamKind = {
  id: 'level.floors',
  module: 'core',
  order: 90,
  rank: 6,
  area: 'massing',
  role: 'masses',
  label: 'Floors',
  help: 'Each level’s floors; a footprint follows them (the brief’s area over its floors)',
  fields: 'floors',
  hint: '',
  unit: 'floors',
  step: 1,
  range: MAX_FLOORS,
  variables(ctx, { step, range }) {
    return ctx.levels.map((l) => ({
      key: `${l.id}.floors`,
      kind: 'level.floors',
      target: l.id,
      label: `${l.name} · floors`,
      gene: { kind: 'real', min: 1, max: Math.max(1, Math.round(range)), step: Math.max(1, Math.round(step)) },
      read: (p) => levelIn(p, l.id)?.repeat ?? l.repeat,
    }))
  },
  write(p, values, ctx) {
    let q = p
    for (const l of ctx.levels) {
      const n = values.get(`${l.id}.floors`)
      if (n === undefined) continue
      q = updateLevel(q, l.id, { repeat: n })
      // each rect standing on it: its footprint follows its floors, its proportion kept (mass.proportion sets it); a
      // fixed size or one its dimensions hold stays
      for (const m of ctx.masses) {
        const f = rect(massOf(q, m.id))
        if (m.levelId !== l.id || !f || !reshapes(ctx, m.id) || ctx.fixed.has(m.id)) continue
        const k = Math.sqrt(ctx.floorArea.get(m.id)! / n / (f.width * f.depth))
        q = updateMass(q, m.id, { footprint: { ...f, width: f.width * k, depth: f.depth * k } })
      }
    }
    return q
  },
}

const proportion: ParamKind = {
  id: 'mass.proportion',
  module: 'core',
  order: 100,
  rank: 4,
  area: 'massing',
  role: 'masses',
  label: 'Proportion',
  help: 'A rect’s width at its area, up to its program’s N:1; a size fixed in the Brief (🔒) stays',
  fields: 'step',
  hint: 'm',
  unit: 'm',
  step: 1,
  variables(ctx, { step }) {
    return ctx.masses.flatMap((m): Variable[] => {
      const f = rect(m)
      if (!f || !reshapes(ctx, m.id) || ctx.fixed.has(m.id)) return []
      // with the floors in the template, the area runs from its floor area over the most floors to over one
      const area = ctx.floorArea.get(m.id)!
      const range = ctx.active.has('level.floors') && ctx.levels.some((l) => l.id === m.levelId) ? [area / MAX_FLOORS, area] : [f.width * f.depth, f.width * f.depth]
      const aspect = ctx.aspect.get(m.id)!
      const low = widths(range[0], aspect)
      const high = widths(range[1], aspect)
      if (ctx.gridded.has(m.id)) {
        // in whole modules along the way its width runs (proportion in bays)
        const along = moduleAlong(ctx.grid!, f).width
        const min = Math.max(1, Math.ceil((low?.[0] ?? f.width) / along - 1e-9))
        const max = Math.floor((high?.[1] ?? f.width) / along + 1e-9)
        if (max - min < 1) return []
        return [
          {
            key: `${m.id}.width`,
            kind: 'mass.proportion',
            target: m.id,
            label: `${m.name} · width in modules`,
            gene: { kind: 'real', min, max, step: 1 },
            read: (p) => (rect(massOf(p, m.id))?.width ?? f.width) / along,
          },
        ]
      }
      if (!low || !high || high[1] - low[0] < step) return []
      return [
        {
          key: `${m.id}.width`,
          kind: 'mass.proportion',
          target: m.id,
          label: `${m.name} · width`,
          gene: { kind: 'real', min: low[0], max: high[1], step },
          read: (p) => rect(massOf(p, m.id))?.width ?? f.width,
        },
      ]
    })
  },
  write(p, values, ctx) {
    let q = p
    for (const m of ctx.masses) {
      const f = rect(massOf(q, m.id))
      if (!f || !reshapes(ctx, m.id)) continue
      const size = ctx.fixed.get(m.id)
      if (size) {
        // the brief fixes it: exactly that rectangle, turned as it is
        if (f.width !== size.width || f.depth !== size.depth) q = updateMass(q, m.id, { footprint: { ...f, ...size } })
        continue
      }
      const w = values.get(`${m.id}.width`)
      if (w === undefined) continue
      // the area it has now (its floors may have changed it): the width is kept inside what that area allows
      const area = f.width * f.depth
      const g = ctx.gridded.has(m.id) ? (gridOf(q, ctx.option.id) ?? ctx.grid) : null
      if (g && rectOnGrid(g, f)) {
        // whole modules: its width as the gene says, its depth the whole modules nearest its area
        const along = moduleAlong(g, f)
        const width = Math.max(1, Math.round(w)) * along.width
        const depth = Math.max(1, Math.round(area / width / along.depth)) * along.depth
        q = updateMass(q, m.id, { footprint: { ...f, width, depth } })
        continue
      }
      const fits = widths(area, ctx.aspect.get(m.id)!)
      if (!fits) continue
      const width = Math.min(fits[1], Math.max(fits[0], w))
      q = updateMass(q, m.id, { footprint: { ...f, width, depth: area / width } })
    }
    return q
  },
}

const rotation: ParamKind = {
  id: 'mass.rotation',
  module: 'core',
  order: 110,
  rank: 3,
  area: 'massing',
  role: 'masses',
  label: 'Rotation',
  help: 'Each mass turns from the site’s main axis (a contour, from the way it is drawn)',
  fields: 'step',
  hint: '°',
  unit: '°',
  step: 15,
  variables(ctx, { step: given }) {
    // on the grid, a mass turns with its axes: by quarters, from its angle (ctx.axis)
    const step = ctx.grid ? 90 : given
    return ctx.masses.flatMap((m): Variable[] =>
      ctx.pinned.has(m.id)
        ? []
        : [
            {
              key: `${m.id}.rotation`,
              kind: 'mass.rotation',
              target: m.id,
              label: `${m.name} · rotation`,
              gene: { kind: 'real', min: 0, max: 360, step, wrap: true },
              // a contour has no rotation of its own: it turns from the way it is drawn
              read: (p) => (rect(m) ? turn((rect(massOf(p, m.id))?.rotation ?? 0) - ctx.axis) : 0),
            },
          ],
    )
  },
  write(p, values, ctx) {
    let q = p
    for (const m of ctx.masses) {
      const r = values.get(`${m.id}.rotation`)
      const now = massOf(q, m.id)
      if (r === undefined || !now) continue
      const f = rect(now)
      const by = f ? turn(ctx.axis + r - f.rotation) : turn(r)
      // a unit turns whole, about the middle of its bounds
      if (Math.abs(by) > 1e-9 && Math.abs(by - 360) > 1e-9) q = rotateMasses(q, ctx.units.get(m.id)!, by > 180 ? by - 360 : by)
    }
    return q
  },
}

const position: ParamKind = {
  id: 'mass.position',
  module: 'core',
  order: 120,
  rank: 2,
  area: 'massing',
  role: 'masses',
  label: 'Position',
  help: 'Each mass’s centre, inside the buildable area',
  fields: 'step',
  hint: 'm',
  unit: 'm',
  step: 1,
  variables(ctx, { step }) {
    if (ctx.grid) return gridPositions(ctx)
    const { minX, minY, maxX, maxY } = ctx.area
    return ctx.masses.flatMap((m): Variable[] => {
      const at = (p: Project) => {
        const now = massOf(p, m.id)
        return now ? centreOf(now) : centreOf(m)
      }
      return [
        { key: `${m.id}.x`, kind: 'mass.position', target: m.id, label: `${m.name} · x`, gene: { kind: 'real', min: minX, max: maxX, step }, read: (p) => at(p).x },
        { key: `${m.id}.y`, kind: 'mass.position', target: m.id, label: `${m.name} · y`, gene: { kind: 'real', min: minY, max: maxY, step }, read: (p) => at(p).y },
      ]
    })
  },
  write(p, values, ctx) {
    if (ctx.grid) return writeGridPositions(p, values, ctx)
    let q = p
    for (const m of ctx.masses) {
      const x = values.get(`${m.id}.x`)
      const y = values.get(`${m.id}.y`)
      const now = massOf(q, m.id)
      if ((x === undefined && y === undefined) || !now) continue
      const c = centreOf(now)
      const d = { x: (x ?? c.x) - c.x, y: (y ?? c.y) - c.y }
      // a unit moves whole; followers come with it (moveMasses)
      if (Math.abs(d.x) > 1e-9 || Math.abs(d.y) > 1e-9) q = moveMasses(q, ctx.units.get(m.id)!, d)
    }
    return q
  },
}

const gate: ParamKind = {
  id: 'gate.position',
  module: 'core',
  order: 150,
  rank: 14,
  area: 'flow',
  role: 'circulation',
  label: 'Gates',
  help: 'Each gate slides along its side, as the plan slides it (a boundary side, or the side of a street it stands on); the site’s gates stay',
  fields: 'step',
  hint: 'm',
  unit: 'm',
  step: 5,
  variables(ctx, { step }) {
    return ctx.gates.map((g): Variable => ({
      key: `${g.id}.along`,
      kind: 'gate.position',
      target: g.id,
      label: `${g.name} · along`,
      gene: { kind: 'real', min: g.margin, max: Math.max(g.margin, g.length - g.margin), step },
      read: (p) => {
        const x = gatesOf(p, ctx.option.id).find((y) => y.id === g.id)
        if (g.on) return x?.on ? x.on.at - g.on.from : g.margin
        return x?.t === undefined ? g.margin : stretchLength(g.from, x.t) * ctx.perimeter
      },
    }))
  },
  write(p, values, ctx) {
    if (ctx.gates.length === 0) return p
    let q = ownGates(p, ctx.option.id)
    for (const g of ctx.gates) {
      const along = values.get(`${g.id}.along`)
      if (along === undefined) continue
      const here = gatesOf(q, ctx.option.id).find((x) => x.id === g.id)
      if (g.on) {
        // on a street's side: metres from the side's start, half its width from each end (a side shorter than the gate keeps it in the middle)
        if (here?.on) {
          const [lo, hi] = gateRange({ length: g.length }, g.margin * 2)
          q = updateGate(q, ctx.option.id, g.id, { on: { ...here.on, at: Math.round((g.on.from + Math.min(hi, Math.max(lo, along))) * 1e6) / 1e6 } })
        }
        continue
      }
      q = updateGate(q, ctx.option.id, g.id, { t: clampToStretch(g.from + along / ctx.perimeter, g.from, g.to, g.margin / ctx.perimeter) })
    }
    return q
  },
}

const vehicles: ParamKind = {
  id: 'gate.vehicles',
  module: 'core',
  order: 160,
  rank: 15,
  area: 'flow',
  role: 'circulation',
  label: 'Gates’ vehicles',
  help: 'Each gate’s vehicles: trucks, cars or all (into the option’s own gates)',
  fields: 'choice',
  hint: 'trucks · cars · all',
  unit: 'choice',
  step: 1,
  variables(ctx) {
    return ctx.gates.map((g): Variable => ({
      key: `${g.id}.vehicles`,
      kind: 'gate.vehicles',
      target: g.id,
      label: `${g.name} · for`,
      gene: { kind: 'choice', options: VEHICLES.length },
      choices: VEHICLES,
      read: (p) => Math.max(0, VEHICLES.indexOf(gatesOf(p, ctx.option.id).find((x) => x.id === g.id)?.vehicles ?? 'all')),
    }))
  },
  write(p, values, ctx) {
    const now = (q: Project, id: Id) => gatesOf(q, ctx.option.id).find((x) => x.id === id)?.vehicles
    const changed = ctx.gates.filter((g) => values.has(`${g.id}.vehicles`) && VEHICLES[values.get(`${g.id}.vehicles`)!] !== now(p, g.id))
    if (changed.length === 0) return p
    let q = ownGates(p, ctx.option.id)
    for (const g of changed) q = updateGate(q, ctx.option.id, g.id, { vehicles: VEHICLES[values.get(`${g.id}.vehicles`)!] })
    return q
  },
}

/** The module along a rect's width and along its depth, on that grid. */
function moduleAlong(g: Grid, f: { rotation: number }): { width: number; depth: number } {
  const m = moduleOf(g)
  const half = (((f.rotation - g.angle) % 180) + 180) % 180
  const alongX = Math.min(half, 180 - half) < 1e-6
  return alongX ? { width: m.x, depth: m.y } : { width: m.y, depth: m.x }
}

/** A unit's box low corner in the grid's frame (its masses' outlines). */
function unitLow(p: Project, ids: Id[], g: Grid): Point | null {
  const pts = ids.flatMap((id) => {
    const m = massOf(p, id)
    return m ? footprintPolygon(m.footprint).map((q) => toGrid(g, q)) : []
  })
  return pts.length ? { x: Math.min(...pts.map((q) => q.x)), y: Math.min(...pts.map((q) => q.y)) } : null
}

/** On the grid: each mass's box low corner along the grid's axes, on whole modules inside the buildable area's box. */
function gridPositions(ctx: Context): Variable[] {
  const g = ctx.grid!
  const mod = moduleOf(g)
  const { minX, minY, maxX, maxY } = ctx.gridArea
  return ctx.masses.flatMap((m): Variable[] => {
    const unit = ctx.units.get(m.id)!
    const at = (p: Project) => unitLow(p, unit, gridOf(p, ctx.option.id) ?? g) ?? { x: minX, y: minY }
    const lo = { x: Math.ceil(minX / mod.x - 1e-9) * mod.x, y: Math.ceil(minY / mod.y - 1e-9) * mod.y }
    const hi = { x: Math.max(lo.x, Math.floor(maxX / mod.x + 1e-9) * mod.x), y: Math.max(lo.y, Math.floor(maxY / mod.y + 1e-9) * mod.y) }
    return [
      { key: `${m.id}.x`, kind: 'mass.position', target: m.id, label: `${m.name} · along the grid’s x`, gene: { kind: 'real', min: lo.x, max: hi.x, step: mod.x }, read: (p) => at(p).x },
      { key: `${m.id}.y`, kind: 'mass.position', target: m.id, label: `${m.name} · along the grid’s y`, gene: { kind: 'real', min: lo.y, max: hi.y, step: mod.y }, read: (p) => at(p).y },
    ]
  })
}

/** Each unit moved so its box's low corner is on the module lines the genes say, of the grid it stands on now. */
function writeGridPositions(p: Project, values: Map<string, number>, ctx: Context): Project {
  let q = p
  for (const m of ctx.masses) {
    const x = values.get(`${m.id}.x`)
    const y = values.get(`${m.id}.y`)
    if (x === undefined && y === undefined) continue
    const g = gridOf(q, ctx.option.id) ?? ctx.grid!
    const unit = ctx.units.get(m.id)!
    const low = unitLow(q, unit, g)
    if (!low) continue
    const mod = moduleOf(g)
    const to = { x: Math.round((x ?? low.x) / mod.x) * mod.x, y: Math.round((y ?? low.y) / mod.y) * mod.y }
    const { u, v } = axesOf(g)
    const du = to.x - low.x
    const dv = to.y - low.y
    const d = { x: u.x * du + v.x * dv, y: u.y * du + v.y * dv }
    if (Math.abs(d.x) > 1e-9 || Math.abs(d.y) > 1e-9) q = moveMasses(q, unit, d)
  }
  return q
}

/** The grid an option stands on, as the problem's first kind to change it finds it. */
const gridNow = (p: Project, ctx: Context) => gridOf(p, ctx.option.id) ?? ctx.grid!

// the grid's (Phase G.4, Decision "Structural grid"): into the option's own grid; on it, position and proportion go by modules

const gridBay: ParamKind = {
  id: 'grid.bay',
  module: 'core',
  order: 30,
  rank: 8,
  area: 'site',
  label: 'Grid bays',
  help: 'The grid’s bay each way, ± its range (the option’s own grid; with a grid)',
  fields: 'range-step',
  hint: 'm',
  unit: 'm',
  step: 1.5,
  range: GRID_BAY_RANGE,
  variables(ctx, { step, range }) {
    const g = ctx.grid
    if (!g) return []
    return (['x', 'y'] as const).map((axis) => ({
      key: `grid.${axis}`,
      kind: 'grid.bay',
      target: ctx.option.id,
      label: `Grid · bay ${axis}`,
      gene: { kind: 'real', min: Math.max(step, g[axis] - range), max: g[axis] + range, step },
      read: (p) => gridOf(p, ctx.option.id)?.[axis] ?? g[axis],
    }))
  },
  write(p, values, ctx) {
    const x = values.get('grid.x')
    const y = values.get('grid.y')
    if (!ctx.grid || (x === undefined && y === undefined)) return p
    return updateGrid(ownGrid(p, ctx.option.id), ctx.option.id, { ...(x !== undefined && { x }), ...(y !== undefined && { y }) })
  },
}

const gridModule: ParamKind = {
  id: 'grid.module',
  module: 'core',
  order: 40,
  rank: 9,
  area: 'site',
  label: 'Grid modules',
  help: 'How many modules a bay has (the doors’ unit)',
  fields: 'floors',
  hint: '',
  unit: 'floors',
  step: 1,
  range: MOST_MODULES,
  variables(ctx, { range }) {
    const g = ctx.grid
    if (!g) return []
    return [
      {
        key: 'grid.modules',
        kind: 'grid.module',
        target: ctx.option.id,
        label: 'Grid · modules per bay',
        gene: { kind: 'real', min: 1, max: Math.max(2, Math.round(range)), step: 1 },
        read: (p) => gridOf(p, ctx.option.id)?.modules ?? g.modules,
      },
    ]
  },
  write(p, values, ctx) {
    const n = values.get('grid.modules')
    if (!ctx.grid || n === undefined) return p
    return updateGrid(ownGrid(p, ctx.option.id), ctx.option.id, { modules: Math.max(1, Math.round(n)) })
  },
}

const gridAngle: ParamKind = {
  id: 'grid.angle',
  module: 'core',
  order: 50,
  rank: 10,
  area: 'site',
  label: 'Grid angle',
  help: 'The grid’s angle, ± its range; the masses turn with it',
  fields: 'range-step',
  hint: '°',
  unit: '°',
  step: 5,
  range: GRID_ANGLE_RANGE,
  variables(ctx, { step, range }) {
    const g = ctx.grid
    if (!g) return []
    return [
      {
        key: 'grid.angle',
        kind: 'grid.angle',
        target: ctx.option.id,
        label: 'Grid · angle',
        gene: { kind: 'real', min: g.angle - range, max: g.angle + range, step },
        read: (p) => gridOf(p, ctx.option.id)?.angle ?? g.angle,
      },
    ]
  },
  write(p, values, ctx) {
    const a = values.get('grid.angle')
    if (!ctx.grid || a === undefined) return p
    return updateGrid(ownGrid(p, ctx.option.id), ctx.option.id, { angle: Math.round(a * 1e6) / 1e6 })
  },
}

const gridOrigin: ParamKind = {
  id: 'grid.origin',
  module: 'core',
  order: 60,
  rank: 11,
  area: 'site',
  label: 'Grid origin',
  help: 'Where the grid starts, within one bay each way',
  fields: 'modules',
  hint: '',
  unit: 'm',
  step: 1,
  variables(ctx) {
    const g = ctx.grid
    if (!g) return []
    const m = moduleOf(g)
    // within one bay of where it starts, by whole modules: the same grid one module further each step
    return (['x', 'y'] as const).map((axis) => ({
      key: `grid.o${axis}`,
      kind: 'grid.origin',
      target: ctx.option.id,
      label: `Grid · origin along its ${axis}`,
      gene: { kind: 'real', min: 0, max: Math.max(0, g[axis] - m[axis]), step: m[axis] },
      read: (p) => {
        const now = gridOf(p, ctx.option.id)
        return now ? Math.max(0, toGrid(g, now.origin)[axis]) : 0
      },
    }))
  },
  write(p, values, ctx) {
    const ox = values.get('grid.ox')
    const oy = values.get('grid.oy')
    const g = ctx.grid
    if (!g || (ox === undefined && oy === undefined)) return p
    const { u, v } = axesOf(gridNow(p, ctx))
    const du = ox ?? 0
    const dv = oy ?? 0
    const origin = { x: g.origin.x + u.x * du + v.x * dv, y: g.origin.y + u.y * du + v.y * dv }
    return updateGrid(ownGrid(p, ctx.option.id), ctx.option.id, { origin })
  },
}

const ROAD_LABELS = { roadWidth: 'Road width', carRoadWidth: 'Car road width' } as const

const roadWidth: ParamKind = {
  id: 'road.width',
  module: 'core',
  order: 190,
  rank: 18,
  area: 'flow',
  role: 'circulation',
  label: 'Road widths',
  help: 'The road and car road widths within the range the Brief’s Circulation tab gives them (the option’s own; without a range, none)',
  fields: 'step',
  hint: 'm',
  unit: 'm',
  step: 0.5,
  variables(ctx, { step }) {
    const search = ctx.search
    return SEARCHED_STANDARDS.flatMap((k): Variable[] => {
      const r = search[k]
      if (!r) return []
      return [
        {
          key: `${ctx.option.id}.${k}`,
          kind: 'road.width',
          target: ctx.option.id,
          label: ROAD_LABELS[k],
          gene: { kind: 'real', min: r[0], max: Math.max(r[0], r[1]), step },
          read: (p) => standardsOf(p, optionOf(p, ctx.option.id))[k],
        },
      ]
    })
  },
  write(p, values, ctx) {
    const patch = Object.fromEntries(SEARCHED_STANDARDS.flatMap((k) => (values.has(`${ctx.option.id}.${k}`) ? [[k, values.get(`${ctx.option.id}.${k}`)!]] : [])))
    // only what differs from the option's now is written
    const now = standardsOf(p, optionOf(p, ctx.option.id))
    const changed = Object.entries(patch).filter(([k, v]) => Math.abs(now[k as keyof typeof now] as number - v) > 1e-9)
    return changed.length ? setOptionStandards(p, ctx.option.id, Object.fromEntries(changed)) : p
  },
}

/** Connect in a stage (ST.8): no gene; its writing draws the ways the courts lack, after the gates and the widths. */
const connect: ParamKind = {
  id: 'streets.connect',
  module: 'core',
  order: 195,
  rank: 19,
  area: 'flow',
  role: 'circulation',
  label: 'Connect',
  help: 'Each truck court with no way to a truck gate gets the shortest one, from the specimen’s own gates, as streets of the trucks’ type (nothing to search: it runs on each)',
  fields: 'choice',
  hint: 'runs on each specimen',
  unit: 'choice',
  step: 1,
  variables: () => [],
  write: (p, _values, ctx) => connectStreets(p, ctx.option.id).project,
}

export const CORE_PARAMS: ParamKind[] = [gridBay, gridModule, gridAngle, gridOrigin, dimension, height, floors, proportion, rotation, position, gate, vehicles, roadWidth, connect]
