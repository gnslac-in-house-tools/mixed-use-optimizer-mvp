// The stage plan (Phase P.1, Decisions "Stages" and "Stages layout"): a single run is a plan of one stage; a stage runs
// on the option the stage before it approved; it moves what earlier stages varied only within its margin (± steps, one
// by default, 0 = frozen); Approve records the option kept, Reopen and any change of order send the later approved
// stages to review again. The margin is the genes' window, so a run template travels to the worker as any template.
import { describe, expect, it } from 'vitest'
import type { Grid, Project } from '../../../../model/schema.ts'
import { setGrid } from '../../../../state/actions/grid.ts'
import { demoProject } from '../../../../state/demo.ts'
import { OptimizerDataSchema, planIn, planTemplatesOf, removePlanTemplate, savePlan, savePlanTemplate, stagesFor, turnOn } from '../../data.ts'
import { within } from '../genes.ts'
import { problemOf } from '../problem.ts'
import {
  addStage,
  approve,
  currentOf,
  duplicateStage,
  editStage,
  inputOf,
  lastAttempt,
  marginsOf,
  moveStage,
  oneStagePlan,
  pickIn,
  planFrom,
  planOf,
  planTemplateOf,
  removeStage,
  reopen,
  runTemplateOf,
  startAttempt,
  statusOf,
  typologyPlan,
  type Plan,
} from '../stages.ts'
import { BUILDINGS_STAGE, DOCKS_STAGE, GRID_STAGE, MASSES_CIRCULATION } from '../../../../typologies/plans.ts'
import { MASSES } from './freeMasses.ts'

const plan = (): Plan => typologyPlan('o1', stagesFor(demoProject()))
const names = (p: Plan) => p.stages.map((s) => s.name)
const statuses = (p: Plan) => p.stages.map((s) => statusOf(p, s.id))

/** The plan with a stage run and approved as `option`. */
function approved(p: Plan, id: string, option: string): Plan {
  return approve(startAttempt(p, id)!, id, option)
}

describe('a gene within its margin', () => {
  it('so many steps either way of its value, on steps from it, inside the gene', () => {
    expect(within({ kind: 'real', min: 7, max: 13, step: 1.5 }, 10, 1)).toEqual({ kind: 'real', min: 8.5, max: 11.5, step: 1.5 })
    // near an end, cut there
    expect(within({ kind: 'real', min: 7, max: 13, step: 1.5 }, 7.5, 2)).toEqual({ kind: 'real', min: 7.5, max: 10.5, step: 1.5 })
    // a value off the gene's steps stays one it can take (the designer typed it)
    expect(within({ kind: 'real', min: 0, max: 100, step: 1 }, 40.4, 1)).toEqual({ kind: 'real', min: 39.4, max: 41.4, step: 1 })
  })

  it('an angle’s window does not wrap; a choice stays as it is', () => {
    expect(within({ kind: 'real', min: 0, max: 360, step: 15, wrap: true }, 0, 1)).toEqual({ kind: 'real', min: -15, max: 15, step: 15 })
    expect(within({ kind: 'real', min: 0, max: 360, step: 15, wrap: true }, 0, 12)).toMatchObject({ wrap: true })
    expect(within({ kind: 'choice', options: 2 }, 1, 1)).toEqual({ kind: 'choice', options: 2 })
  })
})

