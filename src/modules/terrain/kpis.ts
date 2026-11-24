// The terrain module's KPI definitions (Decisions "Terrain", "Catalog"): earthwork, steps and slopes, as data like the core's
// (engine/kpis.ts has the type and the rest). Ids never change: saved projects keep the ones they chose.
import { standardsOf } from '../../engine/circulation/standards.ts'
import type { KpiDef } from '../../engine/kpis.ts'
import type { Derived } from '../../engine/types.ts'
import type { Project, Terrain } from '../../model/schema.ts'
import { largestStep, steepestGround } from './engine/checks.ts'
import { surfaceOf } from './engine/surface.ts'

/** The steepest ground of a buildable area, once per ground and area (the site changes far less than the design). */
const steepMade = new WeakMap<Terrain, Map<string, number | null>>()
function steepestBuildable(p: Project, d: Derived): number | null {
  const t = p.site.terrain
  const s = t ? surfaceOf(t) : null
  if (!t || !s) return null
  let made = steepMade.get(t)
  if (!made) steepMade.set(t, (made = new Map()))
  const key = JSON.stringify(d.site.buildable)
  if (!made.has(key)) made.set(key, steepestGround(s, d.site.buildable))
  return made.get(key)!
}

/** The option's design roads' steepest grade, graded (Decision "Graded roads"); null without ground or roads. */
function steepestRoadOf(_p: Project, d: Derived): number | null {
  const roads = d.roadGrading?.roads ?? []
  return roads.length ? Math.max(...roads.map((r) => r.grade)) : null
}

/** The earth the platforms and the graded roads move, each way (m³); null without ground. */
const earthOf = (d: Derived): { cut: number; fill: number } | null =>
  d.earthwork ? { cut: d.earthwork.cut + (d.roadGrading?.cut ?? 0), fill: d.earthwork.fill + (d.roadGrading?.fill ?? 0) } : null

/** The terrain module's: earthwork, steps and slopes. */
export const TERRAIN_KPIS: KpiDef[] = [
  {
    id: 'cut',
    area: 'site',
    label: 'Cut',
    unit: 'm3',
    help: 'The ground the platforms and the graded roads dig out, an estimate (Show’s Terrain: Cut & fill).',
    read: (_p, d) => earthOf(d)?.cut ?? null,
  },
  {
    id: 'fill',
    area: 'site',
    label: 'Fill',
    unit: 'm3',
    help: 'The ground the platforms and the graded roads are built up with, an estimate (Show’s Terrain: Cut & fill).',
    read: (_p, d) => earthOf(d)?.fill ?? null,
  },
  {
    id: 'earth-balance',
    area: 'site',
    label: 'Earth balance',
    unit: 'm3',
    help: 'Cut and fill apart: the ground hauled away or brought in; 0 balances.',
    read: (_p, d) => {
      const e = earthOf(d)
      return e ? Math.abs(e.cut - e.fill) : null
    },
  },
  {
    id: 'earth-moved',
    area: 'site',
    label: 'Earth moved',
    unit: 'm3',
    help: 'Cut and fill together: all the ground the platforms and the graded roads move, an estimate; less is cheaper.',
    read: (_p, d) => {
      const e = earthOf(d)
      return e ? e.cut + e.fill : null
    },
  },
  {
    id: 'largest-step',
    area: 'site',
    label: 'Largest step',
    unit: 'm',
    help: 'The largest difference of level between platforms side by side (what they grade touches).',
    read: (_p, d) => largestStep(d.earthwork),
  },
  {
    id: 'steepest-ground',
    area: 'site',
    label: 'Steepest ground',
    unit: 'pct',
    help: 'The steepest ground of the buildable area, against the site’s maximum slope to build.',
    read: steepestBuildable,
    limit: (p) => p.site.rules.maxSlope ?? null,
    status: (p, d) => {
      const v = steepestBuildable(p, d)
      const max = p.site.rules.maxSlope
      return v === null || !max ? null : v > max + 1e-9 ? 'over' : 'within'
    },
  },
  {
    id: 'steepest-road',
    area: 'flow',
    label: 'Steepest road',
    unit: 'pct',
    help: 'The steepest grade along the design roads, graded: within the max. road grade unless the levels a road joins are too far apart for its length.',
    read: steepestRoadOf,
    limit: (p) => standardsOf(p).maxGrade,
    status: (p, d) => {
      const v = steepestRoadOf(p, d)
      return v === null ? null : v > standardsOf(p).maxGrade + 1e-6 ? 'over' : 'within'
    },
    flow: true,
    step: 'flow',
  },
]
