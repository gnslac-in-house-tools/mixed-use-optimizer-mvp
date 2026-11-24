// The circulation in the optimizer (Decision "Masses + Circulation", O.7): a gate slides along its boundary side, in metres
// from its corner, written into the option's own gates (the site's stay, and Keep carries them) (the ring roads went
// with ST.4); *Circulation issues* counts what the circulation warns about; the template mixes both stages. Phase 7: a gate's vehicles, the parking, the
// *Circulation* template (the masses frozen) and the plans' *Parking* stage. The demo:
// a south side of 420 m, one 12 m gate 225 m along it (it faces the existing South street), one building (b1).
import { describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import type { Project } from '../../../../model/schema.ts'
import { contourToPolygon } from '../../../../engine/geom/contour.ts'
import { perimeter } from '../../../../engine/geom/perimeter.ts'
import { demoProject } from '../../../../state/demo.ts'
import { modulesOf } from '../../../../modules/catalog.ts'
import { newProject, TYPOLOGIES } from '../../../../typologies/index.ts'
import { blank, planTemplatesOf, stagesFor, templatesFor, turnOn, withTypology } from '../../data.ts'
import { problemOf } from '../problem.ts'
import { reviewOf } from '../review.ts'
import { approve, kindsOf, massesStageBefore, ofCirculation, runTemplateOf, typologyPlan } from '../stages.ts'
import { TemplateSchema, type Template } from '../template.ts'
import { CIRCULATION, DOCKS_STAGE, MASSES_CIRCULATION, PARKING_STAGE, STREETS_STAGE } from '../../../../typologies/plans.ts'
import { MASSES } from './freeMasses.ts'
import { moveMasses } from '../../../../state/actions/masses.ts'
import { addGateOn } from '../../../../state/actions/circulation.ts'
import { drawStreet } from '../../../../state/actions/streets.ts'
import { addWarehouseType } from '../../../../modules/warehouse/actions.ts'

const only = (variables: Template['variables']): Template => ({ ...MASSES, variables })
const gates = only([{ kind: 'gate.position', step: 5 }])

describe('gates', () => {
  it('each gate on a boundary side: metres along it, half its width from each corner; the design reads back', () => {
    const p = demoProject()
    const t = problemOf(p, 'o1', gates)
    expect(t.variables.map((v) => [v.key, v.label])).toEqual([['g1.along', 'Gate 1 · along']])
    const g = t.variables[0].gene
    // the demo's south side runs from (0, 0) to (420, 0): its gate is 12 m wide and 225 m along it
    expect(g.kind === 'real' && [g.min, Math.round(g.max), g.step]).toEqual([6, 414, 5])
    expect(t.variables[0].read(p)).toBeCloseTo(225, 0)
  })

  it('a gate on a street slides along its side (Phase PE.2): metres from its segment’s first node, half its width from each end, `on.at` written', () => {
    const drawn = drawStreet(demoProject({ streets: false }), 'o1', [{ x: 100, y: 150 }, { x: 200, y: 150 }], undefined, 8)!
    const placed = addGateOn(drawn.project, 'o1', { kind: 'street', id: drawn.segments[0], side: 'right', at: 30 })
    const t = problemOf(placed.project, 'o1', gates)
    expect(t.variables.map((v) => v.key)).toEqual(['g1.along', `${placed.id}.along`])
    const g = t.variables[1].gene
    expect(g.kind === 'real' && [g.min, g.max]).toEqual([6, 94])
    expect(t.variables[1].read(placed.project)).toBeCloseTo(30, 6)
    const far = t.decode([225, 400]).options[0].gates!.find((x) => x.id === placed.id)!
    expect(far.t).toBeUndefined()
    expect(far.on).toEqual({ kind: 'street', id: drawn.segments[0], side: 'right', at: 94 })
    expect(t.decode([225, 50]).options[0].gates!.find((x) => x.id === placed.id)!.on!.at).toBe(50)
  })

  it('a gate stops half its width from the corners of its side, and the side is its boundary side whatever street faces it', () => {
    const p = demoProject()
    const t = problemOf(p, 'o1', gates)
    const total = perimeter(contourToPolygon(p.site.boundary!))
    // just past either end of the 420 m south side: 6 m (half the gate) in from the corner (0, 0) and from the corner (420, 0)
    expect(t.decode([-50]).options[0].gates![0].t! * total).toBeCloseTo(6, 6)
    expect(t.decode([430]).options[0].gates![0].t! * total).toBeCloseTo(414, 6)
  })

  it('decoded, the option has its own gates, the gate where the gene says; the site’s stay', () => {
    const p = demoProject()
    const t = problemOf(p, 'o1', gates)
    const q = t.decode([6])
    expect(q.options[0].gates![0].t).toBeCloseTo(6 / perimeter(contourToPolygon(p.site.boundary!)), 9)
    expect(q.site.gates).toEqual(p.site.gates)
    expect(t.variables[0].read(q)).toBeCloseTo(6, 6)
  })
})

describe('a locked gate is not a variable', () => {
  const lockedGate = (p: Project): Project => ({ ...p, site: { ...p.site, gates: p.site.gates!.map((g) => ({ ...g, locked: true })) } })

  it('neither its position nor its vehicles are offered; the free gates still are', () => {
    const p = lockedGate(demoProject())
    expect(problemOf(p, 'o1', gates).variables).toEqual([])
    expect(problemOf(p, 'o1', only([{ kind: 'gate.vehicles', step: 1 }])).variables).toEqual([])
    expect(problemOf(demoProject(), 'o1', gates).variables).toHaveLength(1)
  })
})

describe('a gate’s vehicles (7.3)', () => {
  const t = (p: Project) => problemOf(p, 'o1', only([{ kind: 'gate.vehicles', step: 1 }]))

  it('a choice per gate, trucks · cars · all; the design reads back and leaves the project as it is', () => {
    const p = demoProject()
    const x = t(p)
    expect(x.variables.map((v) => [v.key, v.label, v.gene, v.choices])).toEqual([['g1.vehicles', 'Gate 1 · for', { kind: 'choice', options: 3 }, ['trucks', 'cars', 'all']]])
    const now = x.variables[0].read(p)
    expect(['trucks', 'cars', 'all'][now]).toBe(p.site.gates![0].vehicles)
    expect(x.decode([now]).options[0].gates).toBeUndefined()
  })

  it('decoded to another, into the option’s own gates (the site’s stay); cars only, no truck gets in', () => {
    const p = demoProject()
    const q = t(p).decode([1])
    expect(q.options[0].gates![0].vehicles).toBe('cars')
    expect(q.site.gates).toEqual(p.site.gates)
    expect(t(q).variables[0].read(q)).toBe(1)
    expect(derive(q, 'o1').issues.map((i) => i.message)).toContain('No gate lets trucks in: the docks cannot be reached.')
  })
})

describe('parking (7.3)', () => {
  const t = (p: Project) => problemOf(p, 'o1', only([{ kind: 'parking.side', step: 1 }]))

  it('the option’s side, none · single · double; the design (the standard’s) reads back unchanged', () => {
    const p = demoProject()
    const x = t(p)
    expect(x.variables.map((v) => [v.key, v.label, v.gene])).toEqual([
      ['o1.parking', 'Parking along the roads', { kind: 'choice', options: 3 }],
    ])
    const design = x.variables.map((v) => v.read(p))
    expect(design).toEqual([2])
    expect(x.decode(design)).toEqual(p)
  })

  it('decoded: the option’s side', () => {
    const p = demoProject()
    const x = t(p)
    const q = x.decode([1])
    expect(q.options[0].parking).toBe('single')
    expect(x.variables.map((v) => v.read(q))).toEqual([1])
    const r = x.decode([0])
    expect(r.options[0].parking).toBe('none')
    expect(derive(r, 'o1').circulation.totals.stalls).toBe(0)
  })
})

describe('the Masses + Circulation template', () => {
  it('counts the circulation’s warnings; masses and gates in one genome, nothing missing', () => {
    const p = demoProject()
    const t = problemOf(p, 'o1', MASSES_CIRCULATION)
    expect(t.missing).toEqual([])
    expect(t.objectives.map((o) => o.measure.id)).toEqual(['brief-gap', 'dock-to-gate', 'road-area', 'circulation-issues'])
    expect(new Set(t.variables.map((v) => v.kind))).toEqual(new Set(['mass.rotation', 'mass.position', 'gate.position']))
    // the box of a block (`warehouse.hall`) is in the template, and the demo's plain masses have none (Phase D.2)
    expect(MASSES_CIRCULATION.variables.map((v) => v.kind)).toContain('warehouse.hall')
    const warned = derive(p, 'o1').issues.filter((i) => ['access', 'court', 'gate', 'road'].includes(i.code)).length
    expect(t.measure(p).objectives[3]).toBe(warned)
  })

  it('the typology gives its templates; a project turned on before keeps its own and gains the new one', () => {
    expect(templatesFor('industrial').map((x) => x.id)).toEqual(['masses', 'masses-circulation', 'circulation'])
    const before = { on: true, active: 'masses', templates: [{ ...MASSES, name: 'Mine' }] }
    const d = withTypology(before, 'industrial')
    expect(d.templates.map((x) => [x.id, x.name])).toEqual([
      ['masses', 'Mine'],
      ['masses-circulation', 'Masses + Circulation'],
      ['circulation', 'Circulation'],
    ])
    expect(withTypology(d, 'industrial')).toBe(d)
  })
})

describe('the typology’s templates and plans, as its data (Decision "Catalog")', () => {
  it('every typology’s optimizer data reads with the templates’ schema; a module’s own plan names a module it offers', () => {
    for (const t of TYPOLOGIES) {
      const data = t.plugins?.optimizer as { templates: unknown; stages: unknown; byModule?: { module: string; stages: unknown }[] } | undefined
      expect(data, t.id).toBeDefined()
      const byModule = data!.byModule ?? []
      for (const list of [data!.templates, data!.stages, ...byModule.map((x) => x.stages)]) expect(TemplateSchema.array().safeParse(list).success, t.id).toBe(true)
      for (const x of byModule) expect(modulesOf(t.id), t.id).toContain(x.module)
      expect(templatesFor(t.id)).toEqual(data!.templates)
    }
  })

  it('a new template of the designer’s holds what the industrial Masses template holds, with its budget', () => {
    const d = blank(turnOn('industrial', null))
    const t = d.templates.find((x) => x.id === d.active)!
    expect(t.constraints).toEqual(MASSES.constraints)
    expect(t.budget).toEqual(MASSES.budget)
  })

  it('a typology without data gives no templates and no plan; turned on, a project starts from a blank template', () => {
    const gone = { ...newProject('industrial'), typology: 'gone' }
    expect(templatesFor('gone')).toEqual([])
    expect(stagesFor(gone)).toEqual([])
    expect(stagesFor(addWarehouseType(gone).project)).toEqual([])
    const d = turnOn('gone', null)
    expect(d.templates.map((x) => [x.from, x.variables.map((v) => v.kind)])).toEqual([['user', ['mass.position']]])
    expect(planTemplatesOf(d, gone)).toEqual([])
  })
})

describe('the Circulation template and the Parking stage (7.4)', () => {
  it('the circulation alone, the masses frozen: gates, their vehicles, parking; stalls against the paving', () => {
    const p = demoProject()
    const t = problemOf(p, 'o1', CIRCULATION)
    expect(t.missing).toEqual([])
    expect([...new Set(t.variables.map((v) => v.kind))]).toEqual(['gate.position', 'gate.vehicles', 'parking.side'])
    expect(t.objectives.map((o) => [o.measure.id, o.sense])).toEqual([
      ['stalls', 'max'],
      ['road-area', 'min'],
      ['dock-to-gate', 'min'],
      ['circulation-issues', 'min'],
    ])
    // the design is a seed and decodes to itself; its stalls are the Parking tab's
    expect(t.decode(t.seeds[0]).masses).toEqual(p.masses)
    expect(t.measure(p).objectives[0]).toBe(derive(p, 'o1').circulation.totals.stalls)
    // no parking: fewer stalls (the masses stay where they are)
    const none = t.variables.map((v, i) => (v.kind === 'parking.side' ? 0 : t.seeds[0][i]))
    const q = t.decode(none)
    expect(q.masses).toEqual(p.masses)
    expect(t.measure(q).objectives[0]).toBeLessThan(t.measure(p).objectives[0])
  })

  it('the typology’s plans end in Parking: the option’s side, the roads’ kinds within their margin', () => {
    expect(stagesFor(demoProject()).at(-1)).toEqual(PARKING_STAGE)
    expect(stagesFor(addWarehouseType(demoProject()).project).at(-1)).toEqual(PARKING_STAGE)
    let plan = typologyPlan('o1', stagesFor(demoProject()))
    for (const s of plan.stages.slice(0, -1)) plan = approve(plan, s.id, 'o1')
    const run = runTemplateOf(plan, plan.stages.at(-1)!.id)
    expect(run.variables.filter((v) => v.margin === undefined).map((v) => v.kind)).toEqual(['parking.side'])
    expect(run.variables.filter((v) => ['gate.position', 'gate.vehicles'].includes(v.kind)).map((v) => [v.kind, v.margin])).toEqual([
      ['gate.position', 1],
      ['gate.vehicles', 1],
    ])
    expect(problemOf(demoProject(), 'o1', run).missing).toEqual([])
  })
})

describe('the way back to Massing (7.5)', () => {
  it('each kind says its stage role (the catalog): the kinds that move the masses, the circulation’s', () => {
    expect(kindsOf('masses')).toEqual(new Set(['mass.position', 'mass.rotation', 'mass.proportion', 'dimension.length', 'level.floors', 'warehouse.hall', 'court.depth']))
    expect(kindsOf('circulation')).toEqual(new Set(['gate.position', 'gate.vehicles', 'parking.side', 'road.width', 'streets.connect']))
  })

  it('a stage of the circulation: its own kinds all the circulation’s; the one to go back to, the last that moved the masses', () => {
    expect([STREETS_STAGE, PARKING_STAGE, CIRCULATION].map(ofCirculation)).toEqual([true, true, true])
    expect([MASSES, MASSES_CIRCULATION, DOCKS_STAGE].map(ofCirculation)).toEqual([false, false, false])
    let plan = typologyPlan('o1', stagesFor(demoProject()))
    expect(massesStageBefore(plan, 'stage-5')?.name).toBe('Buildings')
    expect(massesStageBefore(plan, 'stage-4')?.name).toBe('Buildings')
    expect(massesStageBefore(plan, 'stage-2')?.name).toBe('Grid')
    expect(massesStageBefore(plan, 'stage-1')).toBeNull()
    // an earlier stage's kinds in its run, within their margin, leave it the circulation's
    for (const s of plan.stages.slice(0, -1)) plan = approve(plan, s.id, 'o1')
    expect(ofCirculation(runTemplateOf(plan, 'stage-5'))).toBe(true)
  })

  it('its review lists what only the masses can fix (an overlap here); a stage that moves them, and a sound design, nothing', () => {
    const p = moveMasses(demoProject(), ['m2'], { x: -150, y: 0 })
    const side = { project: p, option: 'o1' }
    expect(reviewOf(side, side, PARKING_STAGE).massesOnly.map((i) => i.code)).toEqual(['overlap'])
    expect(reviewOf(side, side, MASSES).massesOnly).toEqual([])
    const sound = { project: demoProject(), option: 'o1' }
    expect(reviewOf(sound, sound, PARKING_STAGE).massesOnly).toEqual([])
  })
})