describe('plans', () => {
  it('a plan of one stage (a single run): its own copy of the template', () => {
    const p = oneStagePlan('o1', MASSES_CIRCULATION)
    expect(p).toMatchObject({ id: 'plan-o1', option: 'o1' })
    expect(names(p)).toEqual(['Masses + Circulation'])
    expect(statuses(p)).toEqual(['todo'])
    // its own copy: the template does not change with it
    expect(p.stages[0].template).not.toBe(MASSES_CIRCULATION)
    // an option with no plan stored gets the fresh one given
    expect(planOf([], 'o1', () => p)).toBe(p)
  })

  it('the typology’s plan: Grid → Buildings → Docks → Streets → Parking, each to do', () => {
    expect(names(plan())).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking'])
    expect(statuses(plan())).toEqual(['todo', 'todo', 'todo', 'todo', 'todo'])
    expect(currentOf(plan())?.name).toBe('Grid')
  })

  it('in the project’s data: the typology’s until it changes, stored once changed, found again by its option or by an option it approved', () => {
    const d = turnOn('industrial', null)
    const p = demoProject()
    expect(planIn(d, 'o1', p)).toEqual(plan())
    expect(planIn(d, 'o1', p).from).toBe('typology')
    // a typology that gives no plan: one stage from the active template
    expect(names(planIn(d, 'o1', { ...p, typology: 'gone' }))).toEqual(['Masses'])
    const stored = savePlan(d, approved(moveStage(plan(), 'stage-3', 0), 'stage-3', 'o9'))
    expect(OptimizerDataSchema.parse(structuredClone(stored))).toEqual(stored)
    expect(names(planIn(stored, 'o1', p))).toEqual(['Docks', 'Grid', 'Buildings', 'Streets', 'Parking'])
    expect(planIn(stored, 'o9', p).id).toBe('plan-o1')
    // it still says the template it came from
    expect(planIn(stored, 'o9', p).from).toBe('typology')
  })
})

describe('a stage, run to approved', () => {
  it('any stage runs (Decision "Free steps"): on the nearest earlier approved option, else the plan’s; approving one sends the later approved ones to review', () => {
    const p = plan()
    expect(inputOf(p, 'stage-1')).toBe('o1')
    // nothing approved: the third runs on the plan's own
    expect(inputOf(p, 'stage-3')).toBe('o1')
    expect(startAttempt(p, 'stage-3')!.stages[2].attempts[0]).toMatchObject({ input: 'o1' })
    expect(inputOf(p, 'nope')).toBeNull()
    const q = approved(p, 'stage-1', 'o2')
    expect(inputOf(q, 'stage-2')).toBe('o2')
    expect(startAttempt(q, 'stage-2')!.stages[1].attempts[0]).toMatchObject({ input: 'o2' })
    // the second not approved: the third runs on what the first kept; approved, on its own
    expect(inputOf(q, 'stage-3')).toBe('o2')
    let r = approved(q, 'stage-3', 'o4')
    expect(inputOf(r, 'stage-4')).toBe('o4')
    // the second approved after it: the third to review again, its input the second's now
    r = approved(r, 'stage-2', 'o3')
    expect(statusOf(r, 'stage-3')).toBe('again')
    expect(inputOf(r, 'stage-3')).toBe('o3')
  })

  it('to do → run (to review; while it runs, the views say so) → approved; the next is the current one', () => {
    let p = startAttempt(plan(), 'stage-1')!
    expect(statusOf(p, 'stage-1')).toBe('review')
    p = pickIn(p, 'stage-1', 23)
    expect(lastAttempt(p, 'stage-1')?.pick).toBe(23)
    expect(pickIn(p, 'stage-1', undefined).stages[0].attempts[0].pick).toBeUndefined()
    p = approve(p, 'stage-1', 'o2', 23)
    expect(p.stages[0].approved).toEqual({ attempt: 0, option: 'o2', specimen: 23 })
    expect(statuses(p)).toEqual(['approved', 'todo', 'todo', 'todo', 'todo'])
    expect(currentOf(p)?.name).toBe('Buildings')
  })

  it('Redo is a new attempt: the earlier ones stay, the last is approved', () => {
    let p = startAttempt(plan(), 'stage-1')!
    p = editStage(p, 'stage-1', { template: { ...p.stages[0].template, budget: { ...p.stages[0].template.budget, seed: 7 } } })
    p = approve(startAttempt(p, 'stage-1')!, 'stage-1', 'o2')
    expect(p.stages[0].attempts.map((a) => a.template.budget.seed)).toEqual([1, 7])
    expect(p.stages[0].approved?.attempt).toBe(1)
  })

  it('by hand: the attempt names the copy of its input the designer works on', () => {
    const p = startAttempt(plan(), 'stage-1', 'o7')!
    expect(lastAttempt(p, 'stage-1')).toMatchObject({ input: 'o1', worked: 'o7' })
    expect(lastAttempt(plan(), 'stage-1')).toBeNull()
  })

  it('Reopen takes the approval back and sends the approved ones after it to review again', () => {
    let p = approved(approved(plan(), 'stage-1', 'o2'), 'stage-2', 'o3')
    p = reopen(p, 'stage-1')
    expect(statuses(p)).toEqual(['review', 'again', 'todo', 'todo', 'todo'])
    expect(currentOf(p)?.name).toBe('Grid')
    // approved again, it reads approved; the later one waits for its review
    p = approve(p, 'stage-1', 'o4')
    expect(statuses(p)).toEqual(['approved', 'again', 'todo', 'todo', 'todo'])
    expect(approve(p, 'stage-2', 'o5').stages[1].again).toBeUndefined()
  })
})

