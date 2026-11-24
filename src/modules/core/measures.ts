// The core's measures (Decisions "Optimizer plugin" and "Catalog"): what a search of any project needs and the KPI strip
// does not show. Until Phase M.8 the circulation is core, so its warnings and the room for a road are here.
//   brief-gap          Σ |area − target| of the programs the brief gives an area                         m²
//   rules-gap          Σ weight × gap of the rules that are not required (a near, an adjacent…)          m
//   required-gap       Σ gap of the required rules                                                       m
//   free-ground        the largest free rectangle of the buildable area, on the site's main axis, clear
//                      of the masses and their courts: room for parking or an extension                   m²
//   circulation-issues what the circulation warns about: a gate no road reaches, docks no
//                      truck gate reaches, a court off the site or into a mass, a road over a mass or a
//                      dead end (Decision "Masses + Circulation")                                         count
//   outside-buildable  Σ built footprint outside the buildable area                                       m²
//   overlap            Σ overlap of the built masses that clash                                           m²
//   coverage-over      the built footprint over the site's maximum coverage                               m²
//   road-room          Σ, pair by pair of built masses apart but closer than a road with its two
//                      clearances (a gap no road fits in), what is missing; pairs a rule wants together
//                      (adjacent, attached, near) are left out                                            m
import { massesOfOption, optionOf } from '../../engine/buildings.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { difference, intersection, regionsArea } from '../../engine/geom/boolean.ts'
import { rings } from '../../engine/geom/holes.ts'
import { bounds, boundsTouch } from '../../engine/geom/polygon.ts'
import { polygonDistance } from '../../engine/graph/relations.ts'
import { clash } from '../../engine/massing/checks.ts'
import { courtShapes, type DerivedMass } from '../../engine/types.ts'
import type { Project } from '../../model/schema.ts'
import { AREA_TOL, largestFree, optionMasses, type Evaluated, type Measure } from '../measure.ts'

const designMasses = (e: Evaluated): DerivedMass[] =>
  massesOfOption(e.project, e.ctx.option)
    .map((m) => e.derived.masses[m.id])
    .filter((m): m is DerivedMass => !!m && !m.context && m.polygon.length >= 3)

const requiredRules = (p: Project) => new Set((p.rules ?? []).filter((r) => r.required).map((r) => r.id))

/** The Issues the circulation raises (engine/circulation/index.ts). */
const CIRCULATION_CODES = new Set(['access', 'court', 'gate', 'road'])

export const CORE_MEASURES: Measure[] = [
  {
    id: 'brief-gap',
    area: 'massing',
    aim: false,
    rank: 0,
    label: 'Brief Δ',
    unit: 'm2',
    help: 'How far each program’s area is from the brief’s, summed',
    read: (e) =>
      e.project.programs.reduce((s, g) => (g.target?.area ? s + Math.abs((e.derived.metrics.areaByProgram[g.id] ?? 0) - g.target.area) : s), 0),
  },
  {
    id: 'rules-gap',
    area: 'massing',
    aim: false,
    rank: 1,
    label: 'Rules gap',
    unit: 'm',
    help: 'How far the rules that are not required are from met, each by its weight',
    read: (e) => {
      const req = requiredRules(e.project)
      return e.derived.relations.reduce((s, r) => (req.has(r.rule) ? s : s + r.weight * r.gap), 0)
    },
  },
  {
    id: 'required-gap',
    area: 'massing',
    aim: false,
    rank: 2,
    label: 'Required rules gap',
    unit: 'm',
    help: 'How far the required rules are from met',
    read: (e) => {
      const req = requiredRules(e.project)
      return e.derived.relations.reduce((s, r) => (req.has(r.rule) ? s + r.gap : s), 0)
    },
  },
  {
    id: 'free-ground',
    area: 'massing',
    aim: false,
    rank: 4,
    label: 'Free ground',
    unit: 'm2',
    help: 'The largest free rectangle of the buildable area, clear of the masses and their courts',
    read: (e) => (e.ctx.grid ? largestFree(e.ctx.grid, [...optionMasses(e).map((m) => m.polygon), ...e.derived.circulation.docks.flatMap(courtShapes)]) : 0),
  },
  {
    id: 'circulation-issues',
    area: 'flow',
    aim: false,
    rank: 5,
    label: 'Circulation issues',
    unit: 'count',
    help: 'What the circulation warns about: docks no truck gate reaches, a court off the site or into a mass, a road over a mass, a dead end, a gate that leads nowhere',
    read: (e) => e.derived.issues.filter((i) => CIRCULATION_CODES.has(i.code)).length,
    flow: true,
  },
  {
    id: 'outside-buildable',
    area: 'massing',
    aim: false,
    rank: 6,
    label: 'Outside the buildable area',
    unit: 'm2',
    help: 'Built footprint outside the buildable area, summed',
    read: (e) => {
      const zone = e.derived.site.buildable.flat()
      return designMasses(e)
        .filter((m) => m.built)
        .reduce((s, m) => {
          const out = regionsArea(difference(rings(m), zone))
          return out > AREA_TOL ? s + out : s
        }, 0)
    },
  },
  {
    id: 'overlap',
    area: 'massing',
    aim: false,
    rank: 7,
    label: 'Overlap',
    unit: 'm2',
    help: 'How much the built masses that clash overlap, summed',
    read: (e) => {
      const built = optionMasses(e).filter((m) => m.built)
      const boxes = built.map((m) => bounds(m.polygon))
      let s = 0
      for (let i = 0; i < built.length; i++)
        for (let j = i + 1; j < built.length; j++) {
          if (!clash(built[i], built[j]) || !boundsTouch(boxes[i], boxes[j], 0)) continue
          const o = regionsArea(intersection(rings(built[i]), rings(built[j])))
          if (o > AREA_TOL) s += o
        }
      return s
    },
  },
  {
    id: 'coverage-over',
    area: 'massing',
    aim: false,
    rank: 8,
    label: 'Coverage over the maximum',
    unit: 'm2',
    help: 'Built footprint over what the site’s maximum coverage allows',
    read: (e) => {
      const max = e.project.site.rules.maxCoverage
      return max === null ? 0 : Math.max(0, e.derived.metrics.builtFootprint - max * e.derived.metrics.siteArea)
    },
  },
  {
    id: 'road-room',
    area: 'flow',
    aim: false,
    rank: 10,
    label: 'Room for a road',
    unit: 'm',
    help: 'Between built masses apart but too close for a road and its clearances, what is missing, summed',
    read: (e) => {
      const st = standardsOf(e.project, optionOf(e.project, e.ctx.option.id))
      const need = st.roadWidth + 2 * st.ringClear
      const together = new Set(
        e.derived.relations.filter((r) => r.kind === 'adjacent' || r.kind === 'attached' || r.kind === 'near').map((r) => [r.a, r.b].sort().join('|')),
      )
      const built = designMasses(e).filter((m) => m.built)
      let s = 0
      for (let i = 0; i < built.length; i++)
        for (let j = i + 1; j < built.length; j++) {
          if (together.has([built[i].id, built[j].id].sort().join('|'))) continue
          const gap = polygonDistance(built[i].polygon, built[j].polygon)
          if (gap > 1e-6 && gap < need) s += need - gap
        }
      return s
    },
  },
]
