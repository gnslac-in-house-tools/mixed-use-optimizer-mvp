// derive(project): THE single entry point of the engine. Project (decisions) in, Derived (everything computed) out.
//
// Pattern borrowed from Plaza-Practiko `motores/derivar.ts`:
// - Pure: same project → same result. No React, no store, no DOM. The UI, an MCP tool and an optimizer all call it.
// - Steps run in a fixed order; each step only reads the results of the steps before it.
// - A failure in one mass becomes an Issue for that mass; the others keep going.
//
// Two parts (Phase C.1, Decision "Flow step"), as the steps Massing and Flow:
//   deriveMassing     1 site → 2 masses → 3 per option: metrics, the brief's rules on its masses (the graph), its docks
//                     and truck courts, its platforms and their earthwork (Decision "Platforms"), and checks, the
//                     ground's (Decision "Terrain") and the brief's counts among them (Decision "Brief issues"); on
//                     the structural grid, the doors by pattern against the brief's (G.3)
//                     → 4 per building: its figures
//   withCirculation   5 per option, on top of it: its exterior circulation (Decision "Exterior circulation": access,
//                     roads, parking), its design roads graded on the ground (Decision "Graded roads") and what it breaks
//   derive            both: what the app, the tools and the checks read
// The masses' part never reads the circulation, so a reader of the masses alone (the optimizer's masses' measures)
// skips the roads, the costly part.
// Options (Decision "Buildings and options"): every option is measured and checked on its own (two options overlap on
// the site on purpose). `metrics` and `issues` are the asked option's (the app's active one); `options` has all.
import type { Id, Project } from '../model/schema.ts'
import { buildingOf, optionOf } from './buildings.ts'
import { footprintPolygon } from './geom/footprint.ts'
import { corridorsIn, holesIn } from './geom/holes.ts'
import { area } from './geom/polygon.ts'
import { massSpan } from './levels.ts'
import { standardsOf } from './circulation/standards.ts'
import { circulationIssues, courtIssues, deriveCirculation, deriveDockSet, doorIssues } from './circulation/index.ts'
import { demandIssues, demandOf } from '../modules/parking/engine/demand.ts'
import { checkBuildable, checkCoverage, checkOverlap, checkSite } from './massing/checks.ts'
import { applyRules, ruleIssues } from './graph/relations.ts'
import { briefIssues } from './brief.ts'
import { rangeIssues } from '../modules/warehouse/engine/range.ts'
import { measure, measureBuilding } from './massing/metrics.ts'
import { deriveSite } from './massing/site.ts'
import { roadGradeIssues, terrainIssues } from '../modules/terrain/engine/checks.ts'
import { gradeRoads } from '../modules/terrain/engine/roads.ts'
import { derivePlatforms } from '../modules/terrain/engine/platforms.ts'
import { surfaceOf } from '../modules/terrain/engine/surface.ts'
import type { BuildingFigures, Derived, DerivedMass, Issue, MassingDerived, MassingResult, OptionResult } from './types.ts'

/** `option`: the one `metrics` and `issues` are about (absent or unknown: the first). */
export function derive(project: Project, option?: Id | null): Derived {
  return withCirculation(project, deriveMassing(project, option))
}

/** The masses an option shows, its context's too. */
const shownBy = (m: MassingDerived, buildingIds: Id[]) => Object.values(m.masses).filter((x) => buildingIds.includes(x.buildingId))

/**
 * The masses' part with every option's circulation on top. Its Issues go before the brief's, which stay last.
 * `network` false: each option's access alone (gates, docks), no roads, stalls or circulation Issues.
 */
export function withCirculation(project: Project, m: MassingDerived, { network = true }: { network?: boolean } = {}): Derived {
  const options: Record<Id, OptionResult> = {}
  for (const o of project.options) {
    const r = m.options[o.id]
    const shown = shownBy(m, o.buildingIds)
    const circulation = deriveCirculation(project, o, m.site, shown, r.docks, network)
    const ground = project.site.terrain ? surfaceOf(project.site.terrain) : null
    const roadGrading = network ? gradeRoads(project, circulation.roads, ground, r.earthwork) : null
    const demand = demandOf(project, r.metrics.areaByProgram, circulation.docks)
    const flow = network
      ? [...circulationIssues(circulation, shown), ...roadGradeIssues(project, roadGrading), ...demandIssues(demand, circulation.totals.stalls)]
      : []
    const issues = flow.length ? [...r.issues.filter((i) => i.code !== 'brief'), ...flow, ...r.issues.filter((i) => i.code === 'brief')] : r.issues
    options[o.id] = { ...r, issues, circulation, roadGrading }
  }
  const own = options[m.option]
  return { ...m, options, issues: own.issues, circulation: own.circulation, roadGrading: own.roadGrading }
}