describe('the margin over earlier stages', () => {
  it('a later stage gets each kind earlier ones varied and it does not, one step by default', () => {
    const p = approved(plan(), 'stage-1', 'o1')
    // Buildings moves the masses itself: the grid's kinds are its margin
    expect(marginsOf(p, 'stage-2').map((m) => [m.kind, m.margin])).toEqual([
      ['grid.angle', 1],
      ['grid.origin', 1],
    ])
    expect(runTemplateOf(p, 'stage-2').variables.map((v) => [v.kind, v.margin])).toEqual([
      ...BUILDINGS_STAGE.variables.map((v) => [v.kind, undefined]),
      ['grid.angle', 1],
      ['grid.origin', 1],
    ])
    // Docks: the grid's and the buildings'
    expect(marginsOf(p, 'stage-3').map((m) => m.kind)).toEqual(['grid.angle', 'grid.origin', 'mass.position', 'mass.rotation', 'warehouse.hall', 'platform.level'])
  })

  it('a margin of 0 freezes a kind (left out of the run); more steps widen it', () => {
    const p = editStage(plan(), 'stage-2', { margin: { 'grid.angle': 0, 'grid.origin': 2 } })
    const kinds = runTemplateOf(p, 'stage-2').variables.filter((v) => v.margin !== undefined)
    expect(kinds.map((v) => [v.kind, v.margin])).toEqual([['grid.origin', 2]])
  })

  it('in a run: an earlier stage’s genes only so many steps either way of what it approved', () => {
    const grid: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }
    const project: Project = setGrid(demoProject(), grid)
    const p = approved(plan(), 'stage-1', 'o1')
    const t = problemOf(project, 'o1', runTemplateOf(p, 'stage-2'))
    const gene = (key: string) => t.variables.find((v) => v.key === key)!.gene
    // the angle ±1 step of 5° around 0°; the bays are each program's, not the stage's (Decision "Program rule set")
    expect(gene('grid.angle')).toEqual({ kind: 'real', min: -5, max: 5, step: 5 })
    expect(t.variables.some((v) => v.key === 'grid.x')).toBe(false)
    // the stage's own kinds as its template says: the masses anywhere on the grid
    expect(gene('m1.x')).toMatchObject({ step: 2.5 })
    expect((gene('m1.x') as { max: number }).max).toBeGreaterThan(20)
    // the design itself is a seed, inside every window
    expect(t.seeds[0][t.variables.findIndex((v) => v.key === 'grid.angle')]).toBe(0)
  })
})

describe('editing the plan', () => {
  it('adding, moving or removing a stage sends the approved ones after the change to review again', () => {
    const p = approved(approved(plan(), 'stage-1', 'o2'), 'stage-2', 'o3')
    expect(statuses(addStage(p, DOCKS_STAGE, 1))).toEqual(['approved', 'todo', 'again', 'todo', 'todo', 'todo'])
    expect(statuses(addStage(p, DOCKS_STAGE))).toEqual(['approved', 'approved', 'todo', 'todo', 'todo', 'todo'])
    const moved = moveStage(p, 'stage-4', 0)
    expect(names(moved)).toEqual(['Streets', 'Grid', 'Buildings', 'Docks', 'Parking'])
    expect(statuses(moved)).toEqual(['todo', 'again', 'again', 'todo', 'todo'])
    expect(statuses(removeStage(p, 'stage-1'))).toEqual(['again', 'todo', 'todo', 'todo'])
    expect(statuses(removeStage(p, 'stage-4'))).toEqual(['approved', 'approved', 'todo', 'todo'])
  })

  it('the last stage stays; a new one gets an id of its own', () => {
    const one = oneStagePlan('o1', GRID_STAGE)
    expect(removeStage(one, 'stage-1')).toBe(one)
    const two = addStage(one, MASSES)
    expect(two.stages.map((s) => s.id)).toEqual(['stage-1', 'stage-2'])
    expect(addStage(removeStage(addStage(two, MASSES), 'stage-2'), MASSES).stages.map((s) => s.id)).toEqual(['stage-1', 'stage-3', 'stage-4'])
  })

  it('a duplicate goes after it: its parameters, who works it and its margin, nothing run', () => {
    let p = editStage(approved(plan(), 'stage-1', 'o2'), 'stage-2', { by: 'agent', aim: 'Shorter truck routes', margin: { 'grid.bay': 0 } })
    p = duplicateStage(p, 'stage-1')
    expect(names(p)).toEqual(['Grid', 'Grid copy', 'Buildings', 'Docks', 'Streets', 'Parking'])
    expect(p.stages[1]).toMatchObject({ by: 'optimizer', attempts: [] })
    expect(p.stages[1].approved).toBeUndefined()
    const q = duplicateStage(p, 'stage-2')
    expect(q.stages[3]).toMatchObject({ name: 'Buildings copy', by: 'agent', aim: 'Shorter truck routes', margin: { 'grid.bay': 0 } })
  })
})

describe('plan templates', () => {
  it('a plan as a template: its stages’ settings in order, nothing run; a plan from it starts fresh', () => {
    let p = editStage(approved(plan(), 'stage-1', 'o2'), 'stage-2', { by: 'agent', aim: 'Shorter truck routes', margin: { 'grid.bay': 0 } })
    p = moveStage(p, 'stage-4', 1)
    const t = planTemplateOf(p, 'plan-template-1', 'Mine')
    expect(t.stages.map((s) => s.name)).toEqual(['Grid', 'Streets', 'Buildings', 'Docks', 'Parking'])
    expect(t.stages[2]).toEqual({ name: 'Buildings', by: 'agent', template: p.stages[2].template, aim: 'Shorter truck routes', margin: { 'grid.bay': 0 } })
    expect(JSON.stringify(t)).not.toMatch(/attempts|approved|again/)
    const q = planFrom('o3', t)
    expect(q).toMatchObject({ id: 'plan-o3', option: 'o3' })
    expect(q.stages.map((s) => s.id)).toEqual(['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'])
    expect(q.stages[2]).toMatchObject({ name: 'Buildings', by: 'agent', aim: 'Shorter truck routes', margin: { 'grid.bay': 0 }, attempts: [] })
    expect(statuses(q)).toEqual(['todo', 'todo', 'todo', 'todo', 'todo'])
  })

  it('in the data: the typology’s first, then the designer’s, named after their stages, a number when taken', () => {
    const d = turnOn('industrial', null)
    expect(planTemplatesOf(d, demoProject()).map((t) => t.name)).toEqual(['The typology’s plan'])
    expect(planFrom('o1', planTemplatesOf(d, demoProject())[0])).toEqual(plan())
    const once = savePlanTemplate(d, plan())
    const twice = savePlanTemplate(once, plan())
    expect(planTemplatesOf(twice, demoProject()).map((t) => [t.id, t.name, t.from])).toEqual([
      ['typology', 'The typology’s plan', 'typology'],
      ['plan-template-1', 'Grid → Buildings → Docks → Streets → Parking', 'user'],
      ['plan-template-2', 'Grid → Buildings → Docks → Streets → Parking 2', 'user'],
    ])
    expect(OptimizerDataSchema.parse(twice)).toEqual(twice)
    expect(removePlanTemplate(twice, 'plan-template-1').planTemplates!.map((t) => t.id)).toEqual(['plan-template-2'])
  })
})