/** The masses' part (Massing's): everything but the roads and the circulation's Issues. */
export function deriveMassing(project: Project, option?: Id | null): MassingDerived {
  const geometry: Issue[] = []

  // 1. Site: boundary polygon and buildable area.
  const site = deriveSite(project.site, standardsOf(project).laneWidth)

  // 2. Masses: footprint → polygon. A program decides whether the mass is built (defaults to built).
  const programs = new Map(project.programs.map((p) => [p.id, p]))
  const masses: Record<string, DerivedMass> = {}
  for (const m of project.masses) {
    const built = (m.programId ? programs.get(m.programId)?.built : undefined) ?? true
    const b = buildingOf(project, m)
    const base = { id: m.id, name: m.name, levelId: m.levelId, buildingId: b.id, context: b.context === true, span: massSpan(project, m), built }
    try {
      const polygon = footprintPolygon(m.footprint)
      const { holes, outside } = holesIn(m.holes, polygon)
      const corridors = corridorsIn(m.holes, polygon, holes)
      masses[m.id] = { ...base, polygon, holes, corridors, area: holes.reduce((s, h) => s - area(h), area(polygon)) }
      if (outside > 0)
        geometry.push({
          code: 'hole',
          severity: 'warning',
          massIds: [m.id],
          message: `${m.name}: ${outside === 1 ? 'a hole goes' : `${outside} holes go`} past its outline; only the part inside counts.`,
        })
    } catch (e) {
      masses[m.id] = { ...base, polygon: [], holes: [], corridors: [], area: 0 }
      geometry.push({
        code: 'invalid-geometry',
        severity: 'error',
        massIds: [m.id],
        message: `${m.name}: ${e instanceof Error ? e.message : 'invalid footprint'}.`,
      })
    }
  }
  const list = Object.values(masses)

  const names: Record<Id, string> = Object.fromEntries(list.map((m) => [m.id, m.name]))
  const programOf = new Map(project.masses.map((m) => [m.id, m.programId]))

  // 3. Per option: its design masses are measured; they are checked against each other and its context.
  const rules = project.site.rules
  const surface = project.site.terrain ? surfaceOf(project.site.terrain) : null
  const options: Record<Id, MassingResult> = {}
  for (const o of project.options) {
    const shown = list.filter((m) => o.buildingIds.includes(m.buildingId))
    const design = shown.filter((m) => !m.context)
    const metrics = measure(site, design, project)
    const ids = new Set(shown.map((m) => m.id))
    // the brief's rules on its design masses
    const relations = applyRules(project, design.map((m) => ({ id: m.id, programId: programOf.get(m.id) ?? null, polygon: m.polygon })))
    const docks = deriveDockSet(project, site, shown, o.id)
    const earthwork = derivePlatforms(project, surface, shown, docks.docks, site.polygon)
    options[o.id] = {
      metrics,
      relations,
      docks,
      earthwork,
      issues: [
        ...geometry.filter((i) => i.massIds.some((id) => ids.has(id))),
        ...checkSite(site),
        ...checkBuildable(site, design, rules),
        ...checkOverlap(shown),
        ...checkCoverage(metrics, rules),
        ...ruleIssues(project, relations, names),
        ...courtIssues(docks, site, shown),
        ...doorIssues(project, docks, shown),
        ...terrainIssues(project, earthwork, surface, design),
        ...rangeIssues(project, o.buildingIds),
        ...briefIssues(project, { metrics }, (programId) => design.filter((m) => programOf.get(m.id) === programId).map((m) => m.id)),
      ],
    }
  }

  // 4. Per building: its own figures, whatever option shows it.
  const buildings: Record<Id, BuildingFigures> = {}
  for (const b of project.buildings) buildings[b.id] = measureBuilding(list.filter((m) => m.buildingId === b.id), project)

  const active = optionOf(project, option).id
  const own = options[active]
  return {
    site,
    masses,
    option: active,
    metrics: own.metrics,
    issues: own.issues,
    options,
    buildings,
    relations: own.relations,
    docks: own.docks,
    earthwork: own.earthwork,
  }
}

/**
 * The same result as seen from another option: its `metrics` and `issues` (Compare reads every option's KPIs this
 * way, without deriving again). An unknown option: the result as it is.
 */
export function asOption(d: Derived, option: Id): Derived {
  const o = d.options[option]
  return o
    ? {
        ...d,
        option,
        metrics: o.metrics,
        issues: o.issues,
        relations: o.relations,
        docks: o.docks,
        earthwork: o.earthwork,
        circulation: o.circulation,
        roadGrading: o.roadGrading,
      }
    : d
}
